/**
 * Rebalance Policy Store — file-based storage for per-user rebalance policies.
 * Each policy defines target allocations, schedule, drift thresholds, and execution settings.
 * Policies persist across restarts via JSON files in .rebalancer-policies/
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { TargetAllocation, OptimizationMethod } from '@/types/rebalancer';

const POLICIES_DIR = join(process.cwd(), '.rebalancer-policies');
if (!existsSync(POLICIES_DIR)) mkdirSync(POLICIES_DIR, { recursive: true });

export type PolicyMode = 'scheduled' | 'drift' | 'both';
export type ScheduleFrequency = 'weekly' | 'monthly' | 'quarterly';

export interface RebalanceSchedule {
  frequency: ScheduleFrequency;
  dayOfWeek?: number;   // 0-6 for weekly (0=Sun)
  dayOfMonth?: number;  // 1-28 for monthly/quarterly
  hour: number;         // UTC hour 0-23
  minute: number;       // 0-59
}

export interface RebalancePolicy {
  id: string;
  userId: string;
  username: string;
  displayName: string;

  targetAllocations: TargetAllocation[];
  optimizationMethod: OptimizationMethod;
  riskLevel: 1 | 2 | 3 | 4 | 5;

  mode: PolicyMode;
  schedule?: RebalanceSchedule;
  driftThreshold: number; // absolute weight drift, e.g. 0.05 = 5%

  accountType: 'demo' | 'real';
  maxPositionWeight: number;
  slippageTolerance: number;

  // Auth — encrypted refresh token for automated execution
  refreshToken?: string;
  sessionId?: string;

  enabled: boolean;
  lastRebalanceAt?: string;
  nextScheduledAt?: string;
  lastDriftCheck?: string;
  lastDriftValue?: number;
  lastDriftDetails?: Array<{ symbol: string; drift: number }>;

  createdAt: string;
  updatedAt: string;
}

function policyPath(id: string): string {
  return join(POLICIES_DIR, `${id}.json`);
}

export function savePolicy(policy: RebalancePolicy): void {
  policy.updatedAt = new Date().toISOString();
  if (policy.schedule && (policy.mode === 'scheduled' || policy.mode === 'both')) {
    policy.nextScheduledAt = computeNextScheduledTime(policy.schedule);
  }
  writeFileSync(policyPath(policy.id), JSON.stringify(policy, null, 2));
}

export function loadPolicy(id: string): RebalancePolicy | null {
  try {
    const path = policyPath(id);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return null; }
}

export function deletePolicy(id: string): boolean {
  try {
    const path = policyPath(id);
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  } catch { return false; }
}

export function listPolicies(): RebalancePolicy[] {
  try {
    const files = readdirSync(POLICIES_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try { return JSON.parse(readFileSync(join(POLICIES_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean) as RebalancePolicy[];
  } catch { return []; }
}

export function listPoliciesByUser(userId: string): RebalancePolicy[] {
  return listPolicies().filter(p => p.userId === userId);
}

export function findActiveScheduledPolicies(): RebalancePolicy[] {
  const now = new Date().toISOString();
  return listPolicies().filter(p =>
    p.enabled &&
    (p.mode === 'scheduled' || p.mode === 'both') &&
    p.nextScheduledAt &&
    p.nextScheduledAt <= now
  );
}

export function findActiveDriftPolicies(): RebalancePolicy[] {
  return listPolicies().filter(p =>
    p.enabled &&
    (p.mode === 'drift' || p.mode === 'both')
  );
}

export function generatePolicyId(): string {
  return 'pol_' + randomBytes(8).toString('hex');
}

export function computeNextScheduledTime(schedule: RebalanceSchedule, fromDate?: Date): string {
  const now = fromDate || new Date();
  const next = new Date(now);
  next.setUTCHours(schedule.hour, schedule.minute, 0, 0);

  switch (schedule.frequency) {
    case 'weekly': {
      const dow = schedule.dayOfWeek ?? 1; // default Monday
      const diff = (dow - next.getUTCDay() + 7) % 7;
      next.setUTCDate(next.getUTCDate() + (diff === 0 && next <= now ? 7 : diff));
      break;
    }
    case 'monthly': {
      const dom = schedule.dayOfMonth ?? 1;
      next.setUTCDate(dom);
      if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    }
    case 'quarterly': {
      const dom = schedule.dayOfMonth ?? 1;
      next.setUTCDate(dom);
      const currentQuarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
      next.setUTCMonth(currentQuarterMonth);
      if (next <= now) next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    }
  }

  return next.toISOString();
}
