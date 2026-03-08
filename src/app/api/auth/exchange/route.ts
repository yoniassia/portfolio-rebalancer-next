export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody || !rawBody.code || !rawBody.state) {
      return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
    }

    const { code, state } = rawBody;
    console.log('[auth] Exchange request: code length=', code.length, 'state=', state.substring(0, 8));

    const pkceCookie = req.cookies.get('__rebalancer_pkce')?.value;
    const { exchangeCode, buildSessionCookie } = await import('@/lib/auth');
    const { session, cookie } = await exchangeCode(code, state, pkceCookie);

    console.log('[auth] Exchange SUCCESS! userId=', session.userId, 'username=', session.username);

    const response = NextResponse.json({
      success: true,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: {
        userId: session.userId,
        username: session.username,
        displayName: session.displayName,
      },
    });
    
    // Set session cookie
    response.headers.append('Set-Cookie', buildSessionCookie(cookie));
    // Clear PKCE cookie
    response.headers.append('Set-Cookie', '__rebalancer_pkce=; Path=/; HttpOnly; Secure; Max-Age=0');
    
    return response;
  } catch (e: any) {
    console.error('[auth] Exchange error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
