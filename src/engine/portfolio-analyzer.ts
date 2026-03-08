import type {
  PortfolioAnalysis,
  PortfolioHolding,
  TargetAllocation,
  DriftAnalysis,
  DriftItem,
} from '../types/rebalancer';

interface ClientPortfolio {
  positions: Array<{
    positionID: number;
    instrumentID: number;
    isBuy: boolean;
    amount: number;
    units: number;
    openRate: number;
    leverage: number;
    stopLossRate: number | null;
    takeProfitRate: number | null;
    [key: string]: unknown;
  }>;
  credit: number;
  [key: string]: unknown;
}

interface InstrumentRate {
  instrumentID?: number;
  instrumentId?: number;
  bid: number;
  ask: number;
  [key: string]: unknown;
}

export function analyzePortfolio(
  portfolio: ClientPortfolio,
  rates: InstrumentRate[],
  symbolMap: Map<number, string>,
  displayNameMap: Map<number, string>,
): PortfolioAnalysis {
  const rateMap = new Map<number, number>();
  for (const r of rates) {
    const id = r.instrumentID ?? r.instrumentId ?? 0;
    rateMap.set(id, r.bid);
  }

  // Group positions by instrumentID
  // Note: the portfolio API only returns open positions, so no isOpen filter needed
  const grouped = new Map<number, ClientPortfolio['positions']>();
  for (const pos of portfolio.positions) {
    const existing = grouped.get(pos.instrumentID) ?? [];
    existing.push(pos);
    grouped.set(pos.instrumentID, existing);
  }

  const holdings: PortfolioHolding[] = [];
  let totalPositionValue = 0;

  for (const [instrumentId, positions] of grouped) {
    let totalUnits = 0;
    let investedAmount = 0;

    for (const pos of positions) {
      totalUnits += pos.units;
      investedAmount += pos.amount;
    }

    const bidPrice = rateMap.get(instrumentId) ?? 0;
    const totalValue = totalUnits * bidPrice;
    totalPositionValue += totalValue;

    holdings.push({
      instrumentId,
      symbol: symbolMap.get(instrumentId) ?? `ID:${instrumentId}`,
      displayName: displayNameMap.get(instrumentId) ?? `Instrument ${instrumentId}`,
      positions: positions as PortfolioHolding['positions'],
      totalUnits,
      totalValue,
      investedAmount,
      weight: 0, // calculated below
      pnl: totalValue - investedAmount,
    });
  }

  const availableCash = portfolio.credit ?? 0;
  const totalValue = totalPositionValue + availableCash;

  // Calculate weights
  for (const h of holdings) {
    h.weight = totalValue > 0 ? h.totalValue / totalValue : 0;
  }

  // Sort by weight descending
  holdings.sort((a, b) => b.weight - a.weight);

  return {
    holdings,
    totalValue,
    investedValue: holdings.reduce((sum, h) => sum + h.investedAmount, 0),
    availableCash,
    cashWeight: totalValue > 0 ? availableCash / totalValue : 0,
    timestamp: new Date().toISOString(),
  };
}

export function calculateDrift(
  analysis: PortfolioAnalysis,
  targets: TargetAllocation[],
): DriftAnalysis {
  const currentWeights = new Map<string, number>();
  for (const h of analysis.holdings) {
    currentWeights.set(h.symbol.toUpperCase(), h.weight);
  }
  currentWeights.set('CASH', analysis.cashWeight);

  const drifts: DriftItem[] = [];
  let maxAbsDrift = 0;

  for (const target of targets) {
    const key = target.symbol.toUpperCase();
    const currentWeight = currentWeights.get(key) ?? 0;
    const drift = target.weight - currentWeight;
    const driftPercent = target.weight > 0 ? Math.abs(drift) / target.weight : (drift !== 0 ? 1 : 0);

    drifts.push({
      symbol: target.symbol,
      instrumentId: target.instrumentId,
      currentWeight,
      targetWeight: target.weight,
      drift,
      driftPercent,
    });

    maxAbsDrift = Math.max(maxAbsDrift, Math.abs(drift));
    currentWeights.delete(key);
  }

  // Instruments in portfolio but not in targets → drift to 0
  for (const [symbol, weight] of currentWeights) {
    if (weight > 0.001 && symbol !== 'CASH') {
      drifts.push({
        symbol,
        currentWeight: weight,
        targetWeight: 0,
        drift: -weight,
        driftPercent: 1,
      });
      maxAbsDrift = Math.max(maxAbsDrift, weight);
    }
  }

  return {
    drifts,
    maxAbsDrift,
    isWithinBand: (threshold: number) => maxAbsDrift <= threshold,
  };
}

export function portfolioToTargetAllocations(
  analysis: PortfolioAnalysis,
): TargetAllocation[] {
  const allocations: TargetAllocation[] = analysis.holdings.map((h) => ({
    symbol: h.symbol,
    weight: h.weight,
    instrumentId: h.instrumentId,
    displayName: h.displayName,
    isCash: false,
  }));

  if (analysis.cashWeight > 0) {
    allocations.push({
      symbol: 'CASH',
      weight: analysis.cashWeight,
      isCash: true,
      displayName: 'Cash',
    });
  }

  return allocations;
}
