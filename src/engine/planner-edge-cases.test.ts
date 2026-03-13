import { describe, it, expect } from 'vitest';
import { createRebalancePlan } from './rebalance-planner';
import type { PortfolioAnalysis, TargetAllocation, InstrumentValidation } from '../types/rebalancer';

function makeAnalysis(
  holdings: Array<{
    instrumentId: number; symbol: string; weight: number; totalValue: number;
    totalUnits: number; investedAmount: number; positions: any[];
  }>,
  totalValue: number,
  availableCash: number,
): PortfolioAnalysis {
  return {
    holdings: holdings.map(h => ({
      ...h,
      displayName: h.symbol,
      pnl: h.totalValue - h.investedAmount,
    })),
    totalValue,
    investedValue: holdings.reduce((s, h) => s + h.investedAmount, 0),
    availableCash,
    cashWeight: totalValue > 0 ? availableCash / totalValue : 0,
    timestamp: new Date().toISOString(),
  };
}

function makeValidation(targets: TargetAllocation[]): InstrumentValidation[] {
  return targets
    .filter(t => !t.isCash)
    .map(t => ({
      symbol: t.symbol,
      instrumentId: t.instrumentId,
      isValid: true,
      isOpen: true,
      isTradable: true,
      isBuyEnabled: true,
      status: 'valid' as const,
    }));
}

