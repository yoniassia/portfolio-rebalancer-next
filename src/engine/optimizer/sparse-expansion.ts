import { randomUUID } from 'crypto';

const ETORO_BASE = 'https://public-api.etoro.com/api/v1';
const CRYPTO_TYPE_IDS = new Set([11, 12, 100]);
const ETF_TYPE_IDS = new Set([6, 7]);

export interface CandidateInstrument {
  instrumentId: number;
  symbol: string;
  displayName: string;
  instrumentTypeId: number;
  popularityScore: number;
  momentumScore: number;
  compositeScore: number;
  multiMomentumScore: number;
  diversScore?: number;
  oneYearPriceChange?: number;
  weeklyPriceChange?: number;
  monthlyPriceChange?: number;
  isOpen?: boolean;
}

export interface ExpansionParams {
  heldInstrumentIds: Set<number>;
  heldInstrumentTypeIds?: number[];
  m: number;
  apiKey: string;
  userKey: string;
  assetTypeIds?: number[];
  investmentObjective?: 'preserve' | 'balanced' | 'growth';
}

interface SearchInstrument {
  instrumentId?: number;
  instrumentID?: number;
  symbolFull?: string;
  internalSymbolFull?: string;
  displayname?: string;
  displayName?: string;
  instrumentDisplayName?: string;
  internalInstrumentDisplayName?: string;
  logo50x50?: string;
  dailyPriceChange?: number;
  weeklyPriceChange?: number;
  monthlyPriceChange?: number;
  oneYearPriceChange?: number;
  popularityUniques7Day?: number;
  popularityUniques?: number;
  instrumentTypeID?: number;
  instrumentTypeId?: number;
  internalAssetClassId?: number;
  isCurrentlyTradable?: boolean;
  isBuyEnabled?: boolean;
  isOpen?: boolean;
  isInternalInstrument?: boolean;
  isHiddenFromClient?: boolean;
}

function extractSymbol(instrument: SearchInstrument): string {
  const sym = instrument.symbolFull ?? instrument.internalSymbolFull;
  if (sym && !sym.startsWith('Drm.')) return sym;
  const logo = instrument.logo50x50;
  if (typeof logo === 'string' && logo.includes('market-avatars/')) {
    const extracted = logo.split('market-avatars/')[1]?.split('/')[0]?.toUpperCase();
    if (extracted && extracted.length <= 10) return extracted;
  }
  const name = instrument.displayname ?? instrument.displayName ?? instrument.instrumentDisplayName ?? instrument.internalInstrumentDisplayName;
  return (name ?? 'UNKNOWN').toUpperCase();
}

function extractDisplayName(instrument: SearchInstrument): string {
  return instrument.displayname
    ?? instrument.displayName
    ?? instrument.instrumentDisplayName
    ?? instrument.internalInstrumentDisplayName
    ?? extractSymbol(instrument);
}

function normalizeArray(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map((v) => (v - min) / range);
}

