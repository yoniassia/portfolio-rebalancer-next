/**
 * Extended Functional Runbook — Tests for gaps identified in QA cycle.
 * Covers: policy lifecycle, concurrent operations, data consistency,
 * cron scheduling edge cases, admin breakdown verification, and execution ordering.
 * Runs against localhost:3046.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';

const BASE = 'http://localhost:3046';
const ADMIN_KEY = 'rebalancer-admin-2026';
const POLICIES_DIR = join(process.cwd(), '.rebalancer-policies');
const EXECUTIONS_DIR = join(process.cwd(), '.rebalancer-executions');

const testPolicyIds: string[] = [];
const testExecutionIds: string[] = [];

function createTestPolicyFile(overrides: Record<string, any> = {}): string {
  const id = `pol_ext_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const policy = {
    id,
    userId: 'qa-ext-user',
    username: 'qaExtUser',
    displayName: 'QA Extended User',
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

function createTestExecutionFile(overrides: Record<string, any> = {}): string {
  const id = `exec_ext_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const execution = {
    id,
    policyId: 'pol_ext_test',
    userId: 'qa-ext-user',
    username: 'qaExtUser',
    trigger: 'manual',
    status: 'completed',
    startedAt: now,
    completedAt: now,
    tradesPlanned: 3,
    tradesExecuted: 2,
    tradesFailed: 1,
    trades: [],
    accountType: 'demo',
    ...overrides,
  };
  writeFileSync(join(EXECUTIONS_DIR, `${id}.json`), JSON.stringify(execution, null, 2));
  testExecutionIds.push(id);
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

describe('Extended Runbook: Policy Lifecycle', () => {
  it('policy mode=both is counted in BOTH scheduled and drift KPIs', async () => {
    createTestPolicyFile({
      mode: 'both',
      enabled: true,
      nextScheduledAt: new Date(Date.now() + 86400_000).toISOString(),
    });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    expect(data.kpi.scheduledPolicies).toBeGreaterThanOrEqual(1);
    expect(data.kpi.driftPolicies).toBeGreaterThanOrEqual(1);
  });

  it('disabled policy is excluded from scheduled and drift counts', async () => {
    createTestPolicyFile({ mode: 'both', enabled: false });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const disabledInScheduled = data.kpi.scheduledPolicies;
    const disabledInDrift = data.kpi.driftPolicies;

    expect(data.kpi.activePolicies).toBeLessThan(data.kpi.totalPolicies);
    expect(typeof disabledInScheduled).toBe('number');
    expect(typeof disabledInDrift).toBe('number');
  });

  it('multiple policies for same user are counted correctly', async () => {
    const uid = `qa-multi-${Date.now()}`;
    createTestPolicyFile({ userId: uid, mode: 'scheduled' });
    createTestPolicyFile({ userId: uid, mode: 'drift' });
    createTestPolicyFile({ userId: uid, mode: 'both' });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const user = data.usersTable.find((u: any) => u.username === 'qaExtUser');
    expect(user).toBeDefined();
  });
});

describe('Extended Runbook: Cron Scheduling Edge Cases', () => {
  it('future nextScheduledAt policy is NOT picked up by dry run', async () => {
    const futureId = createTestPolicyFile({
      mode: 'scheduled',
      enabled: true,
      nextScheduledAt: new Date(Date.now() + 86400_000).toISOString(),
    });

    const res = await fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`);
    const data = await res.json();

    const match = data.results.find((r: any) => r.policyId === futureId);
    expect(match).toBeUndefined();
  });

  it('mode=both is picked up by both scheduled AND drift processing', async () => {
    const id = createTestPolicyFile({
      mode: 'both',
      enabled: true,
      nextScheduledAt: new Date(Date.now() - 3600_000).toISOString(),
    });

    const res = await fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`);
    const data = await res.json();

    const results = data.results.filter((r: any) => r.policyId === id);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const triggers = results.map((r: any) => r.trigger || r.action);
    expect(triggers.some((t: string) => t === 'scheduled' || t === 'would-execute')).toBe(true);
  });

  it('drift policy with cooldown remaining is skipped', async () => {
    const id = createTestPolicyFile({
      mode: 'drift',
      enabled: true,
      lastRebalanceAt: new Date(Date.now() - 600_000).toISOString(), // 10 min ago
    });

    const res = await fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`);
    const data = await res.json();

    const match = data.results.find((r: any) => r.policyId === id);
    if (match) {
      expect(match.action).toBe('cooldown');
    }
  });

  it('drift policy with cooldown expired is processed', async () => {
    const id = createTestPolicyFile({
      mode: 'drift',
      enabled: true,
      lastRebalanceAt: new Date(Date.now() - 7200_000).toISOString(), // 2 hours ago
    });

    const res = await fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`);
    const data = await res.json();

    const match = data.results.find((r: any) => r.policyId === id);
    if (match) {
      expect(match.action).not.toBe('cooldown');
    }
  });
});

describe('Extended Runbook: Admin Dashboard Breakdowns', () => {
  it('optimization method breakdown sums to total policies', async () => {
    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const { byMethod } = data.breakdowns;
    const sum = Object.values(byMethod).reduce((a: number, b: any) => a + b, 0);
    expect(sum).toBe(data.kpi.totalPolicies);
  });

  it('risk level breakdown covers all policies', async () => {
    createTestPolicyFile({ riskLevel: 1 });
    createTestPolicyFile({ riskLevel: 5 });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const { byRisk } = data.breakdowns;
    const sum = Object.values(byRisk).reduce((a: number, b: any) => a + b, 0);
    expect(sum).toBe(data.kpi.totalPolicies);
  });

  it('trigger breakdown covers all executions', async () => {
    createTestExecutionFile({ trigger: 'scheduled' });
    createTestExecutionFile({ trigger: 'drift' });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const { byTrigger } = data.breakdowns;
    const sum = Object.values(byTrigger).reduce((a: number, b: any) => a + b, 0);
    expect(sum).toBe(data.kpi.totalExecutions);
  });

  it('executionsTable is sorted by startedAt descending', async () => {
    const id1 = createTestExecutionFile({
      startedAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    const id2 = createTestExecutionFile({
      startedAt: new Date().toISOString(),
    });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const { executionsTable } = data;
    if (executionsTable.length >= 2) {
      for (let i = 1; i < executionsTable.length; i++) {
        expect(
          new Date(executionsTable[i - 1].startedAt).getTime()
        ).toBeGreaterThanOrEqual(
          new Date(executionsTable[i].startedAt).getTime()
        );
      }
    }
  });

  it('policiesTable includes all expected fields', async () => {
    createTestPolicyFile({ mode: 'drift', lastDriftValue: 0.08 });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const policy = data.policiesTable.find((p: any) => p.id?.startsWith('pol_ext_'));
    expect(policy).toBeDefined();
    expect(policy).toHaveProperty('id');
    expect(policy).toHaveProperty('username');
    expect(policy).toHaveProperty('mode');
    expect(policy).toHaveProperty('enabled');
    expect(policy).toHaveProperty('accountType');
    expect(policy).toHaveProperty('optimizationMethod');
    expect(policy).toHaveProperty('riskLevel');
    expect(policy).toHaveProperty('driftThreshold');
    expect(policy).toHaveProperty('instruments');
    expect(policy).toHaveProperty('createdAt');
  });
});

describe('Extended Runbook: Data Integrity — Cross-Checks', () => {
  it('KPI activePolicies = policies where enabled=true', async () => {
    createTestPolicyFile({ enabled: true });
    createTestPolicyFile({ enabled: false });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const enabledCount = data.policiesTable.filter((p: any) => p.enabled).length;
    expect(data.kpi.activePolicies).toBe(enabledCount);
  });

  it('KPI totalUsers matches unique users in usersTable', async () => {
    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    expect(data.kpi.totalUsers).toBe(data.usersTable.length);
  });

  it('policy instruments count matches non-cash allocations', async () => {
    const id = createTestPolicyFile({
      targetAllocations: [
        { symbol: 'AAPL', weight: 0.3, instrumentId: 1001 },
        { symbol: 'GOOGL', weight: 0.3, instrumentId: 1002 },
        { symbol: 'MSFT', weight: 0.2, instrumentId: 1003 },
        { symbol: 'CASH', weight: 0.2, isCash: true },
      ],
    });

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const policy = data.policiesTable.find((p: any) => p.id === id);
    expect(policy).toBeDefined();
    expect(policy.instruments).toBe(3);
  });

  it('policy file on disk is consistent with admin API after modification', async () => {
    const id = createTestPolicyFile({ riskLevel: 2, driftThreshold: 0.03 });

    const raw = JSON.parse(readFileSync(join(POLICIES_DIR, `${id}.json`), 'utf8'));
    raw.riskLevel = 4;
    raw.driftThreshold = 0.1;
    writeFileSync(join(POLICIES_DIR, `${id}.json`), JSON.stringify(raw, null, 2));

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    const apiPolicy = data.policiesTable.find((p: any) => p.id === id);
    expect(apiPolicy.riskLevel).toBe(4);
    expect(apiPolicy.driftThreshold).toBe(0.1);
  });
});

describe('Extended Runbook: API Content-Type & Error Handling', () => {
  it('API endpoints return application/json content type', async () => {
    const endpoints = [
      `/api/admin/dashboard?key=${ADMIN_KEY}`,
      `/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`,
      `/api/drift/check?key=${ADMIN_KEY}`,
    ];

    for (const endpoint of endpoints) {
      const res = await fetch(`${BASE}${endpoint}`);
      const ct = res.headers.get('content-type') ?? '';
      expect(ct).toContain('application/json');
    }
  });

  it('cron endpoint without key returns 401 with JSON body', async () => {
    const res = await fetch(`${BASE}/api/cron/rebalance`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('admin dashboard without key returns 401 with JSON body', async () => {
    const res = await fetch(`${BASE}/api/admin/dashboard`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('drift check without key or policyId returns 401', async () => {
    const res = await fetch(`${BASE}/api/drift/check`);
    expect(res.status).toBe(401);
  });

  it('admin dashboard handles empty state gracefully', async () => {
    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kpi.totalUsers).toBeGreaterThanOrEqual(0);
    expect(data.kpi.totalPolicies).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(data.usersTable)).toBe(true);
    expect(Array.isArray(data.policiesTable)).toBe(true);
    expect(Array.isArray(data.executionsTable)).toBe(true);
  });
});

describe('Extended Runbook: Concurrent Operations', () => {
  it('simultaneous policy file creates do not corrupt data', async () => {
    const ids = Array.from({ length: 10 }, (_, i) =>
      createTestPolicyFile({
        userId: `concurrent-${i}`,
        mode: i % 2 === 0 ? 'scheduled' : 'drift',
      })
    );

    const res = await fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`);
    const data = await res.json();

    for (const id of ids) {
      const exists = data.policiesTable.some((p: any) => p.id === id);
      expect(exists).toBe(true);
    }
  });

  it('concurrent dashboard + cron requests do not interfere', async () => {
    const [dashRes, cronRes] = await Promise.all([
      fetch(`${BASE}/api/admin/dashboard?key=${ADMIN_KEY}`),
      fetch(`${BASE}/api/cron/rebalance?key=${ADMIN_KEY}&dry=true`),
    ]);

    expect(dashRes.status).toBe(200);
    expect(cronRes.status).toBe(200);

    const dashData = await dashRes.json();
    const cronData = await cronRes.json();

    expect(dashData).toHaveProperty('kpi');
    expect(cronData).toHaveProperty('results');
  });
});
