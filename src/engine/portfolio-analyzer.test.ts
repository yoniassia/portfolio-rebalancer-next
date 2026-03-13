import { describe, it, expect } from 'vitest';
import { analyzePortfolio, calculateDrift, portfolioToTargetAllocations } from './portfolio-analyzer';
import type { PortfolioAnalysis, TargetAllocation } from '../types/rebalancer';

function makePortfolio(positions: any[], credit = 1000) {
  return { positions, credit };
}

function makeRates(rates: Array<{ id: number; bid: number }>) {
  return rates.map(r => ({ instrumentID: r.id, bid: r.bid, ask: r.bid * 1.001 }));
}

describe('portfolio-analyzer', () => {
  describe('analyzePortfolio', () => {
    it('calculates holdings, weights, and PnL correctly', () => {
      const portfolio = makePortfolio([
        { positionID: 1, instrumentID: 100, isBuy: true, amount: 500, units: 5, openRate: 100, leverage: 1, stopLossRate: null, takeProfitRate: null },
        { positionID: 2, instrumentID: 200, isBuy: true, amount: 300, units: 3, openRate: 100, leverage: 1, stopLossRate: null, takeProfitRate: null },
      ], 200);

      const rates = makeRates([
        { id: 100, bid: 120 }, // 5 units * 120 = 600
        { id: 200, bid: 110 }, // 3 units * 110 = 330
      ]);

      const symbolMap = new Map([[100, 'AAPL'], [200, 'GOOGL']]);
      const displayMap = new Map([[100, 'Apple'], [200, 'Google']]);

      const result = analyzePortfolio(portfolio, rates, symbolMap, displayMap);

      expect(result.holdings).toHaveLength(2);
      expect(result.totalValue).toBe(600 + 330 + 200); // 1130
      expect(result.availableCash).toBe(200);
      expect(result.cashWeight).toBeCloseTo(200 / 1130, 4);

      const apple = result.holdings.find(h => h.symbol === 'AAPL');
      expect(apple).toBeDefined();
      expect(apple!.totalValue).toBe(600);
      expect(apple!.pnl).toBe(600 - 500); // 100 profit
      expect(apple!.weight).toBeCloseTo(600 / 1130, 4);
    });

    it('groups multiple positions for same instrument', () => {
      const portfolio = makePortfolio([
        { positionID: 1, instrumentID: 100, isBuy: true, amount: 200, units: 2, openRate: 100, leverage: 1, stopLossRate: null, takeProfitRate: null },
        { positionID: 2, instrumentID: 100, isBuy: true, amount: 300, units: 3, openRate: 100, leverage: 1, stopLossRate: null, takeProfitRate: null },
      ]);

      const rates = makeRates([{ id: 100, bid: 110 }]);
      const symbolMap = new Map([[100, 'AAPL']]);
      const displayMap = new Map([[100, 'Apple']]);

      const result = analyzePortfolio(portfolio, rates, symbolMap, displayMap);
      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0].totalUnits).toBe(5);
      expect(result.holdings[0].totalValue).toBe(550);
      expect(result.holdings[0].investedAmount).toBe(500);
    });

    it('handles empty portfolio', () => {
      const portfolio = makePortfolio([], 5000);
      const result = analyzePortfolio(portfolio, [], new Map(), new Map());
      expect(result.holdings).toHaveLength(0);
      expect(result.totalValue).toBe(5000);
      expect(result.cashWeight).toBe(1);
    });

    it('sorts holdings by weight descending', () => {
      const portfolio = makePortfolio([
        { positionID: 1, instrumentID: 100, isBuy: true, amount: 100, units: 1, openRate: 100, leverage: 1, stopLossRate: null, takeProfitRate: null },
        { positionID: 2, instrumentID: 200, isBuy: true, amount: 500, units: 5, openRate: 100, leverage: 1, stopLossRate: null, takeProfitRate: null },
      ]);
      const rates = makeRates([{ id: 100, bid: 100 }, { id: 200, bid: 200 }]);
      const symbolMap = new Map([[100, 'SMALL'], [200, 'BIG']]);
      const displayMap = new Map([[100, 'Small'], [200, 'Big']]);

      const result = analyzePortfolio(portfolio, rates, symbolMap, displayMap);
      expect(result.holdings[0].symbol).toBe('BIG');
      expect(result.holdings[1].symbol).toBe('SMALL');
    });
  });

  describe('calculateDrift', () => {
    const analysis: PortfolioAnalysis = {
      holdings: [
        { instrumentId: 100, symbol: 'AAPL', displayName: 'Apple', positions: [], totalUnits: 10, totalValue: 3000, investedAmount: 2500, weight: 0.3, pnl: 500 },
        { instrumentId: 200, symbol: 'GOOGL', displayName: 'Google', positions: [], totalUnits: 5, totalValue: 2000, investedAmount: 1800, weight: 0.2, pnl: 200 },
        { instrumentId: 300, symbol: 'MSFT', displayName: 'Microsoft', positions: [], totalUnits: 8, totalValue: 4000, investedAmount: 3500, weight: 0.4, pnl: 500 },
      ],
      totalValue: 10000,
      investedValue: 7800,
      availableCash: 1000,
      cashWeight: 0.1,
      timestamp: new Date().toISOString(),
    };

    it('calculates drift for each target allocation', () => {
      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.25, instrumentId: 100 },
        { symbol: 'GOOGL', weight: 0.25, instrumentId: 200 },
        { symbol: 'MSFT', weight: 0.40, instrumentId: 300 },
        { symbol: 'CASH', weight: 0.10, isCash: true },
      ];

      const drift = calculateDrift(analysis, targets);
      expect(drift.drifts).toHaveLength(4);

      const aaplDrift = drift.drifts.find(d => d.symbol === 'AAPL');
      expect(aaplDrift).toBeDefined();
      expect(aaplDrift!.currentWeight).toBeCloseTo(0.3, 4);
      expect(aaplDrift!.targetWeight).toBe(0.25);
      expect(aaplDrift!.drift).toBeCloseTo(-0.05, 4); // 0.25 - 0.30 = -0.05

      const googlDrift = drift.drifts.find(d => d.symbol === 'GOOGL');
      expect(googlDrift!.drift).toBeCloseTo(0.05, 4); // 0.25 - 0.20 = 0.05
    });

    it('detects when portfolio is within band', () => {
      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.30, instrumentId: 100 },
        { symbol: 'GOOGL', weight: 0.20, instrumentId: 200 },
        { symbol: 'MSFT', weight: 0.40, instrumentId: 300 },
        { symbol: 'CASH', weight: 0.10, isCash: true },
      ];

      const drift = calculateDrift(analysis, targets);
      expect(drift.maxAbsDrift).toBeCloseTo(0, 4);
      expect(drift.isWithinBand(0.05)).toBe(true);
    });

    it('detects when portfolio exceeds drift threshold', () => {
      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.10, instrumentId: 100 }, // big drift: was 0.3
        { symbol: 'GOOGL', weight: 0.20, instrumentId: 200 },
        { symbol: 'MSFT', weight: 0.60, instrumentId: 300 }, // drift: was 0.4
        { symbol: 'CASH', weight: 0.10, isCash: true },
      ];

      const drift = calculateDrift(analysis, targets);
      expect(drift.maxAbsDrift).toBeCloseTo(0.2, 4); // AAPL: 0.10 - 0.30 = -0.20
      expect(drift.isWithinBand(0.05)).toBe(false);
      expect(drift.isWithinBand(0.25)).toBe(true);
    });

    it('handles instruments in portfolio but not in targets (full drift)', () => {
      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.50, instrumentId: 100 },
        { symbol: 'CASH', weight: 0.50, isCash: true },
      ];

      const drift = calculateDrift(analysis, targets);
      const googlDrift = drift.drifts.find(d => d.symbol === 'GOOGL');
      expect(googlDrift).toBeDefined();
      expect(googlDrift!.targetWeight).toBe(0);
      expect(googlDrift!.drift).toBeCloseTo(-0.2, 4);
    });

    it('handles new instruments in targets but not in portfolio', () => {
      const targets: TargetAllocation[] = [
        { symbol: 'AAPL', weight: 0.25, instrumentId: 100 },
        { symbol: 'TSLA', weight: 0.25, instrumentId: 400 }, // not in portfolio
        { symbol: 'CASH', weight: 0.50, isCash: true },
      ];

      const drift = calculateDrift(analysis, targets);
      const tslaDrift = drift.drifts.find(d => d.symbol === 'TSLA');
      expect(tslaDrift).toBeDefined();
      expect(tslaDrift!.currentWeight).toBe(0);
      expect(tslaDrift!.drift).toBe(0.25);
    });
  });

  describe('portfolioToTargetAllocations', () => {
    it('converts portfolio holdings to target allocations', () => {
      const analysis: PortfolioAnalysis = {
        holdings: [
          { instrumentId: 100, symbol: 'AAPL', displayName: 'Apple', positions: [], totalUnits: 10, totalValue: 3000, investedAmount: 2500, weight: 0.6, pnl: 500 },
        ],
        totalValue: 5000,
        investedValue: 2500,
        availableCash: 2000,
        cashWeight: 0.4,
        timestamp: new Date().toISOString(),
      };

      const targets = portfolioToTargetAllocations(analysis);
      expect(targets).toHaveLength(2);

      const aaplTarget = targets.find(t => t.symbol === 'AAPL');
      expect(aaplTarget).toBeDefined();
      expect(aaplTarget!.weight).toBe(0.6);
      expect(aaplTarget!.isCash).toBeFalsy();

      const cashTarget = targets.find(t => t.symbol === 'CASH');
      expect(cashTarget).toBeDefined();
      expect(cashTarget!.weight).toBe(0.4);
      expect(cashTarget!.isCash).toBe(true);
    });
  });
});
