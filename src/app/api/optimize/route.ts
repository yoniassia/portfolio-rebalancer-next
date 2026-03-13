export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureFreshSession, buildSessionCookie } from '@/lib/auth';
import { equalWeight } from '@/engine/optimizer/equal-weight';
import { minVariance } from '@/engine/optimizer/min-variance';
import { riskParity } from '@/engine/optimizer/risk-parity';
import { mvo } from '@/engine/optimizer/mvo';
import { dot, matVec } from '@/engine/optimizer/matrix-math';
import { marketCapWeight } from '@/engine/optimizer/market-cap';
import { fetchCandidates, correlationPreScreen, iterativePrune, scoreDiversification, type CandidateInstrument } from '@/engine/optimizer/sparse-expansion';
import type { OptimizationMethod, PortfolioHolding, OptimizationResult, BacktestResult } from '@/types/rebalancer';
import { runSimpleRebalanceBacktest } from '@/engine/backtest/simple-rebalance';
import type { BacktestInstrument, CandleDay } from '@/engine/backtest/simple-rebalance';
import { upsertInstruments, bulkInsertPrices, computeAndStoreReturns } from '@/lib/returns-db';
import { getOrComputeOptimizationData } from '@/lib/matrix-cache';

const ETORO_BASE = 'https://public-api.etoro.com/api/v1';
const CRYPTO_TYPE_IDS = new Set([11, 12, 100]);
const CANDLE_CONCURRENCY = 5;

interface OptimizeBody {
  directHoldings: PortfolioHolding[];
  copyInstrumentIds?: number[];
  method?: OptimizationMethod;
  m?: number;
  riskAversion?: number;
  assetTypeFilter?: number[];
  investmentObjective?: 'preserve' | 'balanced' | 'growth';
}

interface OptimizeInstrument {
  instrumentId: number;
  symbol: string;
  instrumentTypeId: number;
  isExisting: boolean;
  popularityScore?: number;
  momentumScore?: number;
}

interface CandlePoint {
  date: string;
  close: number;
}

async function fetchCandleHistory(instrumentId: number, apiKey: string, userKey: string): Promise<CandlePoint[]> {
  const res = await fetch(`${ETORO_BASE}/market-data/instruments/${instrumentId}/history/candles/desc/OneDay/756`, {
    headers: {
      'x-api-key': apiKey,
      'x-user-key': userKey,
      'x-request-id': randomUUID(),
    },
  });

  if (!res.ok) throw new Error(`Candle fetch failed: ${res.status}`);

  const data = await res.json();
  const candles = data?.candles?.[0]?.candles ?? data?.candles ?? [];
  return candles
    .map((c: { fromDate?: string; date?: string; close?: number }) => ({
      date: String(c.fromDate ?? c.date ?? '').slice(0, 10),
      close: typeof c.close === 'number' ? c.close : 0,
    }))
    .filter((c: CandlePoint) => c.date.length === 10 && c.close > 0);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current]!, current);
    }
  });
  await Promise.all(runners);
  return results;
}

function normalize(weights: number[]): number[] {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return weights.length > 0 ? weights.map(() => 1 / weights.length) : [];
  return weights.map((value) => value / sum);
}

function inferObjective(method: string): 'preserve' | 'balanced' | 'growth' {
  if (method === 'min-variance') return 'preserve';
  if (method === 'mvo' || method === 'market-cap') return 'growth';
  return 'balanced';
}

