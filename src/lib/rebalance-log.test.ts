import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

import {
  saveExecution,
  loadExecution,
  listExecutions,
  listExecutionsByPolicy,
  listExecutionsByUser,
  getExecutionStats,
  generateExecutionId,
  type RebalanceExecution,
} from './rebalance-log';

function createTestExecution(overrides: Partial<RebalanceExecution> = {}): RebalanceExecution {
  return {
    id: generateExecutionId(),
    policyId: 'pol_test123',
    userId: 'test-user-exec',
    username: 'testexecuser',
    trigger: 'manual',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    tradesPlanned: 3,
    tradesExecuted: 2,
    tradesFailed: 1,
    trades: [],
    accountType: 'demo',
    ...overrides,
  };
}

const createdIds: string[] = [];

afterEach(() => {
  for (const id of createdIds) {
    const path = join(process.cwd(), '.rebalancer-executions', `${id}.json`);
    if (existsSync(path)) {
      try { unlinkSync(path); } catch {}
    }
  }
  createdIds.length = 0;
});

describe('rebalance-log', () => {
  describe('generateExecutionId', () => {
    it('generates unique IDs with exec_ prefix', () => {
      const id1 = generateExecutionId();
      const id2 = generateExecutionId();
      expect(id1).toMatch(/^exec_[a-z0-9]+_[a-f0-9]{8}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('saveExecution / loadExecution', () => {
    it('saves and loads an execution', () => {
      const exec = createTestExecution();
      createdIds.push(exec.id);
      saveExecution(exec);
      const loaded = loadExecution(exec.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(exec.id);
      expect(loaded!.status).toBe('completed');
      expect(loaded!.tradesPlanned).toBe(3);
    });

    it('returns null for non-existent execution', () => {
      expect(loadExecution('exec_nonexistent')).toBeNull();
    });

    it('updates execution in place', () => {
      const exec = createTestExecution({ status: 'running' });
      createdIds.push(exec.id);
      saveExecution(exec);

      exec.status = 'completed';
      exec.tradesExecuted = 5;
      saveExecution(exec);

      const loaded = loadExecution(exec.id);
      expect(loaded!.status).toBe('completed');
      expect(loaded!.tradesExecuted).toBe(5);
    });
  });

  describe('listExecutions', () => {
    it('returns array of executions', () => {
      const e1 = createTestExecution();
      const e2 = createTestExecution();
      createdIds.push(e1.id, e2.id);
      saveExecution(e1);
      saveExecution(e2);

      const all = listExecutions();
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.some(e => e.id === e1.id)).toBe(true);
    });

    it('respects limit parameter', () => {
      const execs = Array.from({ length: 5 }, () => createTestExecution());
      for (const e of execs) {
        createdIds.push(e.id);
        saveExecution(e);
      }

      const limited = listExecutions(3);
      expect(limited.length).toBeLessThanOrEqual(3);
    });
  });

  describe('listExecutionsByPolicy', () => {
    it('filters by policyId', () => {
      const e1 = createTestExecution({ policyId: 'pol_qa_filter_a' });
      const e2 = createTestExecution({ policyId: 'pol_qa_filter_b' });
      createdIds.push(e1.id, e2.id);
      saveExecution(e1);
      saveExecution(e2);

      const filtered = listExecutionsByPolicy('pol_qa_filter_a');
      expect(filtered.some(e => e.id === e1.id)).toBe(true);
      expect(filtered.some(e => e.id === e2.id)).toBe(false);
    });
  });

  describe('listExecutionsByUser', () => {
    it('filters by userId', () => {
      const e1 = createTestExecution({ userId: 'qa-user-a' });
      const e2 = createTestExecution({ userId: 'qa-user-b' });
      createdIds.push(e1.id, e2.id);
      saveExecution(e1);
      saveExecution(e2);

      const filtered = listExecutionsByUser('qa-user-a');
      expect(filtered.some(e => e.id === e1.id)).toBe(true);
      expect(filtered.some(e => e.id === e2.id)).toBe(false);
    });
  });

  describe('getExecutionStats', () => {
    it('returns aggregated stats', () => {
      const e1 = createTestExecution({ trigger: 'scheduled', status: 'completed', tradesExecuted: 3, tradesFailed: 0 });
      const e2 = createTestExecution({ trigger: 'drift', status: 'failed', tradesExecuted: 0, tradesFailed: 2 });
      createdIds.push(e1.id, e2.id);
      saveExecution(e1);
      saveExecution(e2);

      const stats = getExecutionStats();
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(2);
      expect(stats.completed).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
      expect(stats.byTrigger).toBeDefined();
      expect(stats.byDay).toBeDefined();
      expect(stats.totalTradesExecuted).toBeGreaterThanOrEqual(3);
    });
  });
});
