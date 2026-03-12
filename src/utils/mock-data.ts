import type {
  PortfolioAnalysis,
  TargetAllocation,
  InstrumentValidation,
  RebalancePlan,
  TradeProgress,
  ExecutionSummary,
  OptimizationResult,
  TradeAction,
} from '../types/rebalancer';

export function createMockPortfolio(): PortfolioAnalysis {
  const holdings = [
    { instrumentId: 1001, symbol: 'AAPL', displayName: 'Apple Inc', totalUnits: 10, totalValue: 2300, investedAmount: 2000, weight: 0, pnl: 300, positions: [{ positionID: 1, instrumentID: 1001, isBuy: true, amount: 2000, units: 10, openRate: 200, leverage: 1, stopLossRate: null, takeProfitRate: null, isOpen: true }] },
    { instrumentId: 1002, symbol: 'MSFT', displayName: 'Microsoft Corp', totalUnits: 5, totalValue: 2000, investedAmount: 1800, weight: 0, pnl: 200, positions: [{ positionID: 2, instrumentID: 1002, isBuy: true, amount: 1800, units: 5, openRate: 360, leverage: 1, stopLossRate: null, takeProfitRate: null, isOpen: true }] },
    { instrumentId: 1003, symbol: 'GOOGL', displayName: 'Alphabet Inc', totalUnits: 8, totalValue: 1400, investedAmount: 1500, weight: 0, pnl: -100, positions: [{ positionID: 3, instrumentID: 1003, isBuy: true, amount: 1500, units: 8, openRate: 187.5, leverage: 1, stopLossRate: null, takeProfitRate: null, isOpen: true }] },
    { instrumentId: 1004, symbol: 'TSLA', displayName: 'Tesla Inc', totalUnits: 6, totalValue: 900, investedAmount: 1000, weight: 0, pnl: -100, positions: [{ positionID: 4, instrumentID: 1004, isBuy: true, amount: 1000, units: 6, openRate: 166.67, leverage: 1, stopLossRate: null, takeProfitRate: null, isOpen: true }] },
    { instrumentId: 1009, symbol: 'BTC', displayName: 'Bitcoin', totalUnits: 0.03, totalValue: 2925, investedAmount: 2500, weight: 0, pnl: 425, positions: [{ positionID: 5, instrumentID: 1009, isBuy: true, amount: 2500, units: 0.03, openRate: 83333, leverage: 1, stopLossRate: null, takeProfitRate: null, isOpen: true }] },
  ];
  const availableCash = 475;
  const totalValue = holdings.reduce((s, h) => s + h.totalValue, 0) + availableCash;
  for (const h of holdings) h.weight = h.totalValue / totalValue;

  return {
    holdings: holdings as PortfolioAnalysis['holdings'],
    totalValue,
    investedValue: holdings.reduce((s, h) => s + h.investedAmount, 0),
    availableCash,
    cashWeight: availableCash / totalValue,
    timestamp: new Date().toISOString(),
  };
}

export function portfolioToTargetAllocations(analysis: PortfolioAnalysis): TargetAllocation[] {
  const allocations: TargetAllocation[] = analysis.holdings.map((h) => ({
    symbol: h.symbol,
    weight: h.weight,
    instrumentId: h.instrumentId,
    displayName: h.displayName,
    isCash: false,
  }));
  if (analysis.cashWeight > 0) {
    allocations.push({ symbol: 'CASH', weight: analysis.cashWeight, isCash: true, displayName: 'Cash' });
  }
  return allocations;
}

export function createMockValidations(): InstrumentValidation[] {
  return [
    { symbol: 'AAPL', instrumentId: 1001, displayName: 'Apple Inc', isValid: true, isOpen: true, isTradable: true, isBuyEnabled: true, status: 'valid' },
    { symbol: 'MSFT', instrumentId: 1002, displayName: 'Microsoft Corp', isValid: true, isOpen: true, isTradable: true, isBuyEnabled: true, status: 'valid' },
    { symbol: 'GOOGL', instrumentId: 1003, displayName: 'Alphabet Inc', isValid: true, isOpen: true, isTradable: true, isBuyEnabled: true, status: 'valid' },
    { symbol: 'TSLA', instrumentId: 1004, displayName: 'Tesla Inc', isValid: true, isOpen: true, isTradable: true, isBuyEnabled: true, status: 'valid' },
    { symbol: 'BTC', instrumentId: 1009, displayName: 'Bitcoin', isValid: true, isOpen: true, isTradable: true, isBuyEnabled: true, status: 'valid' },
    { symbol: 'AMZN', instrumentId: 1005, displayName: 'Amazon.com Inc', isValid: true, isOpen: false, isTradable: true, isBuyEnabled: true, status: 'warning' },
    { symbol: 'NVDA', instrumentId: 1006, displayName: 'NVIDIA Corp', isValid: true, isOpen: true, isTradable: true, isBuyEnabled: true, status: 'valid' },
  ];
}

