import { describe, it, expect } from 'vitest';
import { createRebalancePlan } from './rebalance-planner';
import type { PortfolioAnalysis, TargetAllocation, InstrumentValidation } from '../types/rebalancer';

function makeAnalysis(holdings: Array<{
  instrumentId: number; symbol: string; weight: number; totalValue: number;
  totalUnits: number; investedAmount: number; positions: any[];
}>, totalValue: number, availableCash: number): PortfolioAnalysis {
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

describe('rebalance-planner', () => {
  describe('createRebalancePlan', () => {
    it('creates full closes for instruments not in targets', () => {
      const analysis = makeAnalysis([
        {
          instrumentId: 100, symbol: 'AAPL', weight: 0.5, totalValue: 5000,
          totalUnits: 50, investedAmount: 4000,
          positions: [{ positionID: 1, instrumentID: 100, units: 50, amount: 4000, isBuy: true, openRate: 80, leverage: 1, stopLossRate: null, takeProfitRate: null }],
        },
        {
          instrumentId: 200, symbol: 'GOOGL', weight: 0.3, totalValue: 3000,
          totalUnits: 30, investedAmount: 2500,
          positions: [{ positionID: 2, instrumentID: 200, units: 30, amount: 2500, isBuy: true, openRate: 83, leverage: 1, stopLossRate: null, takeProfitRate: null }],
        },
      ], 10000, 2000);

      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.8, instrumentId: 100 },
        { symbol: 'CASH', weight: 0.2, isCash: true },
      ];

      const plan = createRebalancePlan({
        analysis, targets, validations: makeValidation(targets),
      });

      expect(plan.fullCloses.length).toBeGreaterThanOrEqual(1);
      expect(plan.fullCloses[0].symbol).toBe('GOOGL');
      expect(plan.fullCloses[0].action).toBe('full-close');
    });

    it('creates partial closes for overweight instruments', () => {
      const analysis = makeAnalysis([
        {
          instrumentId: 100, symbol: 'AAPL', weight: 0.6, totalValue: 6000,
          totalUnits: 60, investedAmount: 5000,
          positions: [{ positionID: 1, instrumentID: 100, units: 60, amount: 5000, isBuy: true, openRate: 83, leverage: 1, stopLossRate: null, takeProfitRate: null }],
        },
      ], 10000, 4000);

      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.3, instrumentId: 100 },
        { symbol: 'CASH', weight: 0.7, isCash: true },
      ];

      const plan = createRebalancePlan({
        analysis, targets, validations: makeValidation(targets),
      });

      expect(plan.partialCloses.length).toBeGreaterThanOrEqual(1);
      expect(plan.partialCloses[0].symbol).toBe('AAPL');
      expect(plan.partialCloses[0].action).toBe('partial-close');
      expect(plan.partialCloses[0].amount).toBeGreaterThan(0);
    });

    it('creates buy orders for underweight instruments', () => {
      const analysis = makeAnalysis([
        {
          instrumentId: 100, symbol: 'AAPL', weight: 0.2, totalValue: 2000,
          totalUnits: 20, investedAmount: 1800,
          positions: [{ positionID: 1, instrumentID: 100, units: 20, amount: 1800, isBuy: true, openRate: 90, leverage: 1, stopLossRate: null, takeProfitRate: null }],
        },
      ], 10000, 8000);

      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.5, instrumentId: 100 },
        { symbol: 'GOOGL', weight: 0.3, instrumentId: 200 },
        { symbol: 'CASH', weight: 0.2, isCash: true },
      ];

      const plan = createRebalancePlan({
        analysis, targets, validations: makeValidation(targets),
      });

      expect(plan.opens.length).toBeGreaterThanOrEqual(1);

      const aaplBuy = plan.opens.find(o => o.symbol === 'AAPL');
      expect(aaplBuy).toBeDefined();
      expect(aaplBuy!.action).toBe('buy');
      expect(aaplBuy!.amount).toBeCloseTo(3000, -1); // need 5000 total, have 2000

      const googlBuy = plan.opens.find(o => o.symbol === 'GOOGL');
      expect(googlBuy).toBeDefined();
      expect(googlBuy!.amount).toBeCloseTo(3000, -1);
    });

    it('handles balanced portfolio (no trades needed)', () => {
      const analysis = makeAnalysis([
        {
          instrumentId: 100, symbol: 'AAPL', weight: 0.5, totalValue: 5000,
          totalUnits: 50, investedAmount: 4000,
          positions: [{ positionID: 1, instrumentID: 100, units: 50, amount: 4000, isBuy: true, openRate: 80, leverage: 1, stopLossRate: null, takeProfitRate: null }],
        },
      ], 10000, 5000);

      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.5, instrumentId: 100 },
        { symbol: 'CASH', weight: 0.5, isCash: true },
      ];

      const plan = createRebalancePlan({
        analysis, targets, validations: makeValidation(targets),
      });

      expect(plan.fullCloses).toHaveLength(0);
      expect(plan.partialCloses).toHaveLength(0);
      expect(plan.opens).toHaveLength(0);
    });

    it('scales buy amounts when cash is insufficient', () => {
      const analysis = makeAnalysis([], 1000, 1000);

      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.4, instrumentId: 100 },
        { symbol: 'GOOGL', weight: 0.4, instrumentId: 200 },
        { symbol: 'CASH', weight: 0.2, isCash: true },
      ];

      const plan = createRebalancePlan({
        analysis, targets, validations: makeValidation(targets),
      });

      const totalBuyAmount = plan.opens.reduce((s, o) => s + o.amount, 0);
      const cashForInvesting = 1000 - (1000 * 0.2); // 800
      expect(totalBuyAmount).toBeLessThanOrEqual(cashForInvesting + 1);
    });

    it('handles empty portfolio correctly', () => {
      const analysis = makeAnalysis([], 5000, 5000);

      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.5, instrumentId: 100 },
        { symbol: 'GOOGL', weight: 0.3, instrumentId: 200 },
        { symbol: 'CASH', weight: 0.2, isCash: true },
      ];

      const plan = createRebalancePlan({
        analysis, targets, validations: makeValidation(targets),
      });

      expect(plan.fullCloses).toHaveLength(0);
      expect(plan.partialCloses).toHaveLength(0);
      expect(plan.opens).toHaveLength(2);

      const aaplBuy = plan.opens.find(o => o.symbol === 'AAPL');
      expect(aaplBuy!.amount).toBeCloseTo(2500, -1);

      const googlBuy = plan.opens.find(o => o.symbol === 'GOOGL');
      expect(googlBuy!.amount).toBeCloseTo(1500, -1);
    });

    it('tracks estimated cash flows correctly', () => {
      const analysis = makeAnalysis([
        {
          instrumentId: 100, symbol: 'OLD', weight: 1, totalValue: 5000,
          totalUnits: 50, investedAmount: 4000,
          positions: [{ positionID: 1, instrumentID: 100, units: 50, amount: 4000, isBuy: true, openRate: 80, leverage: 1, stopLossRate: null, takeProfitRate: null }],
        },
      ], 6000, 1000);

      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.8, instrumentId: 200 },
        { symbol: 'CASH', weight: 0.2, isCash: true },
      ];

      const plan = createRebalancePlan({
        analysis, targets, validations: makeValidation(targets),
      });

      expect(plan.estimatedCashFromCloses).toBeGreaterThan(0);
      expect(plan.estimatedCashNeeded).toBeGreaterThan(0);
    });

    it('skips invalid instruments', () => {
      const analysis = makeAnalysis([], 10000, 10000);

      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.5, instrumentId: 100 },
        { symbol: 'INVALID', weight: 0.3, instrumentId: 999 },
        { symbol: 'CASH', weight: 0.2, isCash: true },
      ];

      const validations: InstrumentValidation[] = [
        { symbol: 'AAPL', instrumentId: 100, isValid: true, isOpen: true, isTradable: true, isBuyEnabled: true, status: 'valid' },
        { symbol: 'INVALID', instrumentId: 999, isValid: false, isOpen: false, isTradable: false, isBuyEnabled: false, status: 'error', error: 'Not found' },
      ];

      const plan = createRebalancePlan({ analysis, targets, validations });

      expect(plan.opens.length).toBe(1);
      expect(plan.opens[0].symbol).toBe('AAPL');
    });
  });
});
