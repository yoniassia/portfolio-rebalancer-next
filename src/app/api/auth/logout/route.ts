export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true });
    response.headers.append('Set-Cookie', 'rebalancer_session=; Path=/; HttpOnly; Secure; Max-Age=0');
    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
