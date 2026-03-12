export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const BASE = 'https://public-api.etoro.com';

interface TradeRequest {
  action: 'buy' | 'full-close' | 'partial-close';
  instrumentId: number;
  amount?: number;
  positionId?: number;
  unitsToDeduct?: number | null;
  symbol?: string;
}

interface ExecuteBody {
  trades: TradeRequest[];
  accountType: 'real' | 'demo';
}

type Mode = 'real' | 'demo';

function executionPath(mode: Mode, endpoint: string): string {
  return `/api/v1/trading/execution/${mode}/${endpoint}`;
}

function makeHeaders(bearerToken: string) {
  return {
    Authorization: `Bearer ${bearerToken}`,
    'x-request-id': randomUUID(),
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

async function etoroCall(method: string, path: string, body: any, bearerToken: string, retries = MAX_RETRIES): Promise<any> {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: makeHeaders(bearerToken),
  };
  if (body) opts.body = JSON.stringify(body);

  for (let attempt = 0; attempt <= retries; attempt++) {
    console.log(`[execute] ${method} ${url}${attempt > 0 ? ` (retry ${attempt})` : ''}`);
    const res = await fetch(url, opts);
    const text = await res.text();

    if (res.ok) {
      console.log(`[execute] ✅ ${method} ${path} → ${res.status}`);
      return text ? JSON.parse(text) : {};
    }

    console.error(`[execute] ❌ ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);

    if (res.status === 401 || res.status === 403) {
      throw new Error(`AUTH_EXPIRED: eToro session expired (${res.status}). Please re-login.`);
    }

    const isRetryable = res.status === 429 || res.status >= 500;
    if (isRetryable && attempt < retries) {
      const delay = RETRY_DELAY_MS * (attempt + 1);
      console.warn(`[execute] Retrying ${path} (${res.status}) in ${delay}ms — attempt ${attempt + 1}/${retries}`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    throw new Error(`eToro ${res.status}: ${text.slice(0, 300)}`);
  }
  throw new Error('Unexpected: exhausted retries');
}

export async function POST(req: NextRequest) {
  try {
    const { ensureFreshSession, buildSessionCookie } = await import('@/lib/auth');

    const sessionResult = await ensureFreshSession(req.headers.get('cookie'));
    if (!sessionResult) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { session, newCookie } = sessionResult;
    const { trades, accountType = 'demo' }: ExecuteBody = await req.json();

    if (!trades?.length) {
      return NextResponse.json({ error: 'No trades provided' }, { status: 400 });
    }

    const mode: Mode = accountType;
    const results = [];

    // Pre-flight: check market status for all instruments
    const instrumentIds = [...new Set(trades.map(t => t.instrumentId))];
    let closedInstruments = new Set<number>();
    try {
      const ETORO_API_KEY = process.env.ETORO_API_KEY || '';
      const ETORO_USER_KEY = process.env.ETORO_USER_KEY || '';
      const statusUrl = `${BASE}/api/v1/market-data/instruments?instrumentIds=${instrumentIds.join(',')}&fields=instrumentId,isMarketOpen,symbolFull`;
      const statusRes = await fetch(statusUrl, {
        headers: { 'x-api-key': ETORO_API_KEY, 'x-user-key': ETORO_USER_KEY, 'x-request-id': randomUUID() },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const instruments = statusData?.instruments ?? statusData ?? [];
        for (const inst of instruments) {
          if (inst.isMarketOpen === false) {
            closedInstruments.add(inst.instrumentId);
            console.warn(`[execute] Market CLOSED for ${inst.symbolFull ?? inst.instrumentId}`);
          }
        }
      }
    } catch (e) {
      console.warn('[execute] Market status check failed, proceeding anyway:', (e as Error).message);
    }

    for (const trade of trades) {
      // Skip if market is closed
      if (closedInstruments.has(trade.instrumentId)) {
        console.log(`[execute] SKIPPED ${trade.symbol} (${trade.instrumentId}) — market closed`);
        results.push({
          instrumentId: trade.instrumentId,
          symbol: trade.symbol,
          action: trade.action,
          status: 'error',
          error: `Market closed for ${trade.symbol ?? trade.instrumentId}`,
        });
        continue;
      }

      try {
        let orderResult: any;

        if (trade.action === 'buy') {
          const path = executionPath(mode, 'market-open-orders/by-amount');
          console.log(`[execute] BUY ${trade.symbol} (${trade.instrumentId}) $${trade.amount} → ${path}`);
          orderResult = await etoroCall(
            'POST', path,
            {
              InstrumentID: trade.instrumentId,
              IsBuy: true,
              Leverage: 1,
              Amount: trade.amount,
              StopLossRate: null,
              TakeProfitRate: null,
              IsTslEnabled: null,
              IsNoStopLoss: true,
              IsNoTakeProfit: true,
            },
            session.accessToken
          );
          results.push({
            instrumentId: trade.instrumentId,
            symbol: trade.symbol,
            action: trade.action,
            status: 'ok',
            orderId: orderResult?.orderId || orderResult?.OrderID,
          });

        } else if (trade.action === 'full-close' || trade.action === 'partial-close') {
          if (!trade.positionId) {
            console.error(`[execute] Missing positionId for ${trade.action} on ${trade.symbol} (${trade.instrumentId})`);
            results.push({
              instrumentId: trade.instrumentId,
              symbol: trade.symbol,
              action: trade.action,
              status: 'error',
              error: `Missing positionId — cannot ${trade.action} without it`,
            });
            continue;
          }

          const path = executionPath(mode, `market-close-orders/positions/${trade.positionId}`);
          console.log(`[execute] ${trade.action.toUpperCase()} ${trade.symbol} (${trade.instrumentId}) pos=${trade.positionId} → ${path}`);
          orderResult = await etoroCall(
            'POST', path,
            {
              InstrumentId: trade.instrumentId,
              UnitsToDeduct: trade.unitsToDeduct ?? null,
            },
            session.accessToken
          );
          results.push({
            instrumentId: trade.instrumentId,
            symbol: trade.symbol,
            action: trade.action,
            status: 'ok',
            orderId: orderResult?.orderId || orderResult?.OrderID,
          });
        }

      } catch (err: any) {
        console.error(`[execute] Trade failed for ${trade.symbol} (${trade.instrumentId}):`, err.message);
        results.push({
          instrumentId: trade.instrumentId,
          symbol: trade.symbol,
          action: trade.action,
          status: 'error',
          error: err.message,
        });
      }
    }

    const okCount = results.filter(r => r.status === 'ok').length;
    const errCount = results.filter(r => r.status === 'error').length;
    console.log(`[execute] Done: ${okCount} ok, ${errCount} failed (mode: ${mode})`);

    const response = NextResponse.json({ results, summary: { ok: okCount, errors: errCount, mode } });
    if (newCookie) {
      response.headers.append('Set-Cookie', buildSessionCookie(newCookie));
    }
    return response;

  } catch (e: any) {
    console.error('[execute] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
