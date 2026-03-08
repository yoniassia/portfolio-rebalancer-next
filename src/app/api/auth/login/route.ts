export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { getAuthorizationUrl, isSSOConfigured } = await import('@/lib/auth');
    if (!isSSOConfigured()) return NextResponse.json({ error: 'SSO not configured' }, { status: 503 });
    const { url, pkceCookie } = getAuthorizationUrl();
    const response = NextResponse.redirect(url);
    response.headers.append('Set-Cookie', `__rebalancer_pkce=${pkceCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
