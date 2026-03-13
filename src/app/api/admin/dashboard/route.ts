/**
 * /api/admin/dashboard — Aggregated admin metrics for the rebalancer.
 * Shows all users, policies, executions, drift status, and system health.
 * Protected by admin key.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { listPolicies, type RebalancePolicy } from '@/lib/policy-store';
import { getExecutionStats, listExecutions } from '@/lib/rebalance-log';

const ADMIN_KEY = process.env.ADMIN_KEY || 'rebalancer-admin-2026';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const policies = listPolicies();
    const execStats = getExecutionStats();
    const recentExecs = listExecutions(50);

    // User aggregation
    const userMap = new Map<string, {
      userId: string;
      username: string;
      displayName: string;
      policyCount: number;
      activePolicies: number;
      totalExecutions: number;
      lastActivity: string;
      modes: Set<string>;
    }>();

    for (const p of policies) {
      const existing = userMap.get(p.userId);
      if (!existing) {
        userMap.set(p.userId, {
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          policyCount: 1,
          activePolicies: p.enabled ? 1 : 0,
          totalExecutions: 0,
          lastActivity: p.updatedAt,
          modes: new Set([p.mode]),
        });
      } else {
        existing.policyCount++;
        if (p.enabled) existing.activePolicies++;
        if (p.updatedAt > existing.lastActivity) existing.lastActivity = p.updatedAt;
        existing.modes.add(p.mode);
      }
    }

    for (const e of recentExecs) {
      const u = userMap.get(e.userId);
      if (u) u.totalExecutions++;
    }

    const usersTable = Array.from(userMap.values())
      .map(u => ({
        userId: u.userId.substring(0, 12) + '...',
        username: u.username,
        displayName: u.displayName,
        policyCount: u.policyCount,
        activePolicies: u.activePolicies,
        totalExecutions: u.totalExecutions,
        modes: [...u.modes].join(', '),
        lastActivity: u.lastActivity,
      }))
      .sort((a, b) => b.activePolicies - a.activePolicies);

    // Policy table with drift info
    const policiesTable = policies
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(p => ({
        id: p.id,
        username: p.username,
        mode: p.mode,
        enabled: p.enabled,
        accountType: p.accountType,
        optimizationMethod: p.optimizationMethod,
        riskLevel: p.riskLevel,
        driftThreshold: p.driftThreshold,
        schedule: p.schedule ? `${p.schedule.frequency} @ ${String(p.schedule.hour).padStart(2, '0')}:${String(p.schedule.minute).padStart(2, '0')} UTC` : null,
        instruments: p.targetAllocations.filter(t => !t.isCash).length,
        lastRebalanceAt: p.lastRebalanceAt,
        nextScheduledAt: p.nextScheduledAt,
        lastDriftCheck: p.lastDriftCheck,
        lastDriftValue: p.lastDriftValue,
        lastDriftDetails: p.lastDriftDetails,
        needsRebalance: p.lastDriftValue != null ? p.lastDriftValue > p.driftThreshold : null,
        createdAt: p.createdAt,
      }));

    // KPIs
    const totalUsers = userMap.size;
    const totalPolicies = policies.length;
    const activePolicies = policies.filter(p => p.enabled).length;
    const scheduledPolicies = policies.filter(p => p.enabled && (p.mode === 'scheduled' || p.mode === 'both')).length;
    const driftPolicies = policies.filter(p => p.enabled && (p.mode === 'drift' || p.mode === 'both')).length;
    const authExpiredPolicies = policies.filter(p => !p.enabled && p.lastRebalanceAt).length;

    const driftValues = policies.filter(p => p.lastDriftValue != null).map(p => p.lastDriftValue!);
    const avgDrift = driftValues.length ? driftValues.reduce((a, b) => a + b, 0) / driftValues.length : 0;
    const maxDrift = driftValues.length ? Math.max(...driftValues) : 0;
    const portfoliosDrifting = policies.filter(p => p.lastDriftValue != null && p.lastDriftValue > p.driftThreshold).length;

    // Mode breakdown
    const byMode: Record<string, number> = { scheduled: 0, drift: 0, both: 0 };
    for (const p of policies) byMode[p.mode] = (byMode[p.mode] || 0) + 1;

    // Account type breakdown
    const byAccountType: Record<string, number> = { demo: 0, real: 0 };
    for (const p of policies) byAccountType[p.accountType] = (byAccountType[p.accountType] || 0) + 1;

    // Optimization method breakdown
    const byMethod: Record<string, number> = {};
    for (const p of policies) byMethod[p.optimizationMethod] = (byMethod[p.optimizationMethod] || 0) + 1;

    // Risk level breakdown
    const byRisk: Record<string, number> = {};
    for (const p of policies) byRisk[p.riskLevel] = (byRisk[p.riskLevel] || 0) + 1;

    // Execution timeline (last 14 days)
    const timeline: Record<string, number> = {};
    for (const [day, count] of Object.entries(execStats.byDay)) {
      timeline[day] = count;
    }

    // Execution table
    const executionsTable = recentExecs.map(e => ({
      id: e.id,
      policyId: e.policyId,
      username: e.username,
      trigger: e.trigger,
      status: e.status,
      driftAtTrigger: e.driftAtTrigger,
      tradesPlanned: e.tradesPlanned,
      tradesExecuted: e.tradesExecuted,
      tradesFailed: e.tradesFailed,
      accountType: e.accountType,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      error: e.error,
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      kpi: {
        totalUsers,
        totalPolicies,
        activePolicies,
        scheduledPolicies,
        driftPolicies,
        authExpiredPolicies,
        avgDrift: Math.round(avgDrift * 10000) / 100, // as percentage
        maxDrift: Math.round(maxDrift * 10000) / 100,
        portfoliosDrifting,
        totalExecutions: execStats.totalExecutions,
        completedExecutions: execStats.completed,
        failedExecutions: execStats.failed,
        runningExecutions: execStats.running,
        totalTradesExecuted: execStats.totalTradesExecuted,
        totalTradesFailed: execStats.totalTradesFailed,
      },
      breakdowns: {
        byMode,
        byAccountType,
        byMethod,
        byRisk,
        byTrigger: execStats.byTrigger,
      },
      usersTable,
      policiesTable,
      executionsTable,
      timeline,
    });
  } catch (err: any) {
    console.error('[admin] Dashboard error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
