import { describe, it, expect } from 'vitest';
import { calculateDrift, portfolioToTargetAllocations } from './portfolio-analyzer';
import type { PortfolioAnalysis, TargetAllocation } from '../types/rebalancer';

function makeAnalysis(
  holdings: Array<{ instrumentId: number; symbol: string; weight: number; totalValue: number }>,
  totalValue: number,
  cash: number,
): PortfolioAnalysis {
  return {
    holdings: holdings.map(h => ({
      ...h,
      displayName: h.symbol,
      positions: [],
      totalUnits: h.totalValue / 100,
      investedAmount: h.totalValue * 0.9,
      pnl: h.totalValue * 0.1,
    })),
    totalValue,
    investedValue: holdings.reduce((s, h) => s + h.totalValue * 0.9, 0),
    availableCash: cash,
    cashWeight: totalValue > 0 ? cash / totalValue : 0,
    timestamp: new Date().toISOString(),
  };
}

describe('calculateDrift — edge cases', () => {
  it('handles case-insensitive symbol matching', () => {
    const analysis = makeAnalysis(
      [{ instrumentId: 100, symbol: 'aapl', weight: 0.5, totalValue: 5000 }],
      10000, 5000,
    );
    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0.5, instrumentId: 100 },
      { symbol: 'CASH', weight: 0.5, isCash: true },
    ];
    const drift = calculateDrift(analysis, targets);
    expect(drift.maxAbsDrift).toBeCloseTo(0, 4);
    expect(drift.isWithinBand(0.01)).toBe(true);
  });

  it('handles empty holdings with non-empty targets', () => {
    const analysis = makeAnalysis([], 10000, 10000);
    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0.6, instrumentId: 100 },
      { symbol: 'CASH', weight: 0.4, isCash: true },
    ];
    const drift = calculateDrift(analysis, targets);
    expect(drift.maxAbsDrift).toBeCloseTo(0.6, 4);
    expect(drift.isWithinBand(0.05)).toBe(false);
    const aaplDrift = drift.drifts.find(d => d.symbol === 'AAPL');
    expect(aaplDrift!.currentWeight).toBe(0);
    expect(aaplDrift!.drift).toBe(0.6);
  });

  it('handles empty targets (all holdings are orphaned)', () => {
    const analysis = makeAnalysis(
      [{ instrumentId: 100, symbol: 'AAPL', weight: 0.5, totalValue: 5000 }],
      10000, 5000,
    );
    const targets: TargetAllocation[] = [];
    const drift = calculateDrift(analysis, targets);
    expect(drift.drifts).toHaveLength(1);
    expect(drift.drifts[0].targetWeight).toBe(0);
    expect(drift.drifts[0].drift).toBeCloseTo(-0.5, 4);
  });

  it('ignores small weights below 0.001 threshold for orphaned instruments', () => {
    const analysis = makeAnalysis(
      [{ instrumentId: 100, symbol: 'DUST', weight: 0.0005, totalValue: 5 }],
      10000, 9995,
    );
    const targets: TargetAllocation[] = [
      { symbol: 'CASH', weight: 1.0, isCash: true },
    ];
    const drift = calculateDrift(analysis, targets);
    const dustDrift = drift.drifts.find(d => d.symbol === 'DUST');
    expect(dustDrift).toBeUndefined();
  });

  it('calculates driftPercent correctly for zero target weight', () => {
    const analysis = makeAnalysis(
      [{ instrumentId: 100, symbol: 'AAPL', weight: 0.3, totalValue: 3000 }],
      10000, 7000,
    );
    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0, instrumentId: 100 },
      { symbol: 'CASH', weight: 1.0, isCash: true },
    ];
    const drift = calculateDrift(analysis, targets);
    const aaplDrift = drift.drifts.find(d => d.symbol === 'AAPL');
    expect(aaplDrift!.driftPercent).toBe(1);
  });

  it('handles 100% cash portfolio correctly', () => {
    const analysis = makeAnalysis([], 10000, 10000);
    const targets: TargetAllocation[] = [
      { symbol: 'CASH', weight: 1.0, isCash: true },
    ];
    const drift = calculateDrift(analysis, targets);
    expect(drift.maxAbsDrift).toBeCloseTo(0, 4);
    expect(drift.isWithinBand(0.01)).toBe(true);
  });

  it('handles many instruments with tiny drift values', () => {
    const holdings = Array.from({ length: 20 }, (_, i) => ({
      instrumentId: i + 1,
      symbol: `SYM${i}`,
      weight: 0.05,
      totalValue: 500,
    }));
    const analysis = makeAnalysis(holdings, 10000, 0);
    const targets = holdings.map(h => ({
      symbol: h.symbol,
      weight: 0.0501,
      instrumentId: h.instrumentId,
    }));
    const drift = calculateDrift(analysis, targets);
    expect(drift.maxAbsDrift).toBeLessThan(0.01);
    expect(drift.isWithinBand(0.01)).toBe(true);
  });

  it('handles single-instrument portfolio with large drift', () => {
    const analysis = makeAnalysis(
      [{ instrumentId: 100, symbol: 'AAPL', weight: 1, totalValue: 10000 }],
      10000, 0,
    );
    const targets: TargetAllocation[] = [
      { symbol: 'AAPL', weight: 0.1, instrumentId: 100 },
      { symbol: 'GOOGL', weight: 0.45, instrumentId: 200 },
      { symbol: 'MSFT', weight: 0.45, instrumentId: 300 },
    ];
    const drift = calculateDrift(analysis, targets);
    expect(drift.maxAbsDrift).toBeCloseTo(0.9, 4);
    expect(drift.isWithinBand(0.05)).toBe(false);
  });
});

describe('portfolioToTargetAllocations — edge cases', () => {
  it('handles portfolio with zero cash', () => {
    const analysis = makeAnalysis(
      [{ instrumentId: 100, symbol: 'AAPL', weight: 1, totalValue: 10000 }],
      10000, 0,
    );
    const targets = portfolioToTargetAllocations(analysis);
    expect(targets).toHaveLength(1);
    expect(targets[0].symbol).toBe('AAPL');
    expect(targets[0].isCash).toBeFalsy();
  });

  it('handles empty portfolio (only cash)', () => {
    const analysis = makeAnalysis([], 5000, 5000);
    const targets = portfolioToTargetAllocations(analysis);
    expect(targets).toHaveLength(1);
    expect(targets[0].symbol).toBe('CASH');
    expect(targets[0].weight).toBe(1);
  });
});
