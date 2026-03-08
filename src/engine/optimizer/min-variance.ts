/**
 * Minimum Variance Portfolio Optimization.
 *
 * Minimizes w'Σw subject to:
 *   Σwᵢ = 1   (fully invested)
 *   wᵢ ≥ 0    (long only)
 *   wᵢ ≤ max  (concentration limit)
 *
 * Uses projected gradient descent — simple, robust, no external solver needed.
 */
import { matVec, dot, vecSub, vecScale, vecSum, ones, regularize } from './matrix-math';

export interface MinVarianceParams {
  maxWeight?: number; // default 0.25
  minWeight?: number; // default 0.0
  maxIter?: number;   // default 500
  tol?: number;       // convergence tolerance, default 1e-8
}

/**
 * Project weights onto the constraint set:
 * - Clip to [min, max]
 * - Normalize to sum = 1
 */
function projectWeights(w: number[], minW: number, maxW: number): number[] {
  const n = w.length;
  const clipped = w.map((v) => Math.max(minW, Math.min(maxW, v)));

  // Iterative projection to satisfy both box + sum constraints
  for (let iter = 0; iter < 50; iter++) {
    const total = vecSum(clipped);
    if (Math.abs(total - 1) < 1e-10) break;

    const excess = total - 1;
    const adjust = excess / n;

    for (let i = 0; i < n; i++) {
      clipped[i] = Math.max(minW, Math.min(maxW, clipped[i]! - adjust));
    }
  }

  // Final normalization if still not summing to 1
  const total = vecSum(clipped);
  if (total > 0 && Math.abs(total - 1) > 1e-8) {
    for (let i = 0; i < n; i++) clipped[i]! /= total;
  }

  return clipped;
}

export function minVariance(cov: number[][], params?: MinVarianceParams): number[] {
  const n = cov.length;
  const maxW = params?.maxWeight ?? 0.25;
  const minW = params?.minWeight ?? 0.0;
  const maxIter = params?.maxIter ?? 500;
  const tol = params?.tol ?? 1e-8;

  // Regularize covariance for numerical stability
  const covReg = regularize(cov, 1e-8);

  // Initialize with equal weights
  let w = ones(n).map((v) => v / n);

  // Learning rate: scale by inverse of max eigenvalue estimate (trace / n)
  const trace = cov.reduce((s, row, i) => s + row[i]!, 0);
  let lr = 1 / (2 * trace / n + 1e-10);

  let prevObj = Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    // Gradient of w'Σw is 2Σw
    const grad = vecScale(matVec(covReg, w), 2);

    // Gradient descent step
    const wNew = vecSub(w, vecScale(grad, lr));

    // Project onto constraints
    w = projectWeights(wNew, minW, maxW);

    // Compute objective
    const obj = dot(w, matVec(covReg, w));

    // Check convergence
    if (Math.abs(prevObj - obj) < tol) break;

    // Adaptive learning rate
    if (obj > prevObj) lr *= 0.5;

    prevObj = obj;
  }

  return w;
}
