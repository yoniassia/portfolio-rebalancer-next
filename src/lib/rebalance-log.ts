/**
 * Rebalance Execution Log — records every rebalance run (scheduled, drift-triggered, or manual).
 * File-based: one JSON file per execution in .rebalancer-executions/
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { TradeProgress, ExecutionSummary } from '@/types/rebalancer';

const EXECUTIONS_DIR = join(process.cwd(), '.rebalancer-executions');
if (!existsSync(EXECUTIONS_DIR)) mkdirSync(EXECUTIONS_DIR, { recursive: true });

export type ExecutionTrigger = 'scheduled' | 'drift' | 'manual';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'auth-expired';

export interface RebalanceExecution {
  id: string;
  policyId: string;
  userId: string;
  username: string;

  trigger: ExecutionTrigger;
  driftAtTrigger?: number;
  driftDetails?: Array<{ symbol: string; currentWeight: number; targetWeight: number; drift: number }>;

  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;

  tradesPlanned: number;
  tradesExecuted: number;
  tradesFailed: number;
  trades: TradeProgress[];
  summary?: ExecutionSummary;

  accountType: 'demo' | 'real';
  error?: string;
}

function executionPath(id: string): string {
  return join(EXECUTIONS_DIR, `${id}.json`);
}

export function generateExecutionId(): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rand = randomBytes(4).toString('hex');
  return `exec_${ts}_${rand}`;
}

export function saveExecution(execution: RebalanceExecution): void {
  writeFileSync(executionPath(execution.id), JSON.stringify(execution, null, 2));
}

export function loadExecution(id: string): RebalanceExecution | null {
  try {
    const path = executionPath(id);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return null; }
}

export function listExecutions(limit = 100): RebalanceExecution[] {
  try {
    const files = readdirSync(EXECUTIONS_DIR).filter(f => f.endsWith('.json'));
    const execs = files.map(f => {
      try { return JSON.parse(readFileSync(join(EXECUTIONS_DIR, f), 'utf8')) as RebalanceExecution; }
      catch { return null; }
    }).filter(Boolean) as RebalanceExecution[];
    execs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return execs.slice(0, limit);
  } catch { return []; }
}

const MAX_EXECUTION_FILES = 500;

export function pruneOldExecutions(): number {
  try {
    const files = readdirSync(EXECUTIONS_DIR).filter(f => f.endsWith('.json'));
    if (files.length <= MAX_EXECUTION_FILES) return 0;
    const sorted = files
      .map(f => ({ name: f, mtime: statSync(join(EXECUTIONS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const toDelete = sorted.slice(MAX_EXECUTION_FILES);
    for (const f of toDelete) unlinkSync(join(EXECUTIONS_DIR, f.name));
    return toDelete.length;
  } catch { return 0; }
}

export function listExecutionsByPolicy(policyId: string, limit = 50): RebalanceExecution[] {
  return listExecutions(500).filter(e => e.policyId === policyId).slice(0, limit);
}

export function listExecutionsByUser(userId: string, limit = 50): RebalanceExecution[] {
  return listExecutions(500).filter(e => e.userId === userId).slice(0, limit);
}

export function getExecutionStats(): {
  totalExecutions: number;
  completed: number;
  failed: number;
  running: number;
  totalTradesExecuted: number;
  totalTradesFailed: number;
  byTrigger: Record<ExecutionTrigger, number>;
  byDay: Record<string, number>;
  recentExecutions: RebalanceExecution[];
} {
  const all = listExecutions(1000);
  const byTrigger: Record<string, number> = { scheduled: 0, drift: 0, manual: 0 };
  const byDay: Record<string, number> = {};
  let totalTradesExecuted = 0;
  let totalTradesFailed = 0;

  for (const e of all) {
    byTrigger[e.trigger] = (byTrigger[e.trigger] || 0) + 1;
    totalTradesExecuted += e.tradesExecuted;
    totalTradesFailed += e.tradesFailed;
    const day = e.startedAt.split('T')[0];
    byDay[day] = (byDay[day] || 0) + 1;
  }

  return {
    totalExecutions: all.length,
    completed: all.filter(e => e.status === 'completed').length,
    failed: all.filter(e => e.status === 'failed' || e.status === 'auth-expired').length,
    running: all.filter(e => e.status === 'running').length,
    totalTradesExecuted,
    totalTradesFailed,
    byTrigger: byTrigger as Record<ExecutionTrigger, number>,
    byDay,
    recentExecutions: all.slice(0, 20),
  };
}
