/**
 * /api/drift/check — Check drift for a specific policy or all active drift policies.
 * Query: ?policyId=xxx or no param to check all.
 * Uses eToro public API (x-api-key/x-user-key) for portfolio + rates,
 * then compares current weights to policy targets.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { loadPolicy, findActiveDriftPolicies, savePolicy } from '@/lib/policy-store';
import { calculateDrift } from '@/engine/portfolio-analyzer';
import type { PortfolioAnalysis, PortfolioHolding } from '@/types/rebalancer';
import { randomUUID } from 'crypto';

const BASE = 'https://public-api.etoro.com';
const ETORO_API_KEY = process.env.ETORO_API_KEY || '';
const ETORO_USER_KEY = process.env.ETORO_USER_KEY || '';

async function fetchPortfolioForPolicy(policy: { refreshToken?: string; accountType: string }): Promise<PortfolioAnalysis | null> {
  try {
    let accessToken = '';

    if (policy.refreshToken) {
      const { refreshAccessToken } = await import('@/lib/auth');
      const refreshed = await refreshAccessToken({
        userId: '', username: '', displayName: '',
        accessToken: '', refreshToken: policy.refreshToken,
        expiresAt: 0,
      });
      if (refreshed) accessToken = refreshed.session.accessToken;
    }

    if (!accessToken) return null;

    const portfolioRes = await fetch(`${BASE}/api/v1/trading/info/portfolio`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-request-id': randomUUID(),
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!portfolioRes.ok) return null;
    const portfolioData = await portfolioRes.json();

    const positions = portfolioData?.positions ?? portfolioData?.data?.positions ?? [];
    if (!positions.length) return null;

    const instrumentIds = [...new Set(positions.map((p: any) => p.instrumentID || p.InstrumentID))];
    const ratesRes = await fetch(`${BASE}/api/v1/market-data/instruments?instrumentIds=${instrumentIds.join(',')}`, {
      headers: {
        'x-api-key': ETORO_API_KEY,
        'x-user-key': ETORO_USER_KEY,
        'x-request-id': randomUUID(),
      },
    });

    const symbolMap = new Map<number, string>();
    const displayNameMap = new Map<number, string>();
    const rateMap = new Map<number, number>();

    if (ratesRes.ok) {
      const ratesData = await ratesRes.json();
      const instruments = ratesData?.instruments ?? ratesData?.instrumentDisplayDatas ?? ratesData ?? [];
      for (const inst of instruments) {
        const id = inst.instrumentId ?? inst.InstrumentID;
        symbolMap.set(id, inst.symbolFull ?? inst.SymbolFull ?? `${id}`);
        displayNameMap.set(id, inst.instrumentDisplayName ?? inst.InstrumentDisplayName ?? inst.symbolFull ?? `${id}`);
        rateMap.set(id, inst.lastPrice ?? inst.closingPrices?.official ?? 0);
      }
    }

    const grouped = new Map<number, any[]>();
    for (const pos of positions) {
      const id = pos.instrumentID || pos.InstrumentID;
      const existing = grouped.get(id) ?? [];
      existing.push(pos);
      grouped.set(id, existing);
    }

    const holdings: PortfolioHolding[] = [];
    let totalPositionValue = 0;

    for (const [instrumentId, posGroup] of grouped) {
      let totalUnits = 0, investedAmount = 0;
      for (const pos of posGroup) {
        totalUnits += pos.units ?? pos.Units ?? 0;
        investedAmount += pos.amount ?? pos.Amount ?? 0;
      }
      const price = rateMap.get(instrumentId) ?? 0;
      const totalValue = totalUnits * price;
      totalPositionValue += totalValue;

      holdings.push({
        instrumentId,
        symbol: symbolMap.get(instrumentId) ?? `${instrumentId}`,
        displayName: displayNameMap.get(instrumentId) ?? `${instrumentId}`,
        positions: posGroup,
        totalUnits,
        totalValue,
        investedAmount,
        weight: 0,
        pnl: totalValue - investedAmount,
      });
    }

    const credit = portfolioData?.credit ?? portfolioData?.data?.credit ?? 0;
    const totalValue = totalPositionValue + credit;
    for (const h of holdings) h.weight = totalValue > 0 ? h.totalValue / totalValue : 0;
    holdings.sort((a, b) => b.weight - a.weight);

    return {
      holdings,
      totalValue,
      investedValue: holdings.reduce((s, h) => s + h.investedAmount, 0),
      availableCash: credit,
      cashWeight: totalValue > 0 ? credit / totalValue : 0,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[drift] Portfolio fetch error:', (e as Error).message);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const cronKey = req.nextUrl.searchParams.get('key');
  const policyId = req.nextUrl.searchParams.get('policyId');
  const ADMIN_KEY = process.env.ADMIN_KEY || 'rebalancer-admin-2026';

  // If policyId provided, check auth via cookie
  if (policyId) {
    const { getSessionFromCookies } = await import('@/lib/auth');
    const session = getSessionFromCookies(req.headers.get('cookie'));
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const policy = loadPolicy(policyId);
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    if (policy.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const portfolio = await fetchPortfolioForPolicy(policy);
    if (!portfolio) {
      return NextResponse.json({ error: 'Could not fetch portfolio (token may be expired)' }, { status: 502 });
    }

    const drift = calculateDrift(portfolio, policy.targetAllocations);
    const needsRebalance = !drift.isWithinBand(policy.driftThreshold);

    policy.lastDriftCheck = new Date().toISOString();
    policy.lastDriftValue = drift.maxAbsDrift;
    policy.lastDriftDetails = drift.drifts
      .filter(d => Math.abs(d.drift) > 0.001)
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
      .slice(0, 10)
      .map(d => ({ symbol: d.symbol, drift: d.drift }));
    savePolicy(policy);

    return NextResponse.json({
      policyId: policy.id,
      maxDrift: drift.maxAbsDrift,
      threshold: policy.driftThreshold,
      needsRebalance,
      drifts: drift.drifts.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)),
      checkedAt: policy.lastDriftCheck,
    });
  }

  // Bulk check: admin key required
  if (cronKey !== ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const policies = findActiveDriftPolicies();
  const results = [];

  for (const policy of policies) {
    const portfolio = await fetchPortfolioForPolicy(policy);
    if (!portfolio) {
      results.push({ policyId: policy.id, username: policy.username, error: 'token-expired' });
      continue;
    }

    const drift = calculateDrift(portfolio, policy.targetAllocations);
    const needsRebalance = !drift.isWithinBand(policy.driftThreshold);

    policy.lastDriftCheck = new Date().toISOString();
    policy.lastDriftValue = drift.maxAbsDrift;
    policy.lastDriftDetails = drift.drifts
      .filter(d => Math.abs(d.drift) > 0.001)
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
      .slice(0, 10)
      .map(d => ({ symbol: d.symbol, drift: d.drift }));
    savePolicy(policy);

    results.push({
      policyId: policy.id,
      username: policy.username,
      maxDrift: drift.maxAbsDrift,
      threshold: policy.driftThreshold,
      needsRebalance,
      topDrifts: drift.drifts.slice(0, 5).map(d => `${d.symbol}: ${(d.drift * 100).toFixed(1)}%`),
    });
  }

  return NextResponse.json({ checked: results.length, results });
}
