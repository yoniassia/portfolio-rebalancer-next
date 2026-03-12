export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const BASE = 'https://public-api.etoro.com';

type Mode = 'real' | 'demo';

function infoPath(mode: Mode, endpoint: string): string {
  return `/api/v1/trading/info/${mode}/${endpoint}`;
}

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

// GET /api/order-status?orderIds=123,456&accountType=real
export async function GET(req: NextRequest) {
  try {
    const { ensureFreshSession, buildSessionCookie } = await import('@/lib/auth');
    const sessionResult = await ensureFreshSession(req.headers.get('cookie'));
    if (!sessionResult) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { session, newCookie } = sessionResult;
    const params = req.nextUrl.searchParams;
    const orderIds = (params.get('orderIds') || '').split(',').map(Number).filter(Boolean);
    const mode = (params.get('accountType') || 'real') as Mode;

    if (!orderIds.length) {
      return NextResponse.json({ error: 'No orderIds' }, { status: 400 });
    }

    const statuses = [];
    for (const orderId of orderIds) {
      try {
        const path = infoPath(mode, `orders/${orderId}`);
        const url = `${BASE}${path}`;
        console.log(`[order-status] GET ${url}`);
        const res = await fetch(url, { headers: makeHeaders(session.accessToken) });
        const text = await res.text();
        if (res.ok) {
          const data = text ? JSON.parse(text) : {};
          statuses.push({
            orderId,
            status: data.StatusId ?? data.statusId ?? data.Status ?? data.status ?? 'unknown',
            isFilled: data.IsFilled ?? data.isFilled ?? false,
            isCancelled: data.IsCancelled ?? data.isCancelled ?? false,
            isPending: data.IsPending ?? data.isPending ?? false,
            executedAmount: data.ExecutedAmount ?? data.executedAmount ?? null,
            executedRate: data.ExecutedRate ?? data.executedRate ?? null,
            raw: data,
          });
        } else {
          console.warn(`[order-status] ${orderId} → ${res.status}: ${text.slice(0, 200)}`);
          statuses.push({ orderId, status: 'error', error: `${res.status}: ${text.slice(0, 200)}` });
        }
      } catch (e: any) {
        statuses.push({ orderId, status: 'error', error: e.message });
      }
    }

    const response = NextResponse.json({ statuses });
    if (newCookie) {
      response.headers.append('Set-Cookie', buildSessionCookie(newCookie));
    }
    return response;
  } catch (e: any) {
    console.error('[order-status] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/order-status — cancel a limit order
export async function DELETE(req: NextRequest) {
  try {
    const { ensureFreshSession, buildSessionCookie } = await import('@/lib/auth');
    const sessionResult = await ensureFreshSession(req.headers.get('cookie'));
    if (!sessionResult) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { session, newCookie } = sessionResult;
    const { orderId, accountType = 'real' } = await req.json();
    const mode = accountType as Mode;

    const path = executionPath(mode, `limit-orders/${orderId}`);
    const url = `${BASE}${path}`;
    console.log(`[order-status] DELETE ${url}`);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: makeHeaders(session.accessToken),
    });
    const text = await res.text();

    if (res.ok) {
      console.log(`[order-status] ✅ Cancelled ${orderId}`);
      const response = NextResponse.json({ orderId, cancelled: true });
      if (newCookie) response.headers.append('Set-Cookie', buildSessionCookie(newCookie));
      return response;
    }

    console.error(`[order-status] ❌ Cancel ${orderId} → ${res.status}: ${text.slice(0, 200)}`);
    const response = NextResponse.json({ orderId, cancelled: false, error: `${res.status}: ${text.slice(0, 200)}` });
    if (newCookie) response.headers.append('Set-Cookie', buildSessionCookie(newCookie));
    return response;
  } catch (e: any) {
    console.error('[order-status] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
