import type {
  PortfolioAnalysis,
  TargetAllocation,
  InstrumentValidation,
  RebalancePlan,
  PlannedTrade,
} from '../types/rebalancer';

interface PlannerInput {
  analysis: PortfolioAnalysis;
  targets: TargetAllocation[];
  validations: InstrumentValidation[];
}

export function createRebalancePlan(input: PlannerInput): RebalancePlan {
  const { analysis, targets, validations } = input;
  const { totalValue, availableCash } = analysis;

  // Build lookup maps
  const targetMap = new Map<string, TargetAllocation>();
  for (const t of targets) {
    targetMap.set(t.symbol.toUpperCase(), t);
  }

  const validMap = new Map<string, InstrumentValidation>();
  for (const v of validations) {
    validMap.set(v.symbol.toUpperCase(), v);
  }

  const holdingMap = new Map<string, (typeof analysis.holdings)[0]>();
  for (const h of analysis.holdings) {
    holdingMap.set(h.symbol.toUpperCase(), h);
  }

  const fullCloses: PlannedTrade[] = [];
  const partialCloses: PlannedTrade[] = [];
  const opens: PlannedTrade[] = [];
  let estimatedCashFromCloses = 0;

  // Phase 1: Full Closes — instruments in portfolio but NOT in target (or weight=0)
  for (const holding of analysis.holdings) {
    const key = holding.symbol.toUpperCase();
    const target = targetMap.get(key);

    if (!target || target.weight === 0) {
      for (const pos of holding.positions) {
        const amount = pos.units * (holding.totalValue / holding.totalUnits);
        fullCloses.push({
          symbol: holding.symbol,
          instrumentId: holding.instrumentId,
          action: 'full-close',
          positionId: pos.positionID,
          amount,
          reason: target ? 'Target weight is 0%' : 'Not in target portfolio',
        });
        estimatedCashFromCloses += amount;
      }
    }
  }

  // Phase 2: Partial Closes — overweight instruments
  for (const holding of analysis.holdings) {
    const key = holding.symbol.toUpperCase();
    const target = targetMap.get(key);
    if (!target || target.weight === 0) continue; // handled above

    const targetValue = totalValue * target.weight;
    const excess = holding.totalValue - targetValue;

    if (excess > 1) {
      // Proportionally reduce positions
      for (const pos of holding.positions) {
        const posValue = pos.units * (holding.totalValue / holding.totalUnits);
        const posExcess = posValue * (excess / holding.totalValue);
        if (posExcess < 1) continue;

        const unitsToDeduct = pos.units * (excess / holding.totalValue);

        partialCloses.push({
          symbol: holding.symbol,
          instrumentId: holding.instrumentId,
          action: 'partial-close',
          positionId: pos.positionID,
          amount: posExcess,
          units: unitsToDeduct,
          reason: `Reduce from ${((holding.weight) * 100).toFixed(1)}% to ${(target.weight * 100).toFixed(1)}%`,
        });
        estimatedCashFromCloses += posExcess;
      }
    }
  }

  // Phase 3: Opens — underweight or new instruments
  const totalCashAvailable = availableCash + estimatedCashFromCloses;
  const cashTarget = targetMap.get('CASH');
  const cashForInvesting = totalCashAvailable - (cashTarget ? totalValue * cashTarget.weight : 0);

  // Calculate deficit for each underweight instrument
  const deficits: { symbol: string; instrumentId: number; amount: number; reason: string }[] = [];
  let totalNeeded = 0;

  for (const target of targets) {
    if (target.isCash) continue;
    const key = target.symbol.toUpperCase();
    const validation = validMap.get(key);
    if (validation && validation.status === 'error') continue;

    const instrumentId = validation?.instrumentId ?? target.instrumentId;
    if (!instrumentId) continue;

    const holding = holdingMap.get(key);
    const currentValue = holding?.totalValue ?? 0;
    const targetValue = totalValue * target.weight;
    const deficit = targetValue - currentValue;

    if (deficit > 1) {
      deficits.push({
        symbol: target.symbol,
        instrumentId,
        amount: deficit,
        reason: holding
          ? `Increase from ${((currentValue / totalValue) * 100).toFixed(1)}% to ${(target.weight * 100).toFixed(1)}%`
          : `New position at ${(target.weight * 100).toFixed(1)}%`,
      });
      totalNeeded += deficit;
    }
  }

  // Scale amounts if we don't have enough cash
  const scaleFactor = totalNeeded > 0 && cashForInvesting < totalNeeded
    ? cashForInvesting / totalNeeded
    : 1;

  for (const d of deficits) {
    const amount = d.amount * scaleFactor;
    if (amount < 1) continue;
    opens.push({
      symbol: d.symbol,
      instrumentId: d.instrumentId,
      action: 'buy',
      amount,
      reason: d.reason,
    });
  }

  const estimatedCashNeeded = opens.reduce((sum, o) => sum + o.amount, 0);

  return {
    fullCloses,
    partialCloses,
    opens,
    estimatedCashFromCloses,
    estimatedCashNeeded,
    estimatedCashAfter: totalCashAvailable - estimatedCashNeeded,
  };
}