export async function POST(req: NextRequest) {
  const sessionResult = await ensureFreshSession(req.headers.get('cookie'));
  if (!sessionResult) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { session, newCookie } = sessionResult;
    const body = (await req.json()) as OptimizeBody;
    const directHoldings = body.directHoldings ?? [];
    const method = body.method ?? 'equal-weight';
    const m = body.m ?? 5;
    const riskAversion = body.riskAversion ?? 2.5;

    if (directHoldings.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 direct holdings' }, { status: 422 });
    }

    const n = directHoldings.length;
    const maxWeight = m === 0 ? 1 / n : 1 / ((m + n) / 2);
    const minWeight = m === 0 ? 1 / (n * 2) : 1 / ((m + n) * 2);
    const apiKey = process.env.ETORO_API_KEY ?? '';
    const userKey = process.env.ETORO_USER_KEY ?? '';

    let candidates: CandidateInstrument[] = [];
    if (m > 0) {
      try {
        const directIds = directHoldings.map((h) => h.instrumentId);
        const copyIds = body.copyInstrumentIds ?? [];
        const heldIds = [...directIds, ...copyIds];
        const heldTypeIds = directHoldings.map((h) => h.instrumentTypeId ?? 5);

        const stage1 = await fetchCandidates({
          heldInstrumentIds: new Set(heldIds),
          heldInstrumentTypeIds: heldTypeIds,
          m,
          assetTypeIds: body.assetTypeFilter,
          investmentObjective: inferObjective(method),
          apiKey,
          userKey,
        });
        console.log(`[optimize] fetchCandidates returned ${stage1.length} candidates (top: ${stage1.slice(0, 3).map(c => c.symbol).join(', ')})`);

        const targetCount = Math.min(m + 3, 12);
        candidates = await correlationPreScreen(
          stage1,
          heldIds,
          { apiKey, userKey },
          targetCount,
        );
        console.log(`[optimize] correlationPreScreen returned ${candidates.length} candidates`);
      } catch (e) {
        console.error(`[optimize] Candidate fetch failed: ${e instanceof Error ? e.message : e}`);
        candidates = [];
      }
    }

    // Resolve ALL instrument symbols + display names server-side (direct + candidates)
    const allIds = [
      ...directHoldings.map((h) => h.instrumentId),
      ...candidates.map((c) => c.instrumentId),
    ];
    const resolvedSymbols: Record<number, string> = {};
    const resolvedNames: Record<number, string> = {};
    if (allIds.length > 0 && apiKey) {
      try {
        const uniqueIds = [...new Set(allIds)];
        for (let i = 0; i < uniqueIds.length; i += 100) {
          const batch = uniqueIds.slice(i, i + 100);
          const res = await fetch(
            `${ETORO_BASE}/market-data/instruments?instrumentIds=${batch.join(',')}`,
            { headers: { 'x-api-key': apiKey, 'x-user-key': userKey, 'x-request-id': randomUUID() } },
          );
          if (!res.ok) continue;
          const data = await res.json();
          for (const inst of data?.instrumentDisplayDatas ?? []) {
            const id = inst.instrumentID ?? inst.instrumentId;
            if (inst.symbolFull) resolvedSymbols[id] = inst.symbolFull;
            if (inst.instrumentDisplayName) resolvedNames[id] = inst.instrumentDisplayName;
          }
        }
        console.log(`[optimize] Resolved ${Object.keys(resolvedSymbols).length}/${uniqueIds.length} symbols, ${Object.keys(resolvedNames).length} display names`);
      } catch (e) {
        console.warn(`[optimize] Symbol resolution failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    const allInstruments: OptimizeInstrument[] = [
      ...directHoldings.map((holding) => ({
        instrumentId: holding.instrumentId,
        symbol: resolvedSymbols[holding.instrumentId] ?? holding.symbol,
        instrumentTypeId: holding.instrumentTypeId ?? 5,
        isExisting: true,
      })),
      ...candidates.map((candidate) => ({
        instrumentId: candidate.instrumentId,
        symbol: candidate.symbol,
        instrumentTypeId: candidate.instrumentTypeId,
        isExisting: false,
        popularityScore: candidate.popularityScore,
        momentumScore: candidate.momentumScore,
      })),
    ];

    // Register all instruments in DB for tracking
    try {
      upsertInstruments(allInstruments.map(inst => ({
        instrumentId: inst.instrumentId,
        symbol: inst.symbol,
        instrumentTypeId: inst.instrumentTypeId,
      })));
    } catch (e) {
      console.warn('[optimize] DB instrument registration failed (non-fatal):', e instanceof Error ? e.message : e);
    }

    // ── Try cached optimization data first ──────────────────
    const cacheInstrumentIds = allInstruments.map(inst => inst.instrumentId);
    let cachedData: ReturnType<typeof getOrComputeOptimizationData> = null;
    let usedCache = false;

    try {
      cachedData = getOrComputeOptimizationData(cacheInstrumentIds, 252);
    } catch (e) {
      console.warn('[optimize] Cache lookup failed (non-fatal):', e instanceof Error ? e.message : e);
    }

    let validInstruments: OptimizeInstrument[];
    let dailyReturns: number[][];
    let nAssets: number;
    let obs: number;
    let tradingDays: number[];
    let meanReturns: number[];
    let covReg: number[][];
    let volatilities: number[];
    let correlationMatrix: number[][];
    let missingInstruments: string[];
    // valid + commonDates needed for backtest — hold candle data
    let valid: Array<{ instrument: OptimizeInstrument; candles: CandlePoint[] }> = [];
    let commonDates: string[] = [];

    if (cachedData && cachedData.instrumentIds.length >= 2 && cachedData.dataPoints >= 30) {
      // ── CACHE HIT — skip eToro candle API entirely ──────
      usedCache = true;
      console.log(`[optimize] CACHE HIT: ${cachedData.instrumentIds.length} instruments, ${cachedData.dataPoints} data points, fromCache=${cachedData.fromCache}`);

      const cachedIdSet = new Set(cachedData.instrumentIds);
      validInstruments = allInstruments.filter(inst => cachedIdSet.has(inst.instrumentId));
      // Re-order to match cache order
      const idOrderMap = new Map(cachedData.instrumentIds.map((id, i) => [id, i]));
      validInstruments.sort((a, b) => (idOrderMap.get(a.instrumentId) ?? 0) - (idOrderMap.get(b.instrumentId) ?? 0));

      dailyReturns = cachedData.dailyReturns;
      nAssets = cachedData.instrumentIds.length;
      obs = cachedData.dataPoints;
      tradingDays = cachedData.tradingDays;
      meanReturns = cachedData.meanReturns;
      covReg = cachedData.covarianceMatrix;
      volatilities = cachedData.volatilities;
      correlationMatrix = cachedData.correlationMatrix;
      missingInstruments = cachedData.missingInstruments;
    } else {
      // ── CACHE MISS — fetch candles from eToro API ──────
      console.log('[optimize] CACHE MISS — fetching candles from eToro API');
      missingInstruments = [];

      const candleResults = await mapWithConcurrency(allInstruments, CANDLE_CONCURRENCY, async (instrument) => {
        try {
          const candles = await fetchCandleHistory(instrument.instrumentId, apiKey, userKey);
          return { instrument, candles };
        } catch (e) {
          console.warn(`[optimize] Candle fetch failed for ${instrument.symbol} (${instrument.instrumentId}): ${e instanceof Error ? e.message : e}`);
          missingInstruments.push(instrument.symbol);
          return { instrument, candles: [] as CandlePoint[] };
        }
      });

      for (const r of candleResults) {
        const first = r.candles[0]?.date ?? 'N/A';
        const last = r.candles[r.candles.length - 1]?.date ?? 'N/A';
        console.log(`[optimize] Candles: ${r.instrument.symbol} (${r.instrument.instrumentId}) → ${r.candles.length} days [${first} … ${last}]`);
      }

      // Store fetched candles into DB for future cache hits
      try {
        for (const r of candleResults) {
          if (r.candles.length > 0) {
            bulkInsertPrices(r.instrument.instrumentId, r.candles);
            computeAndStoreReturns(r.instrument.instrumentId);
          }
        }
      } catch (e) {
        console.warn('[optimize] DB price storage failed (non-fatal):', e instanceof Error ? e.message : e);
      }

      valid = candleResults.filter((entry) => entry.candles.length >= 30);
      if (valid.length < 2) {
        return NextResponse.json({ error: `Not enough instruments with candle data (need 30+ days each). Got: ${candleResults.map(r => `${r.instrument.symbol}=${r.candles.length}`).join(', ')}`, missingInstruments }, { status: 422 });
      }

      const MIN_ALIGNED = 30;
      for (let attempt = 0; attempt < 20 && valid.length >= 2; attempt++) {
        const dateSets = valid.map((entry) => new Set(entry.candles.map((candle) => candle.date)));
        commonDates = [...dateSets[0]!];
        for (let i = 1; i < dateSets.length; i++) commonDates = commonDates.filter((date) => dateSets[i]!.has(date));
        commonDates.sort((a, b) => a.localeCompare(b));

        if (commonDates.length >= MIN_ALIGNED) break;

        let worstIdx = -1;
        let worstCount = Infinity;
        for (let i = 0; i < valid.length; i++) {
          const count = valid[i]!.candles.length;
          const isExisting = valid[i]!.instrument.isExisting;
          const adjustedCount = isExisting ? count + 100000 : count;
          if (adjustedCount < worstCount) { worstCount = adjustedCount; worstIdx = i; }
        }
        if (worstIdx >= 0) {
          const dropped = valid[worstIdx]!;
          console.log(`[optimize] Dropping ${dropped.instrument.symbol} (${dropped.candles.length} dates) — insufficient overlap`);
          missingInstruments.push(dropped.instrument.symbol);
          valid = valid.filter((_, i) => i !== worstIdx);
        }
      }

      if (commonDates.length < MIN_ALIGNED || valid.length < 2) {
        const detail = valid.map((v) => `${v.instrument.symbol}(${v.candles.length}d)`).join(', ');
        console.error(`[optimize] Alignment failed: ${commonDates.length} common dates across ${valid.length} instruments: ${detail}`);
        return NextResponse.json({ error: `Insufficient aligned history (${commonDates.length} common dates across ${valid.length} instruments). Remaining: ${detail}. Missing: ${missingInstruments.join(', ')}`, missingInstruments }, { status: 422 });
      }
      console.log(`[optimize] Aligned ${commonDates.length} common dates across ${valid.length} instruments`);

      validInstruments = valid.map((entry) => entry.instrument);
      const priceMaps = valid.map((entry) => new Map(entry.candles.map((candle) => [candle.date, candle.close])));
      dailyReturns = priceMaps.map((prices) => {
        const returns: number[] = [];
        for (let i = 1; i < commonDates.length; i++) {
          const prev = prices.get(commonDates[i - 1]!);
          const curr = prices.get(commonDates[i]!);
          if (typeof prev === 'number' && typeof curr === 'number' && prev > 0) returns.push(Math.log(curr / prev));
        }
        return returns;
      });

      nAssets = validInstruments.length;
      obs = dailyReturns[0]?.length ?? 0;
      if (obs < 30) {
        return NextResponse.json({ error: 'Insufficient return observations', missingInstruments }, { status: 422 });
      }

      tradingDays = validInstruments.map((instrument) => (CRYPTO_TYPE_IDS.has(instrument.instrumentTypeId) ? 365 : 252));
      const dailyMeans = dailyReturns.map((returns) => returns.reduce((acc, value) => acc + value, 0) / obs);
      meanReturns = dailyMeans.map((mean, i) => mean * tradingDays[i]!);

      const covarianceMatrix: number[][] = Array.from({ length: nAssets }, () => new Array(nAssets).fill(0));
      for (let i = 0; i < nAssets; i++) {
        for (let j = i; j < nAssets; j++) {
          let cov = 0;
          for (let t = 0; t < obs; t++) {
            cov += (dailyReturns[i]![t]! - dailyMeans[i]!) * (dailyReturns[j]![t]! - dailyMeans[j]!);
          }
          cov /= (obs - 1);
          const annualized = i === j ? cov * tradingDays[i]! : cov * Math.sqrt(tradingDays[i]! * tradingDays[j]!);
          covarianceMatrix[i]![j] = annualized;
          covarianceMatrix[j]![i] = annualized;
        }
      }

      const lambda2 = 0.1 * (covarianceMatrix.reduce((sum, row, i) => sum + row[i]!, 0) / nAssets);
      covReg = covarianceMatrix.map((row, i) => row.map((value, j) => (i === j ? value + lambda2 : value)));
      volatilities = covReg.map((row, i) => Math.sqrt(Math.max(0, row[i]!)));
      correlationMatrix = covReg.map((row, i) => row.map((value, j) => {
        const denom = volatilities[i]! * volatilities[j]!;
        return denom > 0 ? value / denom : (i === j ? 1 : 0);
      }));
    }

    let weights: number[];
    let marketCapCoverage: OptimizationResult['marketCapCoverage'];

    switch (method) {
      case 'min-variance':
        weights = minVariance(covReg, { maxWeight, minWeight });
        break;
      case 'risk-parity':
        weights = riskParity(covReg, { maxWeight, minWeight });
        break;
      case 'mvo': {
        const meanOfMeans = meanReturns.reduce((sum, value) => sum + value, 0) / meanReturns.length;
        const shrunkReturns = meanReturns.map((value) => 0.5 * value + 0.5 * meanOfMeans);
        weights = mvo(shrunkReturns, covReg, { riskAversion, maxWeight, minWeight });
        break;
      }
      case 'market-cap': {
        const result = await marketCapWeight(
          validInstruments.map((instrument) => ({
            instrumentId: instrument.instrumentId,
            symbol: instrument.symbol,
            popularityScore: instrument.popularityScore,
          })),
          { maxWeight, minWeight },
        );
        weights = result.weights;
        marketCapCoverage = result.coverage;
        break;
      }
      case 'equal-weight':
      default:
        weights = equalWeight(nAssets);
        break;
    }

    weights = iterativePrune(weights, minWeight, n);
    weights = normalize(weights);

    const nExisting = validInstruments.filter((instrument) => instrument.isExisting).length;
    const directHoldingMap = new Map(directHoldings.map((holding) => [holding.instrumentId, holding]));

    const existingReweighted = validInstruments.slice(0, nExisting).map((instrument, index) => ({
      instrumentId: instrument.instrumentId,
      symbol: instrument.symbol,
      currentWeight: directHoldingMap.get(instrument.instrumentId)?.weight ?? 0,
      targetWeight: weights[index] ?? 0,
    }));

    const objective = inferObjective(method);
    const newRecommendations = validInstruments
      .map((instrument, index) => ({ instrument, index }))
      .filter(({ instrument, index }) => !instrument.isExisting && (weights[index] ?? 0) >= minWeight)
      .map(({ instrument, index }) => {
        const corrDiversScore = scoreDiversification(index, nExisting, correlationMatrix);
        const candidate = candidates.find((c) => c.instrumentId === instrument.instrumentId);
        const momentumScore = candidate?.multiMomentumScore ?? candidate?.momentumScore ?? 0;
        const diversScore = candidate?.diversScore ?? corrDiversScore;
        const reason = (diversScore !== undefined && diversScore > 0.6) ? 'Diversifier'
          : momentumScore > 0.7 ? 'Momentum'
          : objective === 'preserve' ? 'Capital Preservation'
          : 'Risk Reducer';
        const resolvedName = resolvedNames[instrument.instrumentId];
        const resolvedSym = resolvedSymbols[instrument.instrumentId];
        return {
          instrumentId: instrument.instrumentId,
          symbol: resolvedSym ?? instrument.symbol,
          displayName: resolvedName ?? candidate?.displayName ?? instrument.symbol,
          targetWeight: weights[index] ?? 0,
          diversificationScore: candidate?.diversScore ?? 0,
          compositeScore: candidate?.compositeScore ?? 0,
          momentumScore,
          reason,
          oneYearPriceChange: candidate?.oneYearPriceChange,
        };
      });

    const portReturn = dot(meanReturns.slice(0, nAssets), weights);
    const sigmaW = matVec(covReg, weights);
    const portVar = dot(weights, sigmaW);
    const portVol = Math.sqrt(Math.max(0, portVar));
    const sharpe = portVol > 0 ? portReturn / portVol : 0;
    const weightedAvgVol = dot(volatilities, weights);
    const diversificationRatio = portVol > 0 ? weightedAvgVol / portVol : 1;

    // ── Run inline backtest on proposed weights and current weights ──
    let backtestProposed: BacktestResult | undefined;
    let backtestCurrent: BacktestResult | undefined;
    
    // Backtest requires raw candle data — only available on cache miss path
    if (valid.length > 0) {
      try {
        const backtestCandleData = new Map<number, CandleDay[]>();
        for (const entry of valid) {
          const candles = entry.candles.map(c => ({ date: c.date, close: c.close }));
          backtestCandleData.set(entry.instrument.instrumentId, candles);
        }

        const proposedInstruments: BacktestInstrument[] = validInstruments.map((inst, i) => ({
          symbol: inst.symbol,
          instrumentId: inst.instrumentId,
          targetWeight: weights[i] ?? 0,
        })).filter(inst => inst.targetWeight > 0.001);

        if (proposedInstruments.length >= 2) {
          backtestProposed = runSimpleRebalanceBacktest(
            proposedInstruments,
            backtestCandleData,
            { startingCapital: 100000, rebalanceFrequency: 'monthly', spreadCost: 0.0015, driftThreshold: 0.02 }
          );
        }

        const nExistingInstruments = validInstruments.filter(inst => inst.isExisting).length;
        if (nExistingInstruments >= 2) {
          const currentWeightSum = directHoldings.reduce((s, h) => s + (h.weight ?? 0), 0);
          const currentInstruments: BacktestInstrument[] = validInstruments
            .filter(inst => inst.isExisting)
            .map(inst => {
              const holding = directHoldings.find(h => h.instrumentId === inst.instrumentId);
              const rawWeight = holding?.weight ?? 0;
              return {
                symbol: inst.symbol,
                instrumentId: inst.instrumentId,
                targetWeight: currentWeightSum > 0 ? rawWeight / currentWeightSum : 1 / nExistingInstruments,
              };
            });

          backtestCurrent = runSimpleRebalanceBacktest(
            currentInstruments,
            backtestCandleData,
            { startingCapital: 100000, rebalanceFrequency: 'monthly', spreadCost: 0.0015, driftThreshold: 0.02 }
          );
        }
      } catch (e) {
        console.error('[optimize] Backtest error (non-fatal):', e instanceof Error ? e.message : e);
      }
    }

    const response = NextResponse.json({
      existingReweighted,
      newRecommendations,
      weights,
      method,
      symbols: validInstruments.map((instrument) => instrument.symbol),
      instrumentIds: validInstruments.map((instrument) => instrument.instrumentId),
      metrics: {
        expectedReturn: portReturn,
        expectedVolatility: portVol,
        sharpeRatio: sharpe,
        diversificationRatio,
        maxWeight,
        dataPoints: obs,
      },
      riskContributions: weights.map(() => 1 / Math.max(1, weights.length)),
      dataQuality: { dataPoints: obs, missingInstruments },
      constraints: { maxWeight, minWeight, m, n },
      marketCapCoverage,
      missingInstruments,
      backtest: backtestProposed,
      currentBacktest: backtestCurrent,
      dataSource: usedCache ? 'cached' : 'live',
    });

    if (newCookie) response.headers.append('Set-Cookie', buildSessionCookie(newCookie));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Optimization failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
