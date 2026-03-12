export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const BASE = 'https://public-api.etoro.com';

interface TradeRequest {
  action: 'buy' | 'full-close' | 'partial-close';
  instrumentId: number;
  amount?: number;       // for buy
  positionId?: number;   // for close
  unitsToDeduct?: number | null; // for partial-close
  symbol?: string;
}

interface ExecuteBody {
  trades: TradeRequest[];
  accountType: 'real' | 'demo';
}

function makeHeaders(bearerToken: string) {
  // Execution endpoints use Bearer ONLY — mixing with x-api-key/x-user-key causes 422
  return {
    Authorization: `Bearer ${bearerToken}`,
    'x-request-id': randomUUID(),
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
}

async function etoroCall(method: string, path: string, body: any, bearerToken: string) {
  const opts: RequestInit = {
    method,
    headers: makeHeaders(bearerToken),
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`eToro ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
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

    const mode = accountType; // 'demo' | 'real'
    const results = [];

    for (const trade of trades) {
      try {
        let orderResult: any;

        if (trade.action === 'buy') {
          // Open a new position by amount
          orderResult = await etoroCall(
            'POST',
            `/api/v1/trading/execution/${mode}/market-open-orders/by-amount`,
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
            results.push({
              instrumentId: trade.instrumentId,
              symbol: trade.symbol,
              action: trade.action,
              status: 'error',
              error: 'positionId required for close',
            });
            continue;
          }

          orderResult = await etoroCall(
            'POST',
            `/api/v1/trading/execution/${mode}/market-close-orders/positions/${trade.positionId}`,
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
        console.error(`[execute] Trade failed for instrument ${trade.instrumentId}:`, err.message);
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
    console.log(`[execute] ${okCount} ok, ${errCount} failed (mode: ${mode})`);

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