describe('rebalance-planner — edge cases', () => {
  it('distributes partial close across multiple positions proportionally', () => {
    const analysis = makeAnalysis([{
      instrumentId: 100, symbol: 'AAPL', weight: 0.8, totalValue: 8000,
      totalUnits: 80, investedAmount: 7000,
      positions: [
        { positionID: 1, instrumentID: 100, units: 30, amount: 2625, isBuy: true, openRate: 87.5, leverage: 1, stopLossRate: null, takeProfitRate: null },
        { positionID: 2, instrumentID: 100, units: 50, amount: 4375, isBuy: true, openRate: 87.5, leverage: 1, stopLossRate: null, takeProfitRate: null },
      ],
    }], 10000, 2000);

    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0.4, instrumentId: 100 },
      { symbol: 'CASH', weight: 0.6, isCash: true },
    ];

    const plan = createRebalancePlan({ analysis, targets, validations: makeValidation(targets) });

    expect(plan.partialCloses.length).toBe(2);
    const totalCloseAmount = plan.partialCloses.reduce((s, t) => s + t.amount, 0);
    expect(totalCloseAmount).toBeCloseTo(4000, -1);

    const pos1Close = plan.partialCloses.find(t => t.positionId === 1);
    const pos2Close = plan.partialCloses.find(t => t.positionId === 2);
    expect(pos1Close).toBeDefined();
    expect(pos2Close).toBeDefined();
    expect(pos2Close!.amount).toBeGreaterThan(pos1Close!.amount);
  });

  it('handles extreme concentration (99% single stock)', () => {
    const analysis = makeAnalysis([{
      instrumentId: 100, symbol: 'TSLA', weight: 0.99, totalValue: 9900,
      totalUnits: 99, investedAmount: 8000,
      positions: [{ positionID: 1, instrumentID: 100, units: 99, amount: 8000, isBuy: true, openRate: 80.8, leverage: 1, stopLossRate: null, takeProfitRate: null }],
    }], 10000, 100);

    const targets: TargetAllocation[] = [
      { symbol: 'TSLA', weight: 0.25, instrumentId: 100 },
      { symbol: 'AAPL', weight: 0.25, instrumentId: 200 },
      { symbol: 'GOOGL', weight: 0.25, instrumentId: 300 },
      { symbol: 'CASH', weight: 0.25, isCash: true },
    ];

    const plan = createRebalancePlan({ analysis, targets, validations: makeValidation(targets) });

    expect(plan.partialCloses.length).toBeGreaterThanOrEqual(1);
    expect(plan.opens.length).toBeGreaterThanOrEqual(2);

    const totalBuyAmount = plan.opens.reduce((s, t) => s + t.amount, 0);
    expect(totalBuyAmount).toBeGreaterThan(0);
    expect(plan.estimatedCashFromCloses).toBeGreaterThan(0);
  });

  it('handles all-buy scenario (cash-heavy portfolio)', () => {
    const analysis = makeAnalysis([], 10000, 10000);

    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0.33, instrumentId: 100 },
      { symbol: 'GOOGL', weight: 0.33, instrumentId: 200 },
      { symbol: 'MSFT', weight: 0.34, instrumentId: 300 },
    ];

    const plan = createRebalancePlan({ analysis, targets, validations: makeValidation(targets) });

    expect(plan.fullCloses).toHaveLength(0);
    expect(plan.partialCloses).toHaveLength(0);
    expect(plan.opens).toHaveLength(3);

    const totalBuyAmount = plan.opens.reduce((s, t) => s + t.amount, 0);
    expect(totalBuyAmount).toBeCloseTo(10000, -1);
  });

  it('handles zero cash target (invest everything)', () => {
    const analysis = makeAnalysis([], 10000, 10000);

    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0.5, instrumentId: 100 },
      { symbol: 'GOOGL', weight: 0.5, instrumentId: 200 },
    ];

    const plan = createRebalancePlan({ analysis, targets, validations: makeValidation(targets) });

    expect(plan.opens).toHaveLength(2);
    const aaplBuy = plan.opens.find(o => o.symbol === 'AAPL');
    expect(aaplBuy!.amount).toBeCloseTo(5000, -1);
    expect(plan.estimatedCashAfter).toBeCloseTo(0, -1);
  });

  it('handles complete portfolio turnover (sell all, buy new)', () => {
    const analysis = makeAnalysis([
      {
        instrumentId: 100, symbol: 'OLD1', weight: 0.5, totalValue: 5000,
        totalUnits: 50, investedAmount: 4000,
        positions: [{ positionID: 1, instrumentID: 100, units: 50, amount: 4000, isBuy: true, openRate: 80, leverage: 1, stopLossRate: null, takeProfitRate: null }],
      },
      {
        instrumentId: 200, symbol: 'OLD2', weight: 0.3, totalValue: 3000,
        totalUnits: 30, investedAmount: 2500,
        positions: [{ positionID: 2, instrumentID: 200, units: 30, amount: 2500, isBuy: true, openRate: 83, leverage: 1, stopLossRate: null, takeProfitRate: null }],
      },
    ], 10000, 2000);

    const targets: TargetAllocation[] = [
      { symbol: 'NEW1', weight: 0.5, instrumentId: 300 },
      { symbol: 'NEW2', weight: 0.3, instrumentId: 400 },
      { symbol: 'CASH', weight: 0.2, isCash: true },
    ];

    const plan = createRebalancePlan({ analysis, targets, validations: makeValidation(targets) });

    expect(plan.fullCloses).toHaveLength(2);
    expect(plan.opens).toHaveLength(2);
    expect(plan.estimatedCashFromCloses).toBeCloseTo(8000, -1);
  });

  it('does not generate buys below $1 threshold', () => {
    const analysis = makeAnalysis([{
      instrumentId: 100, symbol: 'AAPL', weight: 0.998, totalValue: 9980,
      totalUnits: 100, investedAmount: 9000,
      positions: [{ positionID: 1, instrumentID: 100, units: 100, amount: 9000, isBuy: true, openRate: 90, leverage: 1, stopLossRate: null, takeProfitRate: null }],
    }], 10000, 20);

    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0.998, instrumentId: 100 },
      { symbol: 'GOOGL', weight: 0.001, instrumentId: 200 },
      { symbol: 'CASH', weight: 0.001, isCash: true },
    ];

    const plan = createRebalancePlan({ analysis, targets, validations: makeValidation(targets) });

    for (const buy of plan.opens) {
      expect(buy.amount).toBeGreaterThanOrEqual(1);
    }
  });

  it('estimatedCashAfter is non-negative', () => {
    const analysis = makeAnalysis([{
      instrumentId: 100, symbol: 'AAPL', weight: 0.5, totalValue: 5000,
      totalUnits: 50, investedAmount: 4000,
      positions: [{ positionID: 1, instrumentID: 100, units: 50, amount: 4000, isBuy: true, openRate: 80, leverage: 1, stopLossRate: null, takeProfitRate: null }],
    }], 10000, 5000);

    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0.5, instrumentId: 100 },
      { symbol: 'GOOGL', weight: 0.3, instrumentId: 200 },
      { symbol: 'CASH', weight: 0.2, isCash: true },
    ];

    const plan = createRebalancePlan({ analysis, targets, validations: makeValidation(targets) });

    expect(plan.estimatedCashAfter).toBeGreaterThanOrEqual(-1);
  });
});
