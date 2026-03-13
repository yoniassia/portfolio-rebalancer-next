/**
 * /api/cron/rebalance — Main cron endpoint.
 * Called externally (system cron, PM2 cron, or manual) to process:
 * 1. Scheduled rebalances whose nextScheduledAt has passed
 * 2. Drift-based rebalances where portfolio drift exceeds threshold
 *
 * Protected by admin key. Designed to run every 15-30 minutes.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  findActiveScheduledPolicies,
  findActiveDriftPolicies,
  loadPolicy,
  savePolicy,
  computeNextScheduledTime,
  type RebalancePolicy,
} from '@/lib/policy-store';
import {
  saveExecution,
  generateExecutionId,
  pruneOldExecutions,
  type RebalanceExecution,
  type ExecutionTrigger,
} from '@/lib/rebalance-log';
import { calculateDrift } from '@/engine/portfolio-analyzer';
import { createRebalancePlan } from '@/engine/rebalance-planner';
import type { PortfolioAnalysis, PortfolioHolding, TradeProgress } from '@/types/rebalancer';

const ADMIN_KEY = process.env.ADMIN_KEY || 'rebalancer-admin-2026';
const BASE = 'https://public-api.etoro.com';
const ETORO_API_KEY = process.env.ETORO_API_KEY || '';
const ETORO_USER_KEY = process.env.ETORO_USER_KEY || '';
const LIMIT_BUFFER = 0.003;
const INTER_TRADE_DELAY = 500;

interface TokenResult {
  accessToken: string;
  newRefreshToken?: string;
}

async function refreshToken(policy: RebalancePolicy): Promise<TokenResult | null> {
  if (!policy.refreshToken) return null;
  try {
    const { refreshAccessToken } = await import('@/lib/auth');
    const result = await refreshAccessToken({
      userId: policy.userId,
      username: policy.username,
      displayName: policy.displayName,
      accessToken: '',
      refreshToken: policy.refreshToken,
      expiresAt: 0,
    });
    if (!result) return null;
    return {
      accessToken: result.session.accessToken,
      newRefreshToken: result.session.refreshToken,
    };
  } catch (e) {
    console.error(`[cron] Token refresh failed for ${policy.username}:`, (e as Error).message);
    return null;
  }
}

async function fetchPortfolio(accessToken: string): Promise<PortfolioAnalysis | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/trading/info/portfolio`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-request-id': randomUUID(),
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const positions = data?.positions ?? data?.data?.positions ?? [];
    if (!positions.length) return null;

    const instrumentIds = [...new Set(positions.map((p: any) => p.instrumentID || p.InstrumentID))];
    const ratesRes = await fetch(`${BASE}/api/v1/market-data/instruments?instrumentIds=${instrumentIds.join(',')}`, {
      headers: { 'x-api-key': ETORO_API_KEY, 'x-user-key': ETORO_USER_KEY, 'x-request-id': randomUUID() },
    });

    const symbolMap = new Map<number, string>();
    const displayNameMap = new Map<number, string>();
    const rateMap = new Map<number, number>();

    if (ratesRes.ok) {
      const rd = await ratesRes.json();
      for (const inst of (rd?.instruments ?? rd?.instrumentDisplayDatas ?? rd ?? [])) {
        const id = inst.instrumentId ?? inst.InstrumentID;
        symbolMap.set(id, inst.symbolFull ?? `${id}`);
        displayNameMap.set(id, inst.instrumentDisplayName ?? inst.symbolFull ?? `${id}`);
        rateMap.set(id, inst.lastPrice ?? inst.closingPrices?.official ?? 0);
      }
    }

    const grouped = new Map<number, any[]>();
    for (const pos of positions) {
      const id = pos.instrumentID || pos.InstrumentID;
      (grouped.get(id) ?? (grouped.set(id, []), grouped.get(id)!)).push(pos);
    }

    const holdings: PortfolioHolding[] = [];
    let totalPositionValue = 0;
    for (const [instrumentId, posGroup] of grouped) {
      let totalUnits = 0, investedAmount = 0;
      for (const pos of posGroup) {
        totalUnits += pos.units ?? 0;
        investedAmount += pos.amount ?? 0;
      }
      const price = rateMap.get(instrumentId) ?? 0;
      const totalValue = totalUnits * price;
      totalPositionValue += totalValue;
      holdings.push({
        instrumentId,
        symbol: symbolMap.get(instrumentId) ?? `${instrumentId}`,
        displayName: displayNameMap.get(instrumentId) ?? `${instrumentId}`,
        positions: posGroup,
        totalUnits, totalValue, investedAmount,
        weight: 0,
        pnl: totalValue - investedAmount,
      });
    }

    const credit = data?.credit ?? 0;
    const totalValue = totalPositionValue + credit;
    for (const h of holdings) h.weight = totalValue > 0 ? h.totalValue / totalValue : 0;
    holdings.sort((a, b) => b.weight - a.weight);

    return {
      holdings, totalValue,
      investedValue: holdings.reduce((s, h) => s + h.investedAmount, 0),
      availableCash: credit,
      cashWeight: totalValue > 0 ? credit / totalValue : 0,
      timestamp: new Date().toISOString(),
    };
  } catch { return null; }
}

function executionPath(mode: string, endpoint: string): string {
  return `/api/v1/trading/execution/${mode}/${endpoint}`;
}

async function executeTrades(
  trades: TradeProgress[],
  accessToken: string,
  mode: 'real' | 'demo',
  marketInfo: Map<number, { isMarketOpen: boolean; lastPrice: number }>,
): Promise<TradeProgress[]> {
  const results: TradeProgress[] = [];
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  for (const trade of trades) {
    const info = marketInfo.get(trade.instrumentId);
    const isOpen = info?.isMarketOpen ?? true;
    const lastPrice = info?.lastPrice ?? 0;

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'x-request-id': randomUUID(),
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      };

      let url: string;
      let body: any;
      let orderType: 'market' | 'limit' = 'market';
      let limitRate: number | undefined;

      if (trade.action === 'buy') {
        if (isOpen) {
          url = `${BASE}${executionPath(mode, 'market-open-orders/by-amount')}`;
          body = {
            InstrumentID: trade.instrumentId, IsBuy: true, Leverage: 1,
            Amount: trade.amount, IsNoStopLoss: true, IsNoTakeProfit: true,
          };
        } else {
          orderType = 'limit';
          limitRate = Math.round(lastPrice * (1 + LIMIT_BUFFER) * 100) / 100;
          url = `${BASE}${executionPath(mode, 'limit-orders')}`;
          body = {
            InstrumentID: trade.instrumentId, IsBuy: true, Leverage: 1,
            Amount: trade.amount, Rate: limitRate,
            IsNoStopLoss: true, IsNoTakeProfit: true,
          };
        }
      } else {
        if (!trade.positionId) {
          results.push({ ...trade, status: 'failed', error: 'Missing positionId' });
          continue;
        }
        if (isOpen) {
          url = `${BASE}${executionPath(mode, `market-close-orders/positions/${trade.positionId}`)}`;
          body = { InstrumentId: trade.instrumentId, UnitsToDeduct: trade.units ?? null };
        } else {
          orderType = 'limit';
          limitRate = Math.round(lastPrice * (1 - LIMIT_BUFFER) * 100) / 100;
          url = `${BASE}${executionPath(mode, 'limit-orders')}`;
          body = {
            InstrumentID: trade.instrumentId, IsBuy: false, Leverage: 1,
            Amount: trade.amount, Rate: limitRate,
            IsNoStopLoss: true, IsNoTakeProfit: true,
          };
        }
      }

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await res.text();

      if (res.ok) {
        const data = text ? JSON.parse(text) : {};
        results.push({
          ...trade,
          status: orderType === 'limit' ? 'limit-pending' : 'success',
          orderType,
          orderId: data.orderId ?? data.OrderID,
          limitRate,
          marketOpen: isOpen,
          executedAt: new Date().toISOString(),
        });
      } else if (res.status === 401 || res.status === 403) {
        results.push({ ...trade, status: 'failed', error: 'AUTH_EXPIRED' });
        break;
      } else {
        results.push({ ...trade, status: 'failed', error: `${res.status}: ${text.slice(0, 200)}` });
      }

      await delay(INTER_TRADE_DELAY);
    } catch (e: any) {
      results.push({ ...trade, status: 'failed', error: e.message });
    }
  }

  return results;
}

async function executePolicy(
  policy: RebalancePolicy,
  trigger: ExecutionTrigger,
  driftValue?: number,
  driftDetails?: Array<{ symbol: string; currentWeight: number; targetWeight: number; drift: number }>,
): Promise<RebalanceExecution> {
  const execution: RebalanceExecution = {
    id: generateExecutionId(),
    policyId: policy.id,
    userId: policy.userId,
    username: policy.username,
    trigger,
    driftAtTrigger: driftValue,
    driftDetails,
    status: 'running',
    startedAt: new Date().toISOString(),
    tradesPlanned: 0,
    tradesExecuted: 0,
    tradesFailed: 0,
    trades: [],
    accountType: policy.accountType,
  };
  saveExecution(execution);

  // 1. Refresh token
  const tokenResult = await refreshToken(policy);
  if (!tokenResult) {
    execution.status = 'auth-expired';
    execution.error = 'Could not refresh authentication token. User needs to re-login.';
    execution.completedAt = new Date().toISOString();
    saveExecution(execution);
    policy.enabled = false;
    savePolicy(policy);
    return execution;
  }

  if (tokenResult.newRefreshToken) {
    policy.refreshToken = tokenResult.newRefreshToken;
    savePolicy(policy);
  }

  // 2. Fetch portfolio
  const portfolio = await fetchPortfolio(tokenResult.accessToken);
  if (!portfolio) {
    execution.status = 'failed';
    execution.error = 'Could not fetch portfolio';
    execution.completedAt = new Date().toISOString();
    saveExecution(execution);
    return execution;
  }

  // 3. Create rebalance plan
  const plan = createRebalancePlan({
    analysis: portfolio,
    targets: policy.targetAllocations,
    validations: policy.targetAllocations.map(t => ({
      symbol: t.symbol, instrumentId: t.instrumentId,
      isValid: true, isOpen: true, isTradable: true, isBuyEnabled: true, status: 'valid' as const,
    })),
  });

  const allTrades: TradeProgress[] = [
    ...plan.fullCloses.map(t => ({ ...t, status: 'pending' as const })),
    ...plan.partialCloses.map(t => ({ ...t, status: 'pending' as const })),
    ...plan.opens.map(t => ({ ...t, status: 'pending' as const })),
  ];

  execution.tradesPlanned = allTrades.length;
  saveExecution(execution);

  if (allTrades.length === 0) {
    execution.status = 'completed';
    execution.completedAt = new Date().toISOString();
    saveExecution(execution);
    return execution;
  }

  // 4. Get market info for limit orders
  const instrumentIds = [...new Set(allTrades.map(t => t.instrumentId))];
  const marketInfo = new Map<number, { isMarketOpen: boolean; lastPrice: number }>();
  try {
    const url = `${BASE}/api/v1/market-data/instruments?instrumentIds=${instrumentIds.join(',')}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': ETORO_API_KEY, 'x-user-key': ETORO_USER_KEY, 'x-request-id': randomUUID() },
    });
    if (res.ok) {
      const data = await res.json();
      for (const inst of (data?.instruments ?? data ?? [])) {
        marketInfo.set(inst.instrumentId, {
          isMarketOpen: inst.isMarketOpen !== false,
          lastPrice: inst.lastPrice ?? inst.closingPrices?.official ?? 0,
        });
      }
    }
  } catch {}

  // 5. Execute trades (two-phase: closes first, then buys)
  const closes = allTrades.filter(t => t.action !== 'buy');
  const buys = allTrades.filter(t => t.action === 'buy');

  const closeResults = await executeTrades(closes, tokenResult.accessToken, policy.accountType, marketInfo);
  const buyResults = await executeTrades(buys, tokenResult.accessToken, policy.accountType, marketInfo);
  const allResults = [...closeResults, ...buyResults];

  execution.trades = allResults;
  execution.tradesExecuted = allResults.filter(t => t.status === 'success' || t.status === 'limit-pending').length;
  execution.tradesFailed = allResults.filter(t => t.status === 'failed').length;

  const authExpired = allResults.some(t => t.error === 'AUTH_EXPIRED');
  execution.status = authExpired ? 'auth-expired'
    : execution.tradesFailed > execution.tradesExecuted ? 'failed'
    : 'completed';

  execution.completedAt = new Date().toISOString();
  execution.summary = {
    totalTrades: allResults.length,
    successful: allResults.filter(t => t.status === 'success').length,
    failed: execution.tradesFailed,
    skipped: allResults.filter(t => t.status === 'skipped').length,
    totalFeesEstimate: allResults.reduce((s, t) => s + (t.actualAmount || t.amount) * 0.0015, 0),
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    trades: allResults,
  };

  saveExecution(execution);

  // Update policy
  policy.lastRebalanceAt = new Date().toISOString();
  if (policy.schedule && (policy.mode === 'scheduled' || policy.mode === 'both')) {
    policy.nextScheduledAt = computeNextScheduledTime(policy.schedule);
  }
  if (authExpired) policy.enabled = false;
  savePolicy(policy);

  return execution;
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dry') === 'true';
  const results: any[] = [];

  // 1. Process scheduled rebalances
  const scheduledPolicies = findActiveScheduledPolicies();
  for (const policy of scheduledPolicies) {
    console.log(`[cron] Scheduled rebalance for ${policy.username} (policy ${policy.id})`);
    if (dryRun) {
      results.push({ policyId: policy.id, username: policy.username, trigger: 'scheduled', action: 'would-execute' });
    } else {
      const execution = await executePolicy(policy, 'scheduled');
      results.push({
        policyId: policy.id,
        username: policy.username,
        trigger: 'scheduled',
        executionId: execution.id,
        status: execution.status,
        tradesPlanned: execution.tradesPlanned,
        tradesExecuted: execution.tradesExecuted,
      });
    }
  }

  // 2. Process drift-based rebalances
  const driftPolicies = findActiveDriftPolicies();
  for (const policy of driftPolicies) {
    // Skip if recently rebalanced (cooldown: 1 hour)
    if (policy.lastRebalanceAt) {
      const sinceLastRebalance = Date.now() - new Date(policy.lastRebalanceAt).getTime();
      if (sinceLastRebalance < 3600_000) {
        results.push({ policyId: policy.id, username: policy.username, trigger: 'drift', action: 'cooldown' });
        continue;
      }
    }

    const tokenResult = await refreshToken(policy);
    if (!tokenResult) {
      results.push({ policyId: policy.id, username: policy.username, trigger: 'drift', error: 'token-expired' });
      continue;
    }

    // Persist rotated refresh token so executePolicy can refresh again
    if (tokenResult.newRefreshToken) {
      policy.refreshToken = tokenResult.newRefreshToken;
      savePolicy(policy);
    }

    const portfolio = await fetchPortfolio(tokenResult.accessToken);
    if (!portfolio) {
      results.push({ policyId: policy.id, username: policy.username, trigger: 'drift', error: 'portfolio-fetch-failed' });
      continue;
    }

    const drift = calculateDrift(portfolio, policy.targetAllocations);
    policy.lastDriftCheck = new Date().toISOString();
    policy.lastDriftValue = drift.maxAbsDrift;
    policy.lastDriftDetails = drift.drifts
      .filter(d => Math.abs(d.drift) > 0.001)
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
      .slice(0, 10)
      .map(d => ({ symbol: d.symbol, drift: d.drift }));
    savePolicy(policy);

    if (drift.isWithinBand(policy.driftThreshold)) {
      results.push({
        policyId: policy.id, username: policy.username, trigger: 'drift',
        action: 'within-band', maxDrift: drift.maxAbsDrift, threshold: policy.driftThreshold,
      });
      continue;
    }

    console.log(`[cron] Drift rebalance for ${policy.username}: maxDrift=${(drift.maxAbsDrift * 100).toFixed(1)}% > threshold=${(policy.driftThreshold * 100).toFixed(1)}%`);

    if (dryRun) {
      results.push({
        policyId: policy.id, username: policy.username, trigger: 'drift',
        action: 'would-execute', maxDrift: drift.maxAbsDrift, threshold: policy.driftThreshold,
      });
    } else {
      const driftDetails = drift.drifts.map(d => ({
        symbol: d.symbol, currentWeight: d.currentWeight, targetWeight: d.targetWeight, drift: d.drift,
      }));
      const execution = await executePolicy(policy, 'drift', drift.maxAbsDrift, driftDetails);
      results.push({
        policyId: policy.id, username: policy.username, trigger: 'drift',
        executionId: execution.id, status: execution.status,
        maxDrift: drift.maxAbsDrift, tradesPlanned: execution.tradesPlanned, tradesExecuted: execution.tradesExecuted,
      });
    }
  }

  const pruned = pruneOldExecutions();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    dryRun,
    scheduledProcessed: scheduledPolicies.length,
    driftChecked: driftPolicies.length,
    results,
    ...(pruned > 0 ? { prunedExecutions: pruned } : {}),
  });
}
