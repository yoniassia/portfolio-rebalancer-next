/**
 * Unified portfolio optimization interface.
 * Dispatches to the appropriate solver based on method selection.
 */
import type { EToroTrading } from 'etoro-sdk';
import type { OptimizationMethod, OptimizationResult } from '../../types/rebalancer';
import { fetchOptimizationData, createMockOptimizationData, type ProgressCallback } from './data-pipeline';
import { equalWeight } from './equal-weight';
import { minVariance } from './min-variance';
import { riskParity } from './risk-parity';
import { mvo } from './mvo';
import { matVec, dot } from './matrix-math';

export { type ProgressCallback } from './data-pipeline';
export { RISK_PROFILES, getRiskProfile } from './risk-profiles';

/**
 * Run portfolio optimization with the specified method.
 */
export async function optimize(
  etoro: EToroTrading,
  instrumentIds: number[],
  symbols: string[],
  method: OptimizationMethod,
  params: Record<string, number>,
  onProgress?: ProgressCallback,
): Promise<OptimizationResult> {
  // Fetch historical data
  const data = await fetchOptimizationData(etoro, instrumentIds, symbols, 252, onProgress);

  return optimizeFromData(data, method, params);
}

/**
 * Run optimization using pre-computed data (useful for demo mode or re-optimization).
 */
export function optimizeFromData(
  data: { instrumentIds: number[]; symbols: string[]; meanReturns: number[]; covarianceMatrix: number[][]; volatilities: number[]; dataPoints: number; missingInstruments: string[] },
  method: OptimizationMethod,
  params: Record<string, number>,
): OptimizationResult {
  const n = data.instrumentIds.length;
  let weights: number[];

  switch (method) {
    case 'equal-weight':
      weights = equalWeight(n);
      break;

    case 'min-variance':
      weights = minVariance(data.covarianceMatrix, {
        maxWeight: params.maxWeight,
        minWeight: params.minWeight,
      });
      break;

    case 'risk-parity':
      weights = riskParity(data.covarianceMatrix, {
        maxWeight: params.maxWeight,
        minWeight: params.minWeight,
      });
      break;

    case 'mvo':
      weights = mvo(data.meanReturns, data.covarianceMatrix, {
        riskAversion: params.riskAversion,
        maxWeight: params.maxWeight,
        minWeight: params.minWeight,
      });
      break;

    default:
      weights = equalWeight(n);
  }

  // Compute portfolio metrics
  const metrics = computeMetrics(weights, data.meanReturns, data.covarianceMatrix, data.volatilities);

  // Compute risk contributions
  const riskContributions = computeRiskContributions(weights, data.covarianceMatrix);

  return {
    weights,
    method,
    instrumentIds: data.instrumentIds,
    symbols: data.symbols,
    metrics,
    riskContributions,
    dataQuality: {
      dataPoints: data.dataPoints,
      missingInstruments: data.missingInstruments,
    },
  };
}

/**
 * Run optimization in demo mode with mock data.
 */
export function optimizeDemo(
  instrumentIds: number[],
  symbols: string[],
  method: OptimizationMethod,
  params: Record<string, number>,
): OptimizationResult {
  const data = createMockOptimizationData(instrumentIds, symbols);
  return optimizeFromData(data, method, params);
}

function computeMetrics(
  weights: number[],
  meanReturns: number[],
  cov: number[][],
  volatilities: number[],
): OptimizationResult['metrics'] {
  const portReturn = dot(meanReturns, weights);
  const sigmaW = matVec(cov, weights);
  const portVar = dot(weights, sigmaW);
  const portVol = Math.sqrt(Math.max(0, portVar));
  const sharpe = portVol > 0 ? portReturn / portVol : 0;
  const maxWeight = Math.max(...weights);

  // Diversification ratio: weighted average vol / portfolio vol
  const weightedAvgVol = dot(weights, volatilities);
  const divRatio = portVol > 0 ? weightedAvgVol / portVol : 1;

  return {
    expectedReturn: portReturn,
    expectedVolatility: portVol,
    sharpeRatio: sharpe,
    maxWeight,
    diversificationRatio: divRatio,
  };
}

function computeRiskContributions(weights: number[], cov: number[][]): number[] {
  const sigmaW = matVec(cov, weights);
  const portVar = dot(weights, sigmaW);

  if (portVar <= 0) return weights.map(() => 1 / weights.length);

  return weights.map((w, i) => (w * sigmaW[i]!) / portVar);
}
