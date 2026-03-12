const FINANCIAL_DATASETS_API_KEY = 'f4cd5217-2afe-4d8e-9031-1328633c8532';

export interface MarketCapInput {
  instrumentId: number;
  symbol: string;
  popularityScore?: number;
}

export interface MarketCapWeightParams {
  maxWeight: number;
  minWeight: number;
}

function normalize(weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) {
    return weights.length > 0 ? weights.map(() => 1 / weights.length) : [];
  }
  return weights.map((weight) => weight / sum);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

async function fetchMarketCap(symbol: string): Promise<number | null> {
  const url = `https://api.financialdatasets.ai/financial-metrics/snapshot/?ticker=${encodeURIComponent(symbol)}`;
  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': FINANCIAL_DATASETS_API_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cap = data?.snapshot?.market_cap;
    return typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? cap : null;
  } catch {
    return null;
  }
}

export async function marketCapWeight(
  instruments: MarketCapInput[],
  params: MarketCapWeightParams,
): Promise<{ weights: number[]; coverage: { confirmed: number; estimated: number } }> {
  const n = instruments.length;
  if (n === 0) {
    return { weights: [], coverage: { confirmed: 0, estimated: 0 } };
  }

  const resolved = await Promise.all(instruments.map((instrument) => fetchMarketCap(instrument.symbol)));
  const confirmedCaps = resolved.filter((value): value is number => typeof value === 'number' && value > 0);
  const confirmed = confirmedCaps.length;
  const medianConfirmedCap = median(confirmedCaps);

  const caps = instruments.map((instrument, index) => {
    const confirmedCap = resolved[index];
    if (typeof confirmedCap === 'number' && confirmedCap > 0) return confirmedCap;
    if (confirmed > 0 && typeof instrument.popularityScore === 'number' && instrument.popularityScore > 0) {
      return instrument.popularityScore * (medianConfirmedCap / 1000);
    }
    return 1;
  });

  const totalCap = caps.reduce((acc, cap) => acc + cap, 0);
  if (totalCap === 0) {
    return {
      weights: instruments.map(() => 1 / n),
      coverage: { confirmed: 0, estimated: n },
    };
  }

  let weights = caps.map((cap) => cap / totalCap);

  for (let iter = 0; iter < 20; iter++) {
    const capped = new Set<number>();
    let changed = false;

    for (let i = 0; i < weights.length; i++) {
      if (weights[i]! > params.maxWeight) {
        weights[i] = params.maxWeight;
        capped.add(i);
        changed = true;
      }
    }

    if (!changed) break;

    const cappedWeight = [...capped].reduce((sum, idx) => sum + weights[idx]!, 0);
    const remainingCapacity = Math.max(0, 1 - cappedWeight);
    const uncappedIndices = weights.map((_, i) => i).filter((i) => !capped.has(i));
    const uncappedBase = uncappedIndices.reduce((sum, i) => sum + caps[i]!, 0);

    if (uncappedIndices.length === 0 || uncappedBase <= 0) break;

    for (const idx of uncappedIndices) {
      weights[idx] = remainingCapacity * (caps[idx]! / uncappedBase);
    }
  }

  weights = weights.map((weight) => (weight < params.minWeight ? 0 : weight));
  weights = normalize(weights);

  return {
    weights,
    coverage: {
      confirmed,
      estimated: n - confirmed,
    },
  };
}
