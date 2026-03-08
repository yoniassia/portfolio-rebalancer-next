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
  dataPoints: number;            // number of aligned trading days
  missingInstruments: string[];  // instruments with insufficient data
}

export type ProgressCallback = (phase: string, current: number, total: number) => void;

const TRADING_DAYS_PER_YEAR = 252;
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
          // Normalize date to YYYY-MM-DD
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
  const validSymbols = instrumentIds.map((id, i) => ({ id, symbol: symbols[i]! }))
    .filter(({ id }) => closePrices.has(id))
    .map(({ symbol }) => symbol);

  if (validIds.length < 2) {
    throw new Error('Need at least 2 instruments with price data for optimization');
  }

  // Find common dates
  const allDateSets = validIds.map((id) => new Set(closePrices.get(id)!.keys()));
  let commonDates = [...allDateSets[0]!];
  for (let i = 1; i < allDateSets.length; i++) {
    commonDates = commonDates.filter((d) => allDateSets[i]!.has(d));
  }
  commonDates.sort(); // ascending chronological order

  if (commonDates.length < MIN_DATA_POINTS) {
    throw new Error(`Insufficient aligned data: only ${commonDates.length} common dates (need ${MIN_DATA_POINTS}+)`);
  }

  // Phase 3: Compute log returns
  onProgress?.('Computing returns...', 0, 1);

  const dailyReturns: number[][] = []; // [asset][day]

  for (const id of validIds) {
    const prices = closePrices.get(id)!;
    const returns: number[] = [];
    for (let t = 1; t < commonDates.length; t++) {
      const prevClose = prices.get(commonDates[t - 1]!)!;
      const currClose = prices.get(commonDates[t]!)!;
      if (prevClose > 0) {
        returns.push(Math.log(currClose / prevClose));
      } else {
        returns.push(0);
      }
    }
    dailyReturns.push(returns);
  }

  const T = dailyReturns[0]!.length; // number of return observations

  // Phase 4: Compute statistics
  onProgress?.('Computing covariance matrix...', 0, 1);

  const nAssets = validIds.length;

  // Mean daily returns
  const dailyMeans = dailyReturns.map((returns) => {
    const sum = returns.reduce((s, r) => s + r, 0);
    return sum / T;
  });

  // Annualized mean returns
  const meanReturns = dailyMeans.map((m) => m * TRADING_DAYS_PER_YEAR);

  // Covariance matrix (sample, annualized)
  const covarianceMatrix: number[][] = Array.from({ length: nAssets }, () =>
    new Array(nAssets).fill(0),
  );

  for (let i = 0; i < nAssets; i++) {
    for (let j = i; j < nAssets; j++) {
      let cov = 0;
      for (let t = 0; t < T; t++) {
        cov += (dailyReturns[i]![t]! - dailyMeans[i]!) * (dailyReturns[j]![t]! - dailyMeans[j]!);
      }
      cov = (cov / (T - 1)) * TRADING_DAYS_PER_YEAR; // annualize
      covarianceMatrix[i]![j] = cov;
      covarianceMatrix[j]![i] = cov; // symmetric
    }
  }

  // Volatilities (annualized)
  const volatilities = covarianceMatrix.map((row, i) => Math.sqrt(row[i]!));

  // Correlation matrix
  const correlationMatrix: number[][] = Array.from({ length: nAssets }, () =>
    new Array(nAssets).fill(0),
  );
  for (let i = 0; i < nAssets; i++) {
    for (let j = 0; j < nAssets; j++) {
      const denom = volatilities[i]! * volatilities[j]!;
      correlationMatrix[i]![j] = denom > 0 ? covarianceMatrix[i]![j]! / denom : (i === j ? 1 : 0);
    }
  }

  onProgress?.('Done', 1, 1);

  return {
    instrumentIds: validIds,
    symbols: validSymbols,
    dailyReturns,
    meanReturns,
    covarianceMatrix,
    volatilities,
    correlationMatrix,
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
): OptimizationData {
  const n = instrumentIds.length;

  // Generate plausible mock covariance matrix
  const volatilities = symbols.map((s) => {
    if (s.includes('BTC') || s.includes('ETH')) return 0.65;
    if (s === 'CASH') return 0.0;
    return 0.15 + Math.random() * 0.25;
  });

  const covarianceMatrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return volatilities[i]! ** 2;
      const corr = 0.2 + Math.random() * 0.4;
      return corr * volatilities[i]! * volatilities[j]!;
    }),
  );

  const correlationMatrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 1;
      return covarianceMatrix[i]![j]! / (volatilities[i]! * volatilities[j]!);
    }),
  );

  const meanReturns = symbols.map((s) => {
    if (s.includes('BTC') || s.includes('ETH')) return 0.15 + Math.random() * 0.2;
    if (s === 'CASH') return 0.0;
    return 0.05 + Math.random() * 0.15;
  });

  return {
    instrumentIds,
    symbols,
    dailyReturns: Array.from({ length: n }, () =>
      Array.from({ length: 250 }, () => (Math.random() - 0.5) * 0.04),
    ),
    meanReturns,
    covarianceMatrix,
    volatilities,
    correlationMatrix,
    dataPoints: 250,
    missingInstruments: [],
  };
}
