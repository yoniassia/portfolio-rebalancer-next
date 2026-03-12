/**
 * Historical data pipeline: fetches candles → computes daily returns → covariance matrix.
 * This feeds all portfolio optimization methods.
 */
import type { EToroTrading } from 'etoro-sdk';
import { CandleInterval, CandleDirection } from 'etoro-sdk';

export interface OptimizationData {
  instrumentIds: number[];
  symbols: string[];
  dailyReturns: number[][];     // [asset][day] — log returns
  meanReturns: number[];         // annualized mean return per asset
  covarianceMatrix: number[][];  // annualized covariance matrix
  volatilities: number[];        // annualized vol per asset
  correlationMatrix: number[][]; // correlation matrix
  tradingDays: number[];         // annualization basis per asset
  dataPoints: number;            // number of aligned trading days
  missingInstruments: string[];  // instruments with insufficient data
}

export type ProgressCallback = (phase: string, current: number, total: number) => void;

const TRADING_DAYS_PER_YEAR = 252;
const CRYPTO_TYPE_IDS = new Set([11, 12, 100]);
const MIN_DATA_POINTS = 30;
const CONCURRENCY_LIMIT = 5;

/**
 * Fetch historical prices and compute all inputs needed for optimization.
 */
export async function fetchOptimizationData(
  etoro: EToroTrading,
  instrumentIds: number[],
  symbols: string[],
  lookbackDays: number = TRADING_DAYS_PER_YEAR,
  onProgress?: ProgressCallback,
  instrumentTypeIds?: number[],
): Promise<OptimizationData> {
  const n = instrumentIds.length;
  const missingInstruments: string[] = [];

  // Phase 1: Fetch candle data with concurrency limit
  onProgress?.('Fetching price data...', 0, n);

  const closePrices: Map<number, Map<string, number>> = new Map(); // instrumentId → { date → close }

  const queue = instrumentIds.map((id, i) => ({ id, symbol: symbols[i]!, index: i }));
  let completed = 0;

  // Process in batches
  for (let start = 0; start < queue.length; start += CONCURRENCY_LIMIT) {
    const batch = queue.slice(start, start + CONCURRENCY_LIMIT);
    const results = await Promise.allSettled(
      batch.map(async ({ id }) => {
        const resp = await etoro.getCandles(id, CandleInterval.OneDay, Math.min(lookbackDays, 1000), CandleDirection.Desc);
        const candles = resp.candles[0]?.candles ?? [];
        const priceMap = new Map<string, number>();
        for (const c of candles) {
          const date = c.fromDate.slice(0, 10);
          priceMap.set(date, c.close);
        }
        return { id, priceMap };
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const item = batch[i]!;
      if (result.status === 'fulfilled') {
        closePrices.set(item.id, result.value.priceMap);
      } else {
        missingInstruments.push(item.symbol);
      }
      completed++;
      onProgress?.('Fetching price data...', completed, n);
    }
  }

  // Phase 2: Align dates — only keep dates where ALL successful instruments have data
  onProgress?.('Aligning data...', 0, 1);

  const validIds = instrumentIds.filter((id) => closePrices.has(id));
  const validSymbols = instrumentIds.map((id, i) => ({ id, symbol: symbols[i]!, typeId: instrumentTypeIds?.[i] }))
    .filter(({ id }) => closePrices.has(id));

  if (validIds.length < 2) {
    throw new Error('Need at least 2 instruments with price data for optimization');
  }

  const allDateSets = validIds.map((id) => new Set(closePrices.get(id)!.keys()));
  let commonDates = [...allDateSets[0]!];
  for (let i = 1; i < allDateSets.length; i++) {
    commonDates = commonDates.filter((d) => allDateSets[i]!.has(d));
  }
  commonDates.sort();

  if (commonDates.length < MIN_DATA_POINTS) {
    throw new Error(`Insufficient aligned data: only ${commonDates.length} common dates (need ${MIN_DATA_POINTS}+)`);
  }

  onProgress?.('Computing returns...', 0, 1);

  const dailyReturns: number[][] = [];

  for (const id of validIds) {
    const prices = closePrices.get(id)!;
    const returns: number[] = [];
    for (let t = 1; t < commonDates.length; t++) {
      const prevClose = prices.get(commonDates[t - 1]!)!;
      const currClose = prices.get(commonDates[t]!)!;
      returns.push(prevClose > 0 ? Math.log(currClose / prevClose) : 0);
    }
    dailyReturns.push(returns);
  }

  const T = dailyReturns[0]!.length;

  onProgress?.('Computing covariance matrix...', 0, 1);

  const nAssets = validIds.length;
  const dailyMeans = dailyReturns.map((returns) => returns.reduce((s, r) => s + r, 0) / T);
  const tradingDays = validSymbols.map(({ typeId }) => (typeId !== undefined && CRYPTO_TYPE_IDS.has(typeId) ? 365 : 252));
  const meanReturns = dailyMeans.map((m, i) => m * tradingDays[i]!);

  const covarianceMatrix: number[][] = Array.from({ length: nAssets }, () => new Array(nAssets).fill(0));

  for (let i = 0; i < nAssets; i++) {
    for (let j = i; j < nAssets; j++) {
      let cov = 0;
      for (let t = 0; t < T; t++) {
        cov += (dailyReturns[i]![t]! - dailyMeans[i]!) * (dailyReturns[j]![t]! - dailyMeans[j]!);
      }
      cov /= (T - 1);
      const annualizedCov = i === j
        ? cov * tradingDays[i]!
        : cov * Math.sqrt(tradingDays[i]! * tradingDays[j]!);
      covarianceMatrix[i]![j] = annualizedCov;
      covarianceMatrix[j]![i] = annualizedCov;
    }
  }

  const volatilities = covarianceMatrix.map((row, i) => Math.sqrt(Math.max(0, row[i]!)));

  const correlationMatrix: number[][] = Array.from({ length: nAssets }, () => new Array(nAssets).fill(0));
  for (let i = 0; i < nAssets; i++) {
    for (let j = 0; j < nAssets; j++) {
      const denom = volatilities[i]! * volatilities[j]!;
      correlationMatrix[i]![j] = denom > 0 ? covarianceMatrix[i]![j]! / denom : (i === j ? 1 : 0);
    }
  }

  onProgress?.('Done', 1, 1);

  return {
    instrumentIds: validIds,
    symbols: validSymbols.map(({ symbol }) => symbol),
    dailyReturns,
    meanReturns,
    covarianceMatrix,
    volatilities,
    correlationMatrix,
    tradingDays,
    dataPoints: T,
    missingInstruments,
  };
}

/**
 * Create mock optimization data for demo mode.
 */
export function createMockOptimizationData(
  instrumentIds: number[],
  symbols: string[],
  instrumentTypeIds?: number[],
): OptimizationData {
  const n = instrumentIds.length;
  const tradingDays = symbols.map((_, i) => (instrumentTypeIds?.[i] !== undefined && CRYPTO_TYPE_IDS.has(instrumentTypeIds[i]!) ? 365 : 252));

  const dailyVols = symbols.map((s, i) => {
    if (s.includes('BTC') || s.includes('ETH') || (instrumentTypeIds?.[i] !== undefined && CRYPTO_TYPE_IDS.has(instrumentTypeIds[i]!))) return 0.65 / Math.sqrt(tradingDays[i]!);
    if (s === 'CASH') return 0;
    return (0.15 + Math.random() * 0.25) / Math.sqrt(tradingDays[i]!);
  });

  const dailyCovariance: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return dailyVols[i]! ** 2;
      const corr = 0.2 + Math.random() * 0.4;
      return corr * dailyVols[i]! * dailyVols[j]!;
    }),
  );

  const covarianceMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      covarianceMatrix[i]![j] = i === j
        ? dailyCovariance[i]![j]! * tradingDays[i]!
        : dailyCovariance[i]![j]! * Math.sqrt(tradingDays[i]! * tradingDays[j]!);
    }
  }

  const volatilities = covarianceMatrix.map((row, i) => Math.sqrt(Math.max(0, row[i]!)));
  const correlationMatrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 1;
      const denom = volatilities[i]! * volatilities[j]!;
      return denom > 0 ? covarianceMatrix[i]![j]! / denom : 0;
    }),
  );

  const dailyMeans = symbols.map((s, i) => {
    if (s.includes('BTC') || s.includes('ETH') || (instrumentTypeIds?.[i] !== undefined && CRYPTO_TYPE_IDS.has(instrumentTypeIds[i]!))) return (0.15 + Math.random() * 0.2) / tradingDays[i]!;
    if (s === 'CASH') return 0;
    return (0.05 + Math.random() * 0.15) / tradingDays[i]!;
  });

  return {
    instrumentIds,
    symbols,
    dailyReturns: Array.from({ length: n }, () => Array.from({ length: 250 }, () => (Math.random() - 0.5) * 0.04)),
    meanReturns: dailyMeans.map((m, i) => m * tradingDays[i]!),
    covarianceMatrix,
    volatilities,
    correlationMatrix,
    tradingDays,
    dataPoints: 250,
    missingInstruments: [],
  };
}
