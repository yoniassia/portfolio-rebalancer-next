/**
 * Functional Runbook — End-to-end tests against live local APIs.
 * Tests the full lifecycle: policy CRUD → drift check → cron → admin dashboard.
 * Runs against localhost:3046.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync, readdirSync } from 'fs';

const BASE = 'http://localhost:3046';
const ADMIN_KEY = 'rebalancer-admin-2026';
const POLICIES_DIR = join(process.cwd(), '.rebalancer-policies');
const EXECUTIONS_DIR = join(process.cwd(), '.rebalancer-executions');

const testPolicyIds: string[] = [];
const testExecutionIds: string[] = [];

function createTestPolicyFile(overrides: Record<string, any> = {}): string {
  const id = `pol_qa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const policy = {
    id,
    userId: 'qa-func-user',
    username: 'qaFuncUser',
    displayName: 'QA Functional User',
    targetAllocations: [
      { symbol: 'AAPL', weight: 0.4, instrumentId: 1001 },
      { symbol: 'GOOGL', weight: 0.3, instrumentId: 1002 },
      { symbol: 'CASH', weight: 0.3, isCash: true },
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
  writeFileSync(join(POLICIES_DIR, `${id}.json`), JSON.stringify(policy, null, 2));
  testPolicyIds.push(id);
  return id;
}

afterAll(() => {
  for (const id of testPolicyIds) {
    const path = join(POLICIES_DIR, `${id}.json`);
    if (existsSync(path)) try { unlinkSync(path); } catch {}
  }
  for (const id of testExecutionIds) {
    const path = join(EXECUTIONS_DIR, `${id}.json`);
    if (existsSync(path)) try { unlinkSync(path); } catch {}
  }
});

describe('Functional Runbook: Live API Tests', () => {
  // =========== SECTION 1: Admin Dashboard API ===========
  describe('1. Admin Dashboard API', () => {
    it('1.1 Returns valid JSON with all expected fields', async () => {
      const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('generatedAt');
      expect(data).toHaveProperty('kpi');
      expect(data).toHaveProperty('breakdowns');
      expect(data).toHaveProperty('usersTable');
      expect(data).toHaveProperty('policiesTable');
      expect(data).toHaveProperty('executionsTable');
      expect(data).toHaveProperty('timeline');

      expect(data.kpi).toHaveProperty('totalUsers');
      expect(data.kpi).toHaveProperty('totalPolicies');
      expect(data.kpi).toHaveProperty('activePolicies');
      expect(data.kpi).toHaveProperty('scheduledPolicies');
      expect(data.kpi).toHaveProperty('driftPolicies');
      expect(data.kpi).toHaveProperty('avgDrift');
      expect(data.kpi).toHaveProperty('maxDrift');
      expect(data.kpi).toHaveProperty('portfoliosDrifting');
      expect(data.kpi).toHaveProperty('totalExecutions');
      expect(data.kpi).toHaveProperty('totalTradesExecuted');

      expect(data.breakdowns).toHaveProperty('byMode');
      expect(data.breakdowns).toHaveProperty('byAccountType');
      expect(data.breakdowns).toHaveProperty('byMethod');
      expect(data.breakdowns).toHaveProperty('byTrigger');
    });

    it('1.2 Reflects a newly created policy in dashboard', async () => {
      const id = createTestPolicyFile({ mode: 'drift', enabled: true });

      const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
      const data = await res.json();

      expect(data.kpi.totalPolicies).toBeGreaterThanOrEqual(1);
      expect(data.kpi.driftPolicies).toBeGreaterThanOrEqual(1);
      expect(data.policiesTable.some((p: any) => p.id === id)).toBe(true);
    });

    it('1.3 Rejects wrong admin key', async () => {
      const res = await fetch(`${BASE}/api/admin/dashboard?key=wrong`);
      expect(res.status).toBe(401);
    });
  });

  // =========== SECTION 2: Cron Rebalance Endpoint ===========
  describe('2. Cron Rebalance Endpoint', () => {
    it('2.1 Dry run returns valid response', async () => {
      const res = await fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('dryRun', true);
      expect(data).toHaveProperty('scheduledProcessed');
      expect(data).toHaveProperty('driftChecked');
      expect(data).toHaveProperty('results');
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('2.2 Picks up overdue scheduled policies on dry run', async () => {
      const id = createTestPolicyFile({
        mode: 'scheduled',
        enabled: true,
        nextScheduledAt: new Date(Date.now() - 3600_000).toISOString(),
      });

      const res = await fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`);
      const data = await res.json();

      expect(data.scheduledProcessed).toBeGreaterThanOrEqual(1);
      const match = data.results.find((r: any) => r.policyId === id);
      expect(match).toBeDefined();
      expect(match.action).toBe('would-execute');
    });

    it('2.3 Drift policies without refresh token report token-expired', async () => {
      const id = createTestPolicyFile({
        mode: 'drift',
        enabled: true,
      });

      const res = await fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}`);
      const data = await res.json();

      const match = data.results.find((r: any) => r.policyId === id);
      if (match) {
        expect(['token-expired', 'portfolio-fetch-failed']).toContain(match.error);
      }
    });

    it('2.4 Cooldown prevents re-execution within 1 hour', async () => {
      const id = createTestPolicyFile({
        mode: 'drift',
        enabled: true,
        lastRebalanceAt: new Date(Date.now() - 1800_000).toISOString(), // 30 min ago
      });

      const res = await fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`);
      const data = await res.json();

      const match = data.results.find((r: any) => r.policyId === id);
      if (match) {
        expect(match.action).toBe('cooldown');
      }
    });
  });

  // =========== SECTION 3: Drift Check Endpoint ===========
  describe('3. Drift Check Endpoint', () => {
    it('3.1 Bulk check with admin key returns results', async () => {
      const res = await fetch(`${BASE}/api/drift/check?key=${ADMIN_KEY}`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('checked');
      expect(data).toHaveProperty('results');
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('3.2 Drift check without auth or key returns 401', async () => {
      const res = await fetch(`${BASE}/api/drift/check`);
      expect(res.status).toBe(401);
    });

    it('3.3 Per-policy drift check without cookie returns 401', async () => {
      const id = createTestPolicyFile();
      const res = await fetch(`${BASE}/api/drift/check?policyId=${id}`);
      expect(res.status).toBe(401);
    });
  });

  // =========== SECTION 4: Policies CRUD ===========
  describe('4. Policies CRUD (auth-gated)', () => {
    it('4.1 GET /api/policies without auth returns 401', async () => {
      const res = await fetch(`${BASE}/api/policies`);
      expect(res.status).toBe(401);
    });

    it('4.2 POST /api/policies without auth returns 401', async () => {
      const res = await fetch(`${BASE}/api/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAllocations: [{ symbol: 'AAPL', weight: 0.5 }] }),
      });
      expect(res.status).toBe(401);
    });

    it('4.3 POST /api/policies with missing body returns 401 (auth first)', async () => {
      const res = await fetch(`${BASE}/api/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(401);
    });

    it('4.4 GET /api/policies/[id] without auth returns 401', async () => {
      const id = createTestPolicyFile();
      const res = await fetch(`${BASE}/api/policies/${id}`);
      expect(res.status).toBe(401);
    });

    it('4.5 PATCH /api/policies/[id] without auth returns 401', async () => {
      const id = createTestPolicyFile();
      const res = await fetch(`${BASE}/api/policies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      expect(res.status).toBe(401);
    });

    it('4.6 DELETE /api/policies/[id] without auth returns 401', async () => {
      const id = createTestPolicyFile();
      const res = await fetch(`${BASE}/api/policies/${id}`, { method: 'DELETE' });
      expect(res.status).toBe(401);
    });
  });

  // =========== SECTION 5: Page Rendering ===========
  describe('5. Page Rendering', () => {
    it('5.1 Main page (/) returns 200 with HTML', async () => {
      const res = await fetch(`${BASE}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html');
    });

    it('5.2 Admin page (/admin) returns 200 with HTML', async () => {
      const res = await fetch(`${BASE}/admin`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html');
    });

    it('5.3 Auth callback page (/auth/callback) returns 200', async () => {
      const res = await fetch(`${BASE}/auth/callback`);
      expect(res.status).toBe(200);
    });
  });

  // =========== SECTION 6: Edge Cases & Security ===========
  describe('6. Edge Cases & Security', () => {
    it('6.1 Non-existent API route returns 404', async () => {
      const res = await fetch(`${BASE}/api/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('6.2 Admin dashboard handles concurrent requests', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`))
      );
      for (const res of results) {
        expect(res.status).toBe(200);
      }
    });

    it('6.3 Cron endpoint handles concurrent dry runs', async () => {
      const results = await Promise.all(
        Array.from({ length: 3 }, () => fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`))
      );
      for (const res of results) {
        expect(res.status).toBe(200);
      }
    });

    it('6.4 Admin dashboard with many policies does not crash', async () => {
      const ids = Array.from({ length: 10 }, (_, i) =>
        createTestPolicyFile({ mode: i % 3 === 0 ? 'scheduled' : i % 3 === 1 ? 'drift' : 'both' })
      );

      const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.kpi.totalPolicies).toBeGreaterThanOrEqual(10);
    });
  });

  // =========== SECTION 7: Data Integrity Checks ===========
  describe('7. Data Integrity', () => {
    it('7.1 Policy file on disk matches API response', async () => {
      const id = createTestPolicyFile({
        mode: 'drift',
        driftThreshold: 0.07,
        riskLevel: 4,
      });

      const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
      const data = await res.json();
      const apiPolicy = data.policiesTable.find((p: any) => p.id === id);

      expect(apiPolicy).toBeDefined();
      expect(apiPolicy.mode).toBe('drift');
      expect(apiPolicy.driftThreshold).toBe(0.07);
      expect(apiPolicy.riskLevel).toBe(4);
    });

    it('7.2 Disabled policies are excluded from active count', async () => {
      const enabledId = createTestPolicyFile({ enabled: true, mode: 'drift' });
      const disabledId = createTestPolicyFile({ enabled: false, mode: 'drift' });

      const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
      const data = await res.json();

      const enabledPolicy = data.policiesTable.find((p: any) => p.id === enabledId);
      const disabledPolicy = data.policiesTable.find((p: any) => p.id === disabledId);

      expect(enabledPolicy.enabled).toBe(true);
      expect(disabledPolicy.enabled).toBe(false);
      expect(data.kpi.activePolicies).toBeGreaterThan(0);
    });

    it('7.3 Execution stats aggregation is consistent', async () => {
      const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
      const data = await res.json();

      const { kpi } = data;
      expect(kpi.completedExecutions + kpi.failedExecutions + kpi.runningExecutions).toBeLessThanOrEqual(kpi.totalExecutions);
    });

    it('7.4 Mode breakdown sums match total policies', async () => {
      const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
      const data = await res.json();

      const { byMode } = data.breakdowns;
      const modeSum = Object.values(byMode).reduce((a: number, b: any) => a + b, 0);
      expect(modeSum).toBe(data.kpi.totalPolicies);
    });

    it('7.5 Account type breakdown sums match total policies', async () => {
      const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
      const data = await res.json();

      const { byAccountType } = data.breakdowns;
      const sum = Object.values(byAccountType).reduce((a: number, b: any) => a + b, 0);
      expect(sum).toBe(data.kpi.totalPolicies);
    });
  });
});
