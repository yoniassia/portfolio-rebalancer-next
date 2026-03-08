/**
 * Equal-weight (1/N) allocation.
 * Trivial but included for API consistency.
 */

export interface EqualWeightParams {
  excludeIndices?: number[];
}

export function equalWeight(n: number, params?: EqualWeightParams): number[] {
  const excluded = new Set(params?.excludeIndices ?? []);
  const active = n - excluded.size;
  if (active <= 0) return new Array(n).fill(0);

  const w = 1 / active;
  return Array.from({ length: n }, (_, i) => (excluded.has(i) ? 0 : w));
}
