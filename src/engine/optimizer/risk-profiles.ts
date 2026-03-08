/**
 * Risk profiles: maps Simple Mode risk levels (1-5) to optimization parameters.
 */
import type { OptimizationMethod } from '../../types/rebalancer';

export interface RiskProfile {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  method: OptimizationMethod;
  params: Record<string, number>;
  description: string;
  expectedVolRange: [number, number]; // annualized % range
}

export const RISK_PROFILES: Record<number, RiskProfile> = {
  1: {
    level: 1,
    label: 'Very Low',
    method: 'min-variance',
    params: { maxWeight: 0.15 },
    description: 'Conservative portfolio minimizing volatility with strict concentration limits.',
    expectedVolRange: [5, 10],
  },
  2: {
    level: 2,
    label: 'Low',
    method: 'risk-parity',
    params: { maxWeight: 0.20 },
    description: 'Cautious allocation with equal risk contribution per asset.',
    expectedVolRange: [8, 14],
  },
  3: {
    level: 3,
    label: 'Moderate',
    method: 'risk-parity',
    params: { maxWeight: 0.25 },
    description: 'Balanced portfolio distributing risk equally with moderate limits.',
    expectedVolRange: [12, 18],
  },
  4: {
    level: 4,
    label: 'High',
    method: 'mvo',
    params: { riskAversion: 1.5, maxWeight: 0.30 },
    description: 'Growth-oriented portfolio optimizing risk-adjusted returns.',
    expectedVolRange: [16, 24],
  },
  5: {
    level: 5,
    label: 'Very High',
    method: 'mvo',
    params: { riskAversion: 0.5, maxWeight: 0.40 },
    description: 'Aggressive portfolio maximizing returns with relaxed constraints.',
    expectedVolRange: [22, 35],
  },
};

export function getRiskProfile(level: number): RiskProfile {
  const profile = RISK_PROFILES[level];
  if (!profile) throw new Error(`Invalid risk level: ${level}`);
  return profile;
}
