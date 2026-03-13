/**
 * Matrix pre-computation engine.
 * Computes covariance, correlation, mean returns, volatilities from stored return series.
 * Results are cached in SQLite for fast retrieval during optimization.
 */
import {
  getAlignedReturns,
  getCachedMatrix,
  saveCachedMatrix,
  type CachedMatrix,
  type AlignedReturns,
} from './returns-db';

const CRYPTO_TYPE_IDS = new Set([11, 12, 100]);

export interface ComputedOptimizationData {
  instrumentIds: number[];
  symbols: string[];
  dailyReturns: number[][];
  meanReturns: number[];
  covarianceMatrix: number[][];
  correlationMatrix: number[][];
  volatilities: number[];
  tradingDays: number[];
  dataPoints: number;
  missingInstruments: string[];
  fromCache: boolean;
}

/**
 * Get optimization data — cache-first, compute-and-cache on miss.
 * Returns null if insufficient data (< 2 instruments or < 30 aligned days).
 */
export function getOrComputeOptimizationData(
  instrumentIds: number[],
  lookbackDays: number = 252,
): ComputedOptimizationData | null {
  // 1. Check cache
  const cached = getCachedMatrix(instrumentIds, lookbackDays);
  if (cached) {
    return {
      instrumentIds: cached.instrumentIds,
      symbols: cached.symbols,
      dailyReturns: [], // not stored in cache — only needed for backtesting
      meanReturns: cached.meanReturns,
      covarianceMatrix: cached.covarianceMatrix,
      correlationMatrix: cached.correlationMatrix,
      volatilities: cached.volatilities,
      tradingDays: cached.tradingDays,
      dataPoints: cached.dataPoints,
      missingInstruments: [],
      fromCache: true,
    };
  }

  // 2. Compute from stored returns
  const aligned = getAlignedReturns(instrumentIds, lookbackDays);
  if (aligned.dataPoints < 30 || aligned.instrumentIds.length < 2) {
    return null;
  }

  const result = computeMatrices(aligned);

  // 3. Cache the result
  saveCachedMatrix(
    aligned.instrumentIds,
    aligned.symbols,
    lookbackDays,
    {
      dataPoints: result.dataPoints,
      covarianceMatrix: result.covarianceMatrix,
      correlationMatrix: result.correlationMatrix,
      meanReturns: result.meanReturns,
      volatilities: result.volatilities,
      tradingDays: result.tradingDays,
    },
    24,
  );

  return {
    ...result,
    missingInstruments: aligned.missingInstruments,
    fromCache: false,
  };
}

/**
 * Force-compute matrices from stored returns (bypasses cache, writes to cache).
 */
export function forceComputeAndCache(
  instrumentIds: number[],
  lookbackDays: number = 252,
): ComputedOptimizationData | null {
  const aligned = getAlignedReturns(instrumentIds, lookbackDays);
  if (aligned.dataPoints < 30 || aligned.instrumentIds.length < 2) {
    return null;
  }

  const result = computeMatrices(aligned);

  saveCachedMatrix(
    aligned.instrumentIds,
    aligned.symbols,
    lookbackDays,
    {
      dataPoints: result.dataPoints,
      covarianceMatrix: result.covarianceMatrix,
      correlationMatrix: result.correlationMatrix,
      meanReturns: result.meanReturns,
      volatilities: result.volatilities,
      tradingDays: result.tradingDays,
    },
    24,
  );

  return {
    ...result,
    missingInstruments: aligned.missingInstruments,
    fromCache: false,
  };
}

function computeMatrices(aligned: AlignedReturns): ComputedOptimizationData {
  const { instrumentIds, symbols, tradingDays, returns: dailyReturns, dataPoints } = aligned;
  const nAssets = instrumentIds.length;
  const T = dataPoints;

  // Daily means
  const dailyMeans = dailyReturns.map(r => r.reduce((s, v) => s + v, 0) / T);

  // Annualized mean returns
  const meanReturns = dailyMeans.map((m, i) => m * tradingDays[i]!);

  // Covariance matrix (annualized)
  const covarianceMatrix: number[][] = Array.from({ length: nAssets }, () => new Array(nAssets).fill(0));
  for (let i = 0; i < nAssets; i++) {
    for (let j = i; j < nAssets; j++) {
      let cov = 0;
      for (let t = 0; t < T; t++) {
        cov += (dailyReturns[i]![t]! - dailyMeans[i]!) * (dailyReturns[j]![t]! - dailyMeans[j]!);
      }
      cov /= (T - 1);
      const annualized = i === j
        ? cov * tradingDays[i]!
        : cov * Math.sqrt(tradingDays[i]! * tradingDays[j]!);
      covarianceMatrix[i]![j] = annualized;
      covarianceMatrix[j]![i] = annualized;
    }
  }

  // Regularize
  const trace = covarianceMatrix.reduce((s, row, i) => s + row[i]!, 0);
  const lambda = 0.1 * (trace / nAssets);
  const covReg = covarianceMatrix.map((row, i) =>
    row.map((v, j) => (i === j ? v + lambda : v))
  );

  // Volatilities
  const volatilities = covReg.map((row, i) => Math.sqrt(Math.max(0, row[i]!)));

  // Correlation matrix
  const correlationMatrix = covReg.map((row, i) =>
    row.map((v, j) => {
      const denom = volatilities[i]! * volatilities[j]!;
      return denom > 0 ? v / denom : (i === j ? 1 : 0);
    })
  );

  return {
    instrumentIds,
    symbols,
    dailyReturns,
    meanReturns,
    covarianceMatrix: covReg,
    correlationMatrix,
    volatilities,
    tradingDays,
    dataPoints: T,
    missingInstruments: [],
    fromCache: false,
  };
}