export function createMockPlan(): RebalancePlan {
  return {
    fullCloses: [
      { symbol: 'TSLA', instrumentId: 1004, action: 'full-close', positionId: 4, amount: 900, reason: 'Not in target portfolio' },
    ],
    partialCloses: [
      { symbol: 'AAPL', instrumentId: 1001, action: 'partial-close', positionId: 1, amount: 300, units: 1.3, reason: 'Reduce from 22.8% to 20.0%' },
      { symbol: 'BTC', instrumentId: 1009, action: 'partial-close', positionId: 5, amount: 425, units: 0.004, reason: 'Reduce from 29.0% to 25.0%' },
    ],
    opens: [
      { symbol: 'AMZN', instrumentId: 1005, action: 'buy', amount: 800, reason: 'New position at 10.0%' },
      { symbol: 'NVDA', instrumentId: 1006, action: 'buy', amount: 800, reason: 'New position at 10.0%' },
    ],
    estimatedCashFromCloses: 1625,
    estimatedCashNeeded: 1600,
    estimatedCashAfter: 500,
  };
}

export function createMockExecutionProgress(): TradeProgress[] {
  return [
    { symbol: 'TSLA', instrumentId: 1004, action: 'full-close', positionId: 4, amount: 900, reason: 'Not in target', status: 'success', orderId: 4, executedAt: new Date().toISOString() },
    { symbol: 'AAPL', instrumentId: 1001, action: 'partial-close', positionId: 1, amount: 300, units: 1.3, reason: 'Reduce', status: 'success', orderId: 1, executedAt: new Date().toISOString() },
    { symbol: 'BTC', instrumentId: 1009, action: 'partial-close', positionId: 5, amount: 425, units: 0.004, reason: 'Reduce', status: 'success', orderId: 5, executedAt: new Date().toISOString() },
    { symbol: 'AMZN', instrumentId: 1005, action: 'buy', amount: 800, reason: 'New position', status: 'success', orderId: 100, executedAt: new Date().toISOString() },
    { symbol: 'NVDA', instrumentId: 1006, action: 'buy', amount: 800, reason: 'New position', status: 'failed', error: 'Market closed', executedAt: new Date().toISOString() },
  ];
}

export function createMockAfterPortfolio(): PortfolioAnalysis {
  const holdings = [
    { instrumentId: 1001, symbol: 'AAPL', displayName: 'Apple Inc', totalUnits: 8.7, totalValue: 2001, investedAmount: 1740, weight: 0, pnl: 261, positions: [] as any[] },
    { instrumentId: 1002, symbol: 'MSFT', displayName: 'Microsoft Corp', totalUnits: 5, totalValue: 2000, investedAmount: 1800, weight: 0, pnl: 200, positions: [] as any[] },
    { instrumentId: 1003, symbol: 'GOOGL', displayName: 'Alphabet Inc', totalUnits: 8, totalValue: 1400, investedAmount: 1500, weight: 0, pnl: -100, positions: [] as any[] },
    { instrumentId: 1009, symbol: 'BTC', displayName: 'Bitcoin', totalUnits: 0.026, totalValue: 2535, investedAmount: 2167, weight: 0, pnl: 368, positions: [] as any[] },
    { instrumentId: 1005, symbol: 'AMZN', displayName: 'Amazon.com Inc', totalUnits: 4, totalValue: 800, investedAmount: 800, weight: 0, pnl: 0, positions: [] as any[] },
  ];
  const availableCash = 500;
  const totalValue = holdings.reduce((s, h) => s + h.totalValue, 0) + availableCash;
  for (const h of holdings) h.weight = h.totalValue / totalValue;

  return {
    holdings: holdings as PortfolioAnalysis['holdings'],
    totalValue,
    investedValue: holdings.reduce((s, h) => s + h.investedAmount, 0),
    availableCash,
    cashWeight: availableCash / totalValue,
    timestamp: new Date().toISOString(),
  };
}

export function createMockSummary(): ExecutionSummary {
  return {
    totalTrades: 5,
    successful: 4,
    failed: 1,
    skipped: 0,
    totalFeesEstimate: 0,
    startedAt: new Date(Date.now() - 30000).toISOString(),
    completedAt: new Date().toISOString(),
    trades: createMockExecutionProgress(),
  };
}

