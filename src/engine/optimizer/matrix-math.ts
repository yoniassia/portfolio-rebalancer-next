/**
 * Pure matrix/vector math utilities for portfolio optimization.
 * No external dependencies — keeps bundle small.
 */

// ── Vector Operations ──────────────────────────────────────

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function vecAdd(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]!);
}

export function vecSub(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - b[i]!);
}

export function vecScale(a: number[], s: number): number[] {
  return a.map((v) => v * s);
}

export function vecSum(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return s;
}

export function vecNorm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

export function ones(n: number): number[] {
  return new Array(n).fill(1);
}

export function zeros(n: number): number[] {
  return new Array(n).fill(0);
}

// ── Matrix Operations ──────────────────────────────────────

export function matVec(A: number[][], x: number[]): number[] {
  return A.map((row) => dot(row, x));
}

export function multiply(A: number[][], B: number[][]): number[][] {
  const rows = A.length;
  const cols = B[0]!.length;
  const bCols = B.length;
  const C: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < bCols; k++) {
      const aik = A[i]![k]!;
      for (let j = 0; j < cols; j++) {
        C[i]![j]! += aik * B[k]![j]!;
      }
    }
  }
  return C;
}

export function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0]!.length;
  const T: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j]![i] = A[i]![j]!;
    }
  }
  return T;
}

/** Gauss-Jordan elimination for matrix inverse */
export function inverse(A: number[][]): number[][] {
  const n = A.length;
  // Augmented matrix [A | I]
  const aug: number[][] = A.map((row, i) => {
    const augRow = new Array(2 * n).fill(0);
    for (let j = 0; j < n; j++) augRow[j] = row[j]!;
    augRow[n + i] = 1;
    return augRow;
  });

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(aug[col]![col]!);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row]![col]!);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) {
      throw new Error('Matrix is singular or near-singular');
    }
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow]!, aug[col]!];
    }

    // Scale pivot row
    const pivot = aug[col]![col]!;
    for (let j = col; j < 2 * n; j++) {
      aug[col]![j]! /= pivot;
    }

    // Eliminate other rows
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      for (let j = col; j < 2 * n; j++) {
        aug[row]![j]! -= factor * aug[col]![j]!;
      }
    }
  }

  // Extract right half
  return aug.map((row) => row.slice(n));
}

/** Cholesky decomposition: returns lower-triangular L such that A = L * L^T */
export function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i]![k]! * L[j]![k]!;
      }
      if (i === j) {
        const diag = A[i]![i]! - sum;
        if (diag <= 0) throw new Error('Matrix is not positive definite');
        L[i]![j] = Math.sqrt(diag);
      } else {
        L[i]![j] = (A[i]![j]! - sum) / L[j]![j]!;
      }
    }
  }
  return L;
}

/** Solve L * y = b via forward substitution (L is lower-triangular) */
export function forwardSolve(L: number[][], b: number[]): number[] {
  const n = L.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < i; j++) sum += L[i]![j]! * y[j]!;
    y[i] = (b[i]! - sum) / L[i]![i]!;
  }
  return y;
}

/** Solve L^T * x = y via backward substitution */
export function backwardSolve(L: number[][], y: number[]): number[] {
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) sum += L[j]![i]! * x[j]!;
    x[i] = (y[i]! - sum) / L[i]![i]!;
  }
  return x;
}

/** Solve A * x = b where A is positive definite, via Cholesky */
export function choleskySolve(A: number[][], b: number[]): number[] {
  const L = cholesky(A);
  const y = forwardSolve(L, b);
  return backwardSolve(L, y);
}

/** Identity matrix */
export function eye(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => {
    const row = new Array(n).fill(0);
    row[i] = 1;
    return row;
  });
}

/** Extract diagonal of a matrix */
export function diag(A: number[][]): number[] {
  return A.map((row, i) => row[i]!);
}

/** Create diagonal matrix from vector */
export function diagMat(v: number[]): number[][] {
  const n = v.length;
  return Array.from({ length: n }, (_, i) => {
    const row = new Array(n).fill(0);
    row[i] = v[i]!;
    return row;
  });
}

/** Regularize a covariance matrix by adding small value to diagonal */
export function regularize(cov: number[][], lambda: number = 1e-6): number[][] {
  return cov.map((row, i) =>
    row.map((v, j) => (i === j ? v + lambda : v)),
  );
}
