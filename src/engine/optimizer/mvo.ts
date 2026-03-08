/**
 * Constrained Mean-Variance Optimization (Markowitz).
 *
 * Maximizes utility: μ'w - (λ/2) · w'Σw
 * subject to:
 *   Σwᵢ = 1    (fully invested)
 *   wᵢ ≥ 0     (long only)
 *   wᵢ ≤ max   (concentration limit)
 *
 * Uses projected gradient ascent on the utility function.
 */
import { matVec, dot, vecSub, vecScale, vecSum, vecAdd, regularize } from './matrix-math';

export interface MVOParams {
  riskAversion?: number;    // λ, default 2.5 (moderate)
  maxWeight?: number;       // default 0.25
  minWeight?: number;       // default 0.0
  maxIter?: number;         // default 500
  tol?: number;             // convergence tolerance, default 1e-8
}

/**
 * Project weights onto constraint set: clip to [min, max], normalize to sum = 1.
 */
function projectWeights(w: number[], minW: number, maxW: number): number[] {
  const n = w.length;
  const clipped = w.map((v) => Math.max(minW, Math.min(maxW, v)));

  for (let iter = 0; iter < 50; iter++) {
    const total = vecSum(clipped);
    if (Math.abs(total - 1) < 1e-10) break;

    const excess = total - 1;
    const adjust = excess / n;
    for (let i = 0; i < n; i++) {
      clipped[i] = Math.max(minW, Math.min(maxW, clipped[i]! - adjust));
    }
  }

  const total = vecSum(clipped);
  if (total > 0 && Math.abs(total - 1) > 1e-8) {
    for (let i = 0; i < n; i++) clipped[i]! /= total;
  }

  return clipped;
}

export function mvo(
  meanReturns: number[],
  cov: number[][],
  params?: MVOParams,
): number[] {
  const n = cov.length;
  const lambda = params?.riskAversion ?? 2.5;
  const maxW = params?.maxWeight ?? 0.25;
  const minW = params?.minWeight ?? 0.0;
  const maxIter = params?.maxIter ?? 500;
  const tol = params?.tol ?? 1e-8;

  // Regularize covariance
  const covReg = regularize(cov, 1e-8);

  // Initialize with equal weights
  let w = new Array(n).fill(1 / n);

  // Learning rate: scale by inverse of risk aversion * max eigenvalue estimate
  const trace = cov.reduce((s, row, i) => s + row[i]!, 0);
  let lr = 1 / (lambda * trace / n + 1);

  let prevObj = -Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    // Gradient of utility: μ - λΣw
    const sigmaW = matVec(covReg, w);
    const grad = vecSub(meanReturns, vecScale(sigmaW, lambda));

    // Gradient ascent step
    const wNew = vecAdd(w, vecScale(grad, lr));

    // Project onto constraints
    w = projectWeights(wNew, minW, maxW);

    // Compute utility
    const portReturn = dot(meanReturns, w);
    const portVar = dot(w, matVec(covReg, w));
    const obj = portReturn - (lambda / 2) * portVar;

    // Check convergence
    if (Math.abs(obj - prevObj) < tol) break;

    // Adaptive learning rate
    if (obj < prevObj) lr *= 0.5;

    prevObj = obj;
  }

  return w;
}