export function createMockOptimizationResult(): OptimizationResult {
  return {
    weights: [0.15, 0.20, 0.15, 0.25, 0.10, 0.10, 0.05],
    method: 'risk-parity',
    instrumentIds: [1001, 1002, 1003, 1009, 1005, 1006, 0],
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'BTC', 'AMZN', 'NVDA', 'CASH'],
    metrics: {
      expectedReturn: 0.12,
      expectedVolatility: 0.18,
      sharpeRatio: 0.56,
      maxWeight: 0.25,
      diversificationRatio: 1.35,
    },
    riskContributions: [0.16, 0.17, 0.14, 0.20, 0.16, 0.17, 0],
    dataQuality: {
      dataPoints: 252,
      missingInstruments: [],
    },
  };
}

export function createMockValidation(allocations: TargetAllocation[]): InstrumentValidation[] {
  return allocations.filter(a => !a.isCash).map(a => ({
    symbol: a.symbol,
    instrumentId: a.instrumentId,
    displayName: a.displayName,
    isValid: true,
    isOpen: true,
    isTradable: true,
    isBuyEnabled: true,
    status: 'valid' as const,
  }));
}

export function createMockPlanFromAllocations(allocations: TargetAllocation[], portfolio: PortfolioAnalysis | null): RebalancePlan {
  const totalValue = portfolio?.totalValue ?? 10000;
  // Use directHoldings for rebalancing — copy positions are not rebalanceable
  const holdings = portfolio?.directHoldings ?? portfolio?.holdings?.filter(h => !h.isCopy) ?? portfolio?.holdings ?? [];

  const fullCloses: RebalancePlan['fullCloses'] = holdings
    .filter(h => !allocations.find(a => a.instrumentId === h.instrumentId || a.symbol === h.symbol))
    .map(h => ({
      symbol: h.symbol,
      instrumentId: h.instrumentId,
      action: 'full-close' as TradeAction,
      positionId: h.positions?.[0]?.positionID,
      amount: h.totalValue,
      reason: 'Not in target allocation',
    }));

  const partialCloses: RebalancePlan['partialCloses'] = allocations
    .filter(a => !a.isCash)
    .flatMap(a => {
      const holding = holdings.find(h => h.instrumentId === (a.instrumentId ?? -1));
      if (!holding || holding.weight <= a.weight) return [];
      const reduceAmount = (holding.weight - a.weight) * totalValue;
      const totalUnits = holding.totalUnits || 1;
      const unitPrice = holding.totalValue / totalUnits;
      const unitsToDeduct = unitPrice > 0 ? Math.round((reduceAmount / unitPrice) * 1e6) / 1e6 : undefined;
      return [{
        symbol: a.symbol,
        instrumentId: a.instrumentId ?? 0,
        action: 'partial-close' as TradeAction,
        positionId: holding.positions?.[0]?.positionID,
        amount: reduceAmount,
        units: unitsToDeduct,
        reason: `Reduce from ${(holding.weight * 100).toFixed(1)}% to ${(a.weight * 100).toFixed(1)}%`,
      }];
    });

  const opens: RebalancePlan['opens'] = allocations
    .filter(a => !a.isCash)
    .flatMap(a => {
      const holding = holdings.find(h => h.instrumentId === (a.instrumentId ?? -1));
      if (holding && holding.weight >= a.weight) return [];
      const buyAmount = a.weight * totalValue - (holding?.totalValue ?? 0);
      if (buyAmount < 1) return [];
      return [{
        symbol: a.symbol,
        instrumentId: a.instrumentId ?? 0,
        action: 'buy' as TradeAction,
        amount: Math.round(buyAmount * 100) / 100,
        reason: holding
          ? `Increase from ${(holding.weight * 100).toFixed(1)}% to ${(a.weight * 100).toFixed(1)}%`
          : `New position at ${(a.weight * 100).toFixed(1)}%`,
      }];
    });

  const cashFromCloses = [...fullCloses, ...partialCloses].reduce((s, t) => s + t.amount, 0);
  const cashNeeded = opens.reduce((s, t) => s + t.amount, 0);

  return {
    fullCloses,
    partialCloses,
    opens,
    estimatedCashFromCloses: cashFromCloses,
    estimatedCashNeeded: cashNeeded,
    estimatedCashAfter: (portfolio?.availableCash ?? 0) + cashFromCloses - cashNeeded,
  };
}