export async function fetchCandidates(params: ExpansionParams): Promise<CandidateInstrument[]> {
  if (!params.apiKey || !params.userKey) return [];

  const url = `${ETORO_BASE}/market-data/search?query=*&pageSize=500`;
  const res = await fetch(url, {
    headers: {
      'x-api-key': params.apiKey,
      'x-user-key': params.userKey,
      'x-request-id': randomUUID(),
    },
  });

  if (!res.ok) {
    throw new Error(`Candidate fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const instruments: SearchInstrument[] = data?.items ?? data?.instruments ?? [];

  const MIN_POPULARITY = 500;

  const filtered = instruments.filter((instrument) => {
    const instrumentId = instrument.instrumentId ?? instrument.instrumentID;
    const instrumentTypeId = instrument.instrumentTypeID ?? instrument.instrumentTypeId ?? instrument.internalAssetClassId ?? 0;
    if (!instrumentId || instrumentId < 0) return false;
    if (params.heldInstrumentIds.has(instrumentId)) return false;
    if (instrument.isHiddenFromClient === true) return false;
    if (instrument.isInternalInstrument === true && instrument.isCurrentlyTradable !== true) return false;
    if (instrument.isCurrentlyTradable === false) return false;
    if (instrument.isBuyEnabled === false) return false;
    const pop = instrument.popularityUniques7Day ?? instrument.popularityUniques ?? 0;
    if (pop < MIN_POPULARITY) return false;
    const sym = instrument.symbolFull ?? instrument.internalSymbolFull ?? '';
    if (sym.startsWith('Drm.') || sym.startsWith('Drm ')) return false;
    if (params.assetTypeIds?.length && !params.assetTypeIds.includes(instrumentTypeId)) return false;
    return true;
  });

  const yearChanges = filtered.map((i) => i.oneYearPriceChange ?? 0);
  const monthChanges = filtered.map((i) => i.monthlyPriceChange ?? 0);
  const weekChanges = filtered.map((i) => i.weeklyPriceChange ?? 0);
  const popValues = filtered.map((i) => i.popularityUniques7Day ?? i.popularityUniques ?? 0);

  const normYear = normalizeArray(yearChanges);
  const normMonth = normalizeArray(monthChanges);
  const normWeek = normalizeArray(weekChanges);
  const normPop = normalizeArray(popValues);

  const majorityTypeId = findMajorityTypeId(params.heldInstrumentTypeIds ?? []);

  return filtered
    .map((instrument, idx) => {
      const instrumentId = instrument.instrumentId ?? instrument.instrumentID ?? 0;
      const instrumentTypeId = instrument.instrumentTypeID ?? instrument.instrumentTypeId ?? instrument.internalAssetClassId ?? 0;

      const multiMomentumScore = normYear[idx]! * 0.4 + normMonth[idx]! * 0.35 + normWeek[idx]! * 0.25;
      const popularityNorm = normPop[idx]!;
      let diversityBonus = 0;
      if (majorityTypeId !== null && instrumentTypeId !== majorityTypeId) {
        diversityBonus += 0.15;
      }
      if (CRYPTO_TYPE_IDS.has(instrumentTypeId)) diversityBonus += 0.05;
      else if (ETF_TYPE_IDS.has(instrumentTypeId)) diversityBonus += 0.05;

      let compositeScore: number;
      switch (params.investmentObjective) {
        case 'preserve':
          compositeScore = multiMomentumScore * 0.15 + popularityNorm * 0.35 + diversityBonus + (1 - multiMomentumScore) * 0.15;
          break;
        case 'growth':
          compositeScore = multiMomentumScore * 0.70 + popularityNorm * 0.15 + diversityBonus * 1.5;
          break;
        case 'balanced':
        default:
          compositeScore = multiMomentumScore * 0.45 + popularityNorm * 0.35 + diversityBonus;
          break;
      }

      const sectorPenalty = (majorityTypeId !== null && instrumentTypeId === majorityTypeId) ? 0.75 : 1;
      compositeScore *= sectorPenalty;

      return {
        instrumentId,
        symbol: extractSymbol(instrument),
        displayName: extractDisplayName(instrument),
        instrumentTypeId,
        popularityScore: instrument.popularityUniques7Day ?? instrument.popularityUniques ?? 0,
        momentumScore: multiMomentumScore,
        compositeScore,
        multiMomentumScore,
        oneYearPriceChange: instrument.oneYearPriceChange,
        weeklyPriceChange: instrument.weeklyPriceChange,
        monthlyPriceChange: instrument.monthlyPriceChange,
        isOpen: instrument.isOpen,
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 25);
}

function findMajorityTypeId(typeIds: number[]): number | null {
  if (typeIds.length === 0) return null;
  const counts = new Map<number, number>();
  for (const id of typeIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let maxCount = 0;
  let majorityId: number | null = null;
  for (const [id, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      majorityId = id;
    }
  }
  return majorityId;
}

// ── Stage 2: Fast Correlation Pre-Screen ────────────────

interface CandlePoint {
  date: string;
  close: number;
}

async function fetchShortCandles(auth: { apiKey: string; userKey: string } | string, instrumentId: number, days: number = 63): Promise<CandlePoint[]> {
  const headers: Record<string, string> = { 'x-request-id': randomUUID() };
  if (typeof auth === 'string') {
    headers['Authorization'] = `Bearer ${auth}`;
  } else {
    headers['x-api-key'] = auth.apiKey;
    headers['x-user-key'] = auth.userKey;
  }
  const res = await fetch(`${ETORO_BASE}/market-data/instruments/${instrumentId}/history/candles/desc/OneDay/${days}`, {
    headers,
  });
  if (!res.ok) throw new Error(`Short candle fetch failed: ${res.status}`);
  const data = await res.json();
  const candles = data?.candles?.[0]?.candles ?? data?.candles ?? [];
  return candles
    .map((c: { fromDate?: string; date?: string; close?: number; lastClose?: number; rate?: number }) => ({
      date: String(c.fromDate ?? c.date ?? '').slice(0, 10),
      close: c.close ?? c.lastClose ?? c.rate ?? 0,
    }))
    .filter((c: CandlePoint) => c.date.length === 10 && c.close > 0);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]!);
    }
  });
  await Promise.all(runners);
  return results;
}

function computeLogReturns(candles: CandlePoint[]): { dates: string[]; returns: number[] } {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const dates: string[] = [];
  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.close;
    const curr = sorted[i]!.close;
    if (prev > 0) {
      dates.push(sorted[i]!.date);
      returns.push(Math.log(curr / prev));
    }
  }
  return { dates, returns };
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 10) return 0;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]!; sumB += b[i]!; }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom > 0 ? cov / denom : 0;
}

export async function correlationPreScreen(
  candidates: CandidateInstrument[],
  existingInstrumentIds: number[],
  auth: { apiKey: string; userKey: string } | string,
  targetCount: number,
): Promise<CandidateInstrument[]> {
  if (candidates.length === 0) return [];

  const candidateCandles = await mapWithConcurrency(candidates, 5, async (c) => {
    try {
      return { id: c.instrumentId, candles: await fetchShortCandles(auth, c.instrumentId) };
    } catch {
      return { id: c.instrumentId, candles: [] as CandlePoint[] };
    }
  });

  const existingCandles = await mapWithConcurrency(existingInstrumentIds, 5, async (id) => {
    try {
      return { id, candles: await fetchShortCandles(auth, id) };
    } catch {
      return { id, candles: [] as CandlePoint[] };
    }
  });

  const existingReturns = existingCandles
    .filter((e) => e.candles.length >= 15)
    .map((e) => computeLogReturns(e.candles));

  const candidateReturnMap = new Map<number, { dates: string[]; returns: number[] }>();
  for (const entry of candidateCandles) {
    if (entry.candles.length >= 15) {
      candidateReturnMap.set(entry.id, computeLogReturns(entry.candles));
    }
  }

  const scored = candidates.map((candidate) => {
    const cReturns = candidateReturnMap.get(candidate.instrumentId);
    let diversScore = 0.3; // neutral fallback

    if (cReturns && existingReturns.length > 0) {
      let maxAbsCorr = 0;
      for (const eReturns of existingReturns) {
        const commonDates = cReturns.dates.filter((d) => eReturns.dates.includes(d));
        if (commonDates.length < 10) continue;

        const dateSet = new Set(commonDates);
        const cAligned: number[] = [];
        const eAligned: number[] = [];
        for (let i = 0; i < cReturns.dates.length; i++) {
          if (dateSet.has(cReturns.dates[i]!)) {
            const eIdx = eReturns.dates.indexOf(cReturns.dates[i]!);
            if (eIdx >= 0) {
              cAligned.push(cReturns.returns[i]!);
              eAligned.push(eReturns.returns[eIdx]!);
            }
          }
        }

        const corr = Math.abs(pearsonCorrelation(cAligned, eAligned));
        if (corr > maxAbsCorr) maxAbsCorr = corr;
      }
      diversScore = 1 - maxAbsCorr;
    }

    const finalScore = candidate.compositeScore * 0.5 + diversScore * 0.5;
    return { ...candidate, compositeScore: finalScore, diversScore };
  });

  return scored
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, targetCount);
}

export function scoreDiversification(
  candidateIdx: number,
  existingCount: number,
  correlationMatrix: number[][],
): number {
  if (!correlationMatrix.length || existingCount <= 0) return 0.5;

  let maxAbsCorrelation = -Infinity;
  for (let i = 0; i < existingCount; i++) {
    const value = correlationMatrix[i]?.[candidateIdx];
    if (typeof value === 'number' && Number.isFinite(value)) {
      maxAbsCorrelation = Math.max(maxAbsCorrelation, Math.abs(value));
    }
  }

  if (!Number.isFinite(maxAbsCorrelation)) return 0.5;
  return 1 - maxAbsCorrelation;
}

export function iterativePrune(
  weights: number[],
  minWeight: number,
  _existingCount: number,
  maxIter: number = 10,
): number[] {
  const pruned = [...weights];

  const renormalize = () => {
    const sum = pruned.reduce((acc, weight) => acc + weight, 0);
    if (sum > 0) {
      for (let i = 0; i < pruned.length; i++) {
        pruned[i] = pruned[i]! / sum;
      }
    }
  };

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < pruned.length; i++) {
      if (pruned[i]! > 0 && pruned[i]! < minWeight) {
        pruned[i] = 0;
        changed = true;
      }
    }
    if (!changed) break;
    renormalize();
  }

  return pruned;
}
