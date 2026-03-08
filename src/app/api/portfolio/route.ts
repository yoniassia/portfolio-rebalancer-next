export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  try {
    const { getSessionFromCookies, ensureFreshSession } = await import('@/lib/auth');
    
    // Get and refresh session if needed
    const sessionResult = await ensureFreshSession(req.headers.get('cookie'));
    
    if (!sessionResult) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { session, newCookie } = sessionResult;

    // Fetch portfolio from eToro API using Bearer token
    const portfolioRes = await fetch('https://public-api.etoro.com/api/v1/portfolio', {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'x-request-id': randomUUID(), // CRITICAL — must be valid UUID
        'Content-Type': 'application/json',
      },
    });

    if (!portfolioRes.ok) {
      const errorText = await portfolioRes.text();
      console.error('[portfolio] eToro API error:', portfolioRes.status, errorText);
      return NextResponse.json({ 
        error: `eToro API error: ${portfolioRes.status}`,
        details: errorText 
      }, { status: portfolioRes.status });
    }

    const portfolio = await portfolioRes.json();

    const response = NextResponse.json(portfolio);
    
    // If we refreshed the token, update the cookie
    if (newCookie) {
      const { buildSessionCookie } = await import('@/lib/auth');
      response.headers.append('Set-Cookie', buildSessionCookie(newCookie));
    }

    return response;
  } catch (e: any) {
    console.error('[portfolio] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
