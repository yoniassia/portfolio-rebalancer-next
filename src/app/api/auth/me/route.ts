export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { getSessionFromCookies } = await import('@/lib/auth');
    const session = getSessionFromCookies(req.headers.get('cookie'));
    
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        userId: session.userId,
        username: session.username,
        displayName: session.displayName,
        profile: session.profile,
      },
      expiresAt: session.expiresAt,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
