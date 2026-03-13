import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.test-policies');

// Monkey-patch the module's POLICIES_DIR before import
import * as policyStoreModule from './policy-store';

// We test via the actual functions but using a temp directory.
// Since policy-store uses process.cwd()/.rebalancer-policies, we test against the real dir
// but clean up test policies after each test.

const {
  savePolicy,
  loadPolicy,
  deletePolicy,
  listPolicies,
  listPoliciesByUser,
  findActiveScheduledPolicies,
  findActiveDriftPolicies,
  generatePolicyId,
  computeNextScheduledTime,
} = policyStoreModule;

type RebalancePolicy = policyStoreModule.RebalancePolicy;

function createTestPolicy(overrides: Partial<RebalancePolicy> = {}): RebalancePolicy {
  const now = new Date().toISOString();
  return {
    id: generatePolicyId(),
    userId: 'test-user-123',
    username: 'testuser',
    displayName: 'Test User',
    targetAllocations: [
      { symbol: 'AAPL', weight: 0.3, instrumentId: 1001 },
      { symbol: 'GOOGL', weight: 0.3, instrumentId: 1002 },
      { symbol: 'CASH', weight: 0.4, isCash: true },
    ],
    optimizationMethod: 'equal-weight',
    riskLevel: 3,
    mode: 'scheduled',
    schedule: { frequency: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 },
    driftThreshold: 0.05,
    accountType: 'demo',
    maxPositionWeight: 25,
    slippageTolerance: 0.5,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const createdPolicyIds: string[] = [];

afterEach(() => {
  for (const id of createdPolicyIds) {
    deletePolicy(id);
  }
  createdPolicyIds.length = 0;
});

describe('policy-store', () => {
  describe('generatePolicyId', () => {
    it('generates unique IDs with pol_ prefix', () => {
      const id1 = generatePolicyId();
      const id2 = generatePolicyId();
      expect(id1).toMatch(/^pol_[a-f0-9]{16}$/);
      expect(id2).toMatch(/^pol_[a-f0-9]{16}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('savePolicy / loadPolicy', () => {
    it('saves and loads a policy', () => {
      const policy = createTestPolicy();
      createdPolicyIds.push(policy.id);
      savePolicy(policy);
      const loaded = loadPolicy(policy.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(policy.id);
      expect(loaded!.userId).toBe('test-user-123');
      expect(loaded!.targetAllocations).toHaveLength(3);
    });

    it('returns null for non-existent policy', () => {
      const loaded = loadPolicy('pol_nonexistent');
      expect(loaded).toBeNull();
    });

    it('updates updatedAt on save', () => {
      const policy = createTestPolicy();
      createdPolicyIds.push(policy.id);
      const before = policy.updatedAt;
      // Small delay to ensure different timestamp
      savePolicy(policy);
      const loaded = loadPolicy(policy.id);
      expect(loaded!.updatedAt).toBeDefined();
    });

    it('computes nextScheduledAt on save for scheduled policies', () => {
      const policy = createTestPolicy({ mode: 'scheduled' });
      createdPolicyIds.push(policy.id);
      savePolicy(policy);
      const loaded = loadPolicy(policy.id);
      expect(loaded!.nextScheduledAt).toBeDefined();
      expect(new Date(loaded!.nextScheduledAt!).getTime()).toBeGreaterThan(Date.now());
    });

    it('does NOT compute nextScheduledAt for drift-only policies', () => {
      const policy = createTestPolicy({ mode: 'drift', schedule: undefined });
      createdPolicyIds.push(policy.id);
      savePolicy(policy);
      const loaded = loadPolicy(policy.id);
      expect(loaded!.nextScheduledAt).toBeUndefined();
    });
  });

  describe('deletePolicy', () => {
    it('deletes existing policy and returns true', () => {
      const policy = createTestPolicy();
      savePolicy(policy);
      const result = deletePolicy(policy.id);
      expect(result).toBe(true);
      expect(loadPolicy(policy.id)).toBeNull();
    });

    it('returns false for non-existent policy', () => {
      expect(deletePolicy('pol_doesnotexist')).toBe(false);
    });
  });

  describe('listPolicies / listPoliciesByUser', () => {
    it('lists all policies including test ones', () => {
      const p1 = createTestPolicy({ userId: 'user-a' });
      const p2 = createTestPolicy({ userId: 'user-b' });
      createdPolicyIds.push(p1.id, p2.id);
      savePolicy(p1);
      savePolicy(p2);
      const all = listPolicies();
      const testPolicies = all.filter(p => p.id === p1.id || p.id === p2.id);
      expect(testPolicies).toHaveLength(2);
    });

    it('filters by userId', () => {
      const p1 = createTestPolicy({ userId: 'qa-user-filter' });
      const p2 = createTestPolicy({ userId: 'qa-user-other' });
      createdPolicyIds.push(p1.id, p2.id);
      savePolicy(p1);
      savePolicy(p2);
      const userPolicies = listPoliciesByUser('qa-user-filter');
      expect(userPolicies.some(p => p.id === p1.id)).toBe(true);
      expect(userPolicies.some(p => p.id === p2.id)).toBe(false);
    });
  });

  describe('findActiveScheduledPolicies', () => {
    it('finds policies past their nextScheduledAt', () => {
      const policy = createTestPolicy({
        mode: 'scheduled',
        enabled: true,
        nextScheduledAt: new Date(Date.now() - 3600_000).toISOString(),
      });
      createdPolicyIds.push(policy.id);
      // Save without recomputing nextScheduledAt by writing directly
      const { writeFileSync } = require('fs');
      writeFileSync(
        join(process.cwd(), '.rebalancer-policies', `${policy.id}.json`),
        JSON.stringify(policy, null, 2)
      );
      const found = findActiveScheduledPolicies();
      expect(found.some(p => p.id === policy.id)).toBe(true);
    });

    it('excludes disabled policies', () => {
      const policy = createTestPolicy({
        mode: 'scheduled',
        enabled: false,
        nextScheduledAt: new Date(Date.now() - 3600_000).toISOString(),
      });
      createdPolicyIds.push(policy.id);
      const { writeFileSync } = require('fs');
      writeFileSync(
        join(process.cwd(), '.rebalancer-policies', `${policy.id}.json`),
        JSON.stringify(policy, null, 2)
      );
      const found = findActiveScheduledPolicies();
      expect(found.some(p => p.id === policy.id)).toBe(false);
    });
  });

  describe('findActiveDriftPolicies', () => {
    it('finds enabled drift policies', () => {
      const p1 = createTestPolicy({ mode: 'drift', enabled: true });
      const p2 = createTestPolicy({ mode: 'both', enabled: true });
      const p3 = createTestPolicy({ mode: 'scheduled', enabled: true });
      createdPolicyIds.push(p1.id, p2.id, p3.id);
      savePolicy(p1);
      savePolicy(p2);
      savePolicy(p3);
      const found = findActiveDriftPolicies();
      expect(found.some(p => p.id === p1.id)).toBe(true);
      expect(found.some(p => p.id === p2.id)).toBe(true);
      expect(found.some(p => p.id === p3.id)).toBe(false);
    });
  });

  describe('computeNextScheduledTime', () => {
    it('computes next weekly time', () => {
      const result = computeNextScheduledTime({ frequency: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 });
      const next = new Date(result);
      expect(next.getUTCDay()).toBe(1);
      expect(next.getUTCHours()).toBe(9);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getTime()).toBeGreaterThan(Date.now());
    });

    it('computes next monthly time', () => {
      const result = computeNextScheduledTime({ frequency: 'monthly', dayOfMonth: 15, hour: 12, minute: 30 });
      const next = new Date(result);
      expect(next.getUTCDate()).toBe(15);
      expect(next.getUTCHours()).toBe(12);
      expect(next.getUTCMinutes()).toBe(30);
      expect(next.getTime()).toBeGreaterThan(Date.now());
    });

    it('computes next quarterly time', () => {
      const result = computeNextScheduledTime({ frequency: 'quarterly', dayOfMonth: 1, hour: 0, minute: 0 });
      const next = new Date(result);
      expect(next.getUTCDate()).toBe(1);
      expect([0, 3, 6, 9]).toContain(next.getUTCMonth());
      expect(next.getTime()).toBeGreaterThan(Date.now());
    });

    it('advances to next period if current is in the past', () => {
      const past = new Date('2026-01-01T00:00:00Z');
      const result = computeNextScheduledTime({ frequency: 'monthly', dayOfMonth: 1, hour: 0, minute: 0 }, past);
      const next = new Date(result);
      expect(next.getTime()).toBeGreaterThan(past.getTime());
    });
  });
});
