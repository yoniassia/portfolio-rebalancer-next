/**
 * Risk Parity / Equal Risk Contribution (ERC) Optimization.
 *
 * Each asset contributes equally to total portfolio risk:
 *   wᵢ · (Σw)ᵢ / (w'Σw) = 1/N   for all i
 *
 * Uses cyclical coordinate descent (Griveau-Billion et al. 2013).
 */
import { matVec, dot, vecSum, regularize } from './matrix-math';

export interface RiskParityParams {
  maxWeight?: number;       // default 0.30
  minWeight?: number;       // default 0.0
  riskBudgets?: number[];   // custom risk budgets (default: equal 1/N)
  maxIter?: number;         // default 500
  tol?: number;             // convergence tolerance, default 1e-8
}

export function riskParity(cov: number[][], params?: RiskParityParams): number[] {
  const n = cov.length;
  const maxW = params?.maxWeight ?? 0.30;
  const minW = params?.minWeight ?? 0.0;
  const maxIter = params?.maxIter ?? 500;
  const tol = params?.tol ?? 1e-8;
  const budgets = params?.riskBudgets ?? new Array(n).fill(1 / n);

  // Regularize for numerical stability
  const covReg = regularize(cov, 1e-8);

  // Initialize with volatility-inverse weights (better starting point)
  let w = new Array(n).fill(0);
  const vols = covReg.map((row, i) => Math.sqrt(row[i]!));
  const invVols = vols.map((v) => (v > 0 ? 1 / v : 1));
  const invVolSum = vecSum(invVols);
  for (let i = 0; i < n; i++) {
    w[i] = invVols[i]! / invVolSum;
  }

  let prevRcDiff = Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    const sigmaW = matVec(covReg, w); // Σw
    const portVar = dot(w, sigmaW);   // w'Σw
    const portVol = Math.sqrt(portVar);

    if (portVol < 1e-12) break;

    // Risk contributions: rc_i = w_i * (Σw)_i / (w'Σw)
    const rc = w.map((wi, i) => wi * sigmaW[i]! / portVar);

    // Check convergence: max deviation from target budget
    const rcDiff = rc.reduce((maxD, rci, i) => Math.max(maxD, Math.abs(rci - budgets[i]!)), 0);
    if (rcDiff < tol || Math.abs(rcDiff - prevRcDiff) < tol * 0.01) break;
    prevRcDiff = rcDiff;

    // Cyclical coordinate descent
    for (let i = 0; i < n; i++) {
      const sigmaII = covReg[i]![i]!;
      if (sigmaII <= 0) continue;

      // For asset i, we solve the quadratic:
      // w_i^2 * sigma_ii + w_i * (sigma_w_excl_i) = budget_i * portVar
      // where sigma_w_excl_i = sum_{j!=i} cov_{ij} * w_j

      let sigmaWExcl = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i) sigmaWExcl += covReg[i]![j]! * w[j]!;
      }

      // Quadratic: a*x^2 + b*x - c = 0
      const a = sigmaII;
      const b = sigmaWExcl;
      const c = budgets[i]! * portVar;

      // Solve using quadratic formula (take positive root)
      const discriminant = b * b + 4 * a * c;
      if (discriminant < 0) continue;

      const newW = (-b + Math.sqrt(discriminant)) / (2 * a);
      w[i] = Math.max(minW, Math.min(maxW, newW));
    }

    // Normalize to sum = 1
    const total = vecSum(w);
    if (total > 0) {
      for (let i = 0; i < n; i++) w[i]! /= total;
    }

    // Enforce box constraints after normalization
    let needsReproject = false;
    for (let i = 0; i < n; i++) {
      if (w[i]! < minW) { w[i] = minW; needsReproject = true; }
      if (w[i]! > maxW) { w[i] = maxW; needsReproject = true; }
    }
    if (needsReproject) {
      const total2 = vecSum(w);
      if (total2 > 0) {
        for (let i = 0; i < n; i++) w[i]! /= total2;
      }
    }
  }

  return w;
}
