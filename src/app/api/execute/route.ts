export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const BASE = 'https://public-api.etoro.com';
const LIMIT_BUFFER = 0.003; // 0.3% buffer on limit orders

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

interface MarketInfo {
  isMarketOpen: boolean;
  lastPrice: number;
  symbolFull?: string;
}

async function getMarketInfo(instrumentIds: number[]): Promise<Map<number, MarketInfo>> {
  const ETORO_API_KEY = process.env.ETORO_API_KEY || '';
  const ETORO_USER_KEY = process.env.ETORO_USER_KEY || '';
  const map = new Map<number, MarketInfo>();

  try {
    const url = `${BASE}/api/v1/market-data/instruments?instrumentIds=${instrumentIds.join(',')}&fields=instrumentId,isMarketOpen,symbolFull,lastPrice,closingPrices`;
    const res = await fetch(url, {
      headers: { 'x-api-key': ETORO_API_KEY, 'x-user-key': ETORO_USER_KEY, 'x-request-id': randomUUID() },
    });
    if (res.ok) {
      const data = await res.json();
      const instruments = data?.instruments ?? data ?? [];
      for (const inst of instruments) {
        const lastPrice = inst.lastPrice ?? inst.closingPrices?.official ?? inst.closingPrices?.lastTrading ?? 0;
        map.set(inst.instrumentId, {
          isMarketOpen: inst.isMarketOpen !== false,
          lastPrice,
          symbolFull: inst.symbolFull,
        });
      }
    }
  } catch (e) {
    console.warn('[execute] Market info fetch failed:', (e as Error).message);
  }
  return map;
}

function computeLimitRate(lastPrice: number, isSell: boolean): number {
  if (isSell) return Math.round(lastPrice * (1 - LIMIT_BUFFER) * 100) / 100;
  return Math.round(lastPrice * (1 + LIMIT_BUFFER) * 100) / 100;
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
    const instrumentIds = [...new Set(trades.map(t => t.instrumentId))];
    const marketInfo = await getMarketInfo(instrumentIds);

    const results = [];

    for (const trade of trades) {
      const info = marketInfo.get(trade.instrumentId);
      const isOpen = info?.isMarketOpen ?? true;
      const lastPrice = info?.lastPrice ?? 0;
      const sym = trade.symbol ?? info?.symbolFull ?? `${trade.instrumentId}`;

      try {
        let orderResult: any;
        let orderType: 'market' | 'limit' = 'market';
        let limitRate: number | undefined;

        if (trade.action === 'buy') {
          if (isOpen) {
            const path = executionPath(mode, 'market-open-orders/by-amount');
            console.log(`[execute] BUY (market) ${sym} $${trade.amount} → ${path}`);
            orderResult = await etoroCall('POST', path, {
              InstrumentID: trade.instrumentId,
              IsBuy: true,
              Leverage: 1,
              Amount: trade.amount,
              StopLossRate: null,
              TakeProfitRate: null,
              IsTslEnabled: null,
              IsNoStopLoss: true,
              IsNoTakeProfit: true,
            }, session.accessToken);
          } else {
            orderType = 'limit';
            limitRate = computeLimitRate(lastPrice, false);
            const path = executionPath(mode, 'limit-orders');
            console.log(`[execute] BUY (limit @${limitRate}) ${sym} $${trade.amount} → ${path}`);
            orderResult = await etoroCall('POST', path, {
              InstrumentID: trade.instrumentId,
              IsBuy: true,
              Leverage: 1,
              Amount: trade.amount,
              Rate: limitRate,
              StopLossRate: null,
              TakeProfitRate: null,
              IsTslEnabled: null,
              IsNoStopLoss: true,
              IsNoTakeProfit: true,
            }, session.accessToken);
          }

          const oid = orderResult?.orderId ?? orderResult?.OrderID ?? orderResult?.OrderId;
          results.push({
            instrumentId: trade.instrumentId,
            symbol: sym,
            action: trade.action,
            status: orderType === 'limit' ? 'limit-pending' : 'ok',
            orderType,
            orderId: oid,
            limitRate,
            marketOpen: isOpen,
          });

        } else if (trade.action === 'full-close' || trade.action === 'partial-close') {
          if (!trade.positionId) {
            console.error(`[execute] Missing positionId for ${trade.action} on ${sym}`);
            results.push({
              instrumentId: trade.instrumentId, symbol: sym, action: trade.action,
              status: 'error', error: `Missing positionId — cannot ${trade.action}`,
            });
            continue;
          }

          if (isOpen) {
            const path = executionPath(mode, `market-close-orders/positions/${trade.positionId}`);
            console.log(`[execute] ${trade.action.toUpperCase()} (market) ${sym} pos=${trade.positionId} → ${path}`);
            orderResult = await etoroCall('POST', path, {
              InstrumentId: trade.instrumentId,
              UnitsToDeduct: trade.unitsToDeduct ?? null,
            }, session.accessToken);

            results.push({
              instrumentId: trade.instrumentId, symbol: sym, action: trade.action,
              status: 'ok', orderType: 'market' as const,
              orderId: orderResult?.orderId ?? orderResult?.OrderID ?? orderResult?.OrderId,
              marketOpen: true,
            });
          } else {
            // For closes on closed markets, place a limit sell order
            // eToro doesn't support limit close on existing positions directly —
            // use a limit order to sell the same instrument
            orderType = 'limit';
            limitRate = computeLimitRate(lastPrice, true);
            const path = executionPath(mode, 'limit-orders');
            const units = trade.unitsToDeduct ?? undefined;
            const amount = trade.amount ?? undefined;
            console.log(`[execute] ${trade.action.toUpperCase()} (limit @${limitRate}) ${sym} → ${path}`);
            orderResult = await etoroCall('POST', path, {
              InstrumentID: trade.instrumentId,
              IsBuy: false,
              Leverage: 1,
              Amount: amount ?? null,
              AmountInUnits: units ?? null,
              Rate: limitRate,
              StopLossRate: null,
              TakeProfitRate: null,
              IsTslEnabled: null,
              IsNoStopLoss: true,
              IsNoTakeProfit: true,
            }, session.accessToken);

            const oid = orderResult?.orderId ?? orderResult?.OrderID ?? orderResult?.OrderId;
            results.push({
              instrumentId: trade.instrumentId, symbol: sym, action: trade.action,
              status: 'limit-pending', orderType: 'limit' as const,
              orderId: oid, limitRate, marketOpen: false,
              positionId: trade.positionId,
            });
          }
        }

      } catch (err: any) {
        console.error(`[execute] Trade failed for ${sym}:`, err.message);

        if (err.message?.startsWith('AUTH_EXPIRED')) {
          results.push({ instrumentId: trade.instrumentId, symbol: sym, action: trade.action, status: 'error', error: err.message });
          break;
        }

        results.push({
          instrumentId: trade.instrumentId, symbol: sym, action: trade.action,
          status: 'error', error: err.message,
          marketOpen: info?.isMarketOpen,
        });
      }
    }

    const okCount = results.filter(r => r.status === 'ok').length;
    const limitCount = results.filter(r => r.status === 'limit-pending').length;
    const errCount = results.filter(r => r.status === 'error').length;
    console.log(`[execute] Done: ${okCount} market ok, ${limitCount} limit pending, ${errCount} failed (mode: ${mode})`);

    const response = NextResponse.json({
      results,
      summary: { ok: okCount, limitPending: limitCount, errors: errCount, mode },
    });
    if (newCookie) {
      response.headers.append('Set-Cookie', buildSessionCookie(newCookie));
    }
    return response;

  } catch (e: any) {
    console.error('[execute] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
