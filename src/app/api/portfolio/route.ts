export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const ETORO_BASE = 'https://public-api.etoro.com/api/v1';

function makeHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'x-request-id': randomUUID(),
    'Content-Type': 'application/json',
  };
}

async function etoroGet(path: string, accessToken: string) {
  const res = await fetch(`${ETORO_BASE}${path}`, { headers: makeHeaders(accessToken) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eToro ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Batch instrument name + symbol lookup — max 100 per request (AgentX pattern)
async function enrichInstruments(
  ids: number[],
  apiKey: string,
  userKey: string,
): Promise<Record<number, { symbol: string; displayName: string }>> {
  const result: Record<number, { symbol: string; displayName: string }> = {};
  if (!ids.length) return result;

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const res = await fetch(
        `${ETORO_BASE}/market-data/instruments?instrumentIds=${batch.join(',')}`,
        { headers: { 'x-api-key': apiKey, 'x-user-key': userKey, 'x-request-id': randomUUID() } },
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const inst of data?.instrumentDisplayDatas ?? []) {
        let symbol = `ID:${inst.instrumentID}`;
        for (const img of inst.images ?? []) {
          if (img.uri?.includes('market-avatars/')) {
            symbol = img.uri.split('market-avatars/')[1].split('/')[0].toUpperCase();
            break;
          }
        }
        result[inst.instrumentID] = {
          symbol,
          displayName: inst.instrumentDisplayName ?? symbol,
        };
      }
    } catch { /* skip batch on error */ }
  }
  return result;
}

interface AggHolding {
  instrumentId: number;
  symbol: string;
  displayName: string;
  totalUnits: number;
  investedAmount: number;
  effectiveExposure: number;
  pnl: number;
  positions: any[];
}

function upsertInstrument(
  map: Map<number, AggHolding>,
  p: any,
  pnlByPosition: Record<number, number>,
) {
  const id: number = p.instrumentID;
  const amount: number = p.amount || 0;
  const units: number = p.units || 0;
  const effectiveExposure: number = amount * (p.leverage || 1);
  const pnl: number =
    pnlByPosition[p.positionID] !== undefined
      ? pnlByPosition[p.positionID]
      : (p.netProfit ?? p.profit ?? 0);

  const pos = {
    positionID: p.positionID, instrumentID: id,
    isBuy: p.isBuy ?? true, amount, units,
    openRate: p.openRate || 0, leverage: p.leverage || 1,
    stopLossRate: p.stopLossRate ?? null, takeProfitRate: p.takeProfitRate ?? null,
    isOpen: true,
  };

  const existing = map.get(id);
  if (existing) {
    existing.totalUnits += units;
    existing.investedAmount += amount;
    existing.effectiveExposure += effectiveExposure;
    existing.pnl += pnl;
    existing.positions.push(pos);
  } else {
    map.set(id, {
      instrumentId: id, symbol: `ID:${id}`, displayName: `Instrument ${id}`,
      totalUnits: units, investedAmount: amount, effectiveExposure, pnl, positions: [pos],
    });
  }
}

function finaliseHoldings(
  map: Map<number, AggHolding>,
  names: Record<number, { symbol: string; displayName: string }>,
  equity: number,
) {
  return [...map.values()]
    .map(h => {
      const n = names[h.instrumentId];
      const totalValue = h.investedAmount + h.pnl;
      return {
        instrumentId: h.instrumentId,
        symbol: n?.symbol ?? h.symbol,
        displayName: n?.displayName ?? h.displayName,
        positions: h.positions,
        totalUnits: Math.round(h.totalUnits * 1e6) / 1e6,
        totalValue: Math.round(totalValue * 100) / 100,
        investedAmount: Math.round(h.investedAmount * 100) / 100,
        pnl: Math.round(h.pnl * 100) / 100,
        effectiveExposure: Math.round(h.effectiveExposure * 100) / 100,
        instrumentTypeId: h.positions[0]?.instrumentTypeID ?? h.positions[0]?.instrumentTypeId ?? undefined,
        weight: equity > 0 ? totalValue / equity : 0,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

export async function GET(req: NextRequest) {
  try {
    const { ensureFreshSession, buildSessionCookie } = await import('@/lib/auth');
    const sessionResult = await ensureFreshSession(req.headers.get('cookie'));
    if (!sessionResult) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { session, newCookie } = sessionResult;
    const token = session.accessToken;

    const accountType = req.nextUrl.searchParams.get('accountType') ?? 'real';
    const isDemo = accountType === 'demo';
    const portfolioPath = isDemo ? '/trading/info/demo/portfolio' : '/trading/info/portfolio';
    const pnlPath = isDemo ? '/trading/info/demo/pnl' : '/trading/info/real/pnl';

    console.log(`[portfolio] Fetching ${accountType} portfolio + PnL`);

    let raw: any, pnlData: any = null;
    try {
      [raw, pnlData] = await Promise.all([
        etoroGet(portfolioPath, token),
        etoroGet(pnlPath, token).catch((e: Error) => {
          console.warn(`[portfolio] PnL endpoint failed: ${e.message.slice(0, 80)}`);
          return null;
        }),
      ]);
    } catch (e: any) {
      if (e.message.includes('403') && isDemo) {
        return NextResponse.json({
          error: 'Demo portfolio access not available',
          hint: 'Contact Shimi to add demo scope to app 24dbd444.',
        }, { status: 403 });
      }
      throw e;
    }

    const cp = raw?.clientPortfolio;
    if (!cp) return NextResponse.json({ error: 'No portfolio data in response' }, { status: 502 });

    // ── positionID → unrealized PnL (from /pnl endpoint) ─────────────────
    const pnlByPosition: Record<number, number> = {};
    let pnlEndpointTotal = 0;
    if (pnlData?.clientPortfolio) {
      for (const p of pnlData.clientPortfolio.positions ?? []) {
        const v = p.unrealizedPnL?.pnL ?? 0;
        pnlByPosition[p.positionID ?? p.positionId] = v;
        pnlEndpointTotal += v;
      }
      for (const m of pnlData.clientPortfolio.mirrors ?? []) {
        for (const p of m.positions ?? []) {
          const v = p.unrealizedPnL?.pnL ?? 0;
          pnlByPosition[p.positionID ?? p.positionId] = v;
          pnlEndpointTotal += v;
        }
      }
      console.log(`[portfolio] PnL endpoint: ${Object.keys(pnlByPosition).length} positions, unrealized=$${Math.round(pnlEndpointTotal)}`);
    }

    // ── Separate maps: direct positions ONLY / copy positions ONLY ─────────
    const directMap = new Map<number, AggHolding>(); // cp.positions only
    const copyMap   = new Map<number, AggHolding>(); // mirror positions only

    for (const p of cp.positions ?? []) {
      upsertInstrument(directMap, p, pnlByPosition);
    }

    let mirrorClosedPnL = 0;
    for (const mirror of cp.mirrors ?? []) {
      mirrorClosedPnL += mirror.closedPositionsNetProfit ?? 0;
      for (const p of mirror.positions ?? []) {
        upsertInstrument(copyMap, p, pnlByPosition);
      }
    }
    console.log(`[portfolio] Mirror closed P&L: $${Math.round(mirrorClosedPnL)}`);

    // ── Enrich instrument names/symbols (batched by 100) ──────────────────
    const apiKey  = process.env.ETORO_API_KEY ?? '';
    const userKey = process.env.ETORO_USER_KEY ?? '';
    const allIds  = [...new Set([...directMap.keys(), ...copyMap.keys()])];
    const names   = apiKey ? await enrichInstruments(allIds, apiKey, userKey) : {};
    console.log(`[portfolio] Enriched ${Object.keys(names).length}/${allIds.length} instruments`);

    // ── Equity = credit + all invested + all open PnL + mirror closed PnL ─
    const credit       = cp.credit ?? 0;
    const directInvested  = [...directMap.values()].reduce((s, h) => s + h.investedAmount, 0);
    const copyInvested    = [...copyMap.values()].reduce((s, h) => s + h.investedAmount, 0);
    const directOpenPnL   = [...directMap.values()].reduce((s, h) => s + h.pnl, 0);
    const copyOpenPnL     = [...copyMap.values()].reduce((s, h) => s + h.pnl, 0);
    const totalInvested   = directInvested + copyInvested;
    const totalOpenPnL    = directOpenPnL + copyOpenPnL;
    const totalPnL        = totalOpenPnL + mirrorClosedPnL;
    const equity          = credit + totalInvested + totalPnL;

    console.log(`[portfolio] equity=$${Math.round(equity)} | invested=$${Math.round(totalInvested)} | openPnL=$${Math.round(totalOpenPnL)} | closedMirror=$${Math.round(mirrorClosedPnL)} | credit=$${Math.round(credit)} | direct=${directMap.size} | copy=${copyMap.size}`);

    const directHoldings = finaliseHoldings(directMap, names, equity);
    const copyHoldings   = finaliseHoldings(copyMap,   names, equity);

    // Direct equity = cash + direct invested + direct open PnL (NOT including copy positions)
    const directEquity = credit + directInvested + directOpenPnL;

    const response = NextResponse.json({
      // Separated — used by PortfolioStep tabs
      directHoldings,
      copyHoldings,
      // Combined for backward compat (older components that read holdings[])
      holdings: [...directHoldings, ...copyHoldings],
      totalValue:    Math.round(equity * 100) / 100,
      investedValue: Math.round(totalInvested * 100) / 100,
      availableCash: Math.round(credit * 100) / 100,
      totalPnL:      Math.round(totalPnL * 100) / 100,
      cashWeight:    equity > 0 ? credit / equity : 0,
      directEquity:  Math.round(directEquity * 100) / 100,
      timestamp:     new Date().toISOString(),
      accountType,
    });
    if (newCookie) response.headers.append('Set-Cookie', buildSessionCookie(newCookie));
    return response;

  } catch (e: any) {
    console.error('[portfolio] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
