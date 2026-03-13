/**
 * /api/policies/[id] — Get, update, or delete a single rebalance policy.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { loadPolicy, savePolicy, deletePolicy } from '@/lib/policy-store';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { getSessionFromCookies } = await import('@/lib/auth');
    const session = getSessionFromCookies(req.headers.get('cookie'));
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const policy = loadPolicy(id);
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    if (policy.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({ policy });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { getSessionFromCookies } = await import('@/lib/auth');
    const session = getSessionFromCookies(req.headers.get('cookie'));
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const policy = loadPolicy(id);
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    if (policy.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updates = await req.json();
    const allowedFields = [
      'targetAllocations', 'optimizationMethod', 'riskLevel', 'mode',
      'schedule', 'driftThreshold', 'accountType', 'maxPositionWeight',
      'slippageTolerance', 'enabled',
    ];

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        (policy as any)[key] = updates[key];
      }
    }

    if (session.refreshToken) {
      policy.refreshToken = session.refreshToken;
    }

    savePolicy(policy);
    return NextResponse.json({ policy });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { getSessionFromCookies } = await import('@/lib/auth');
    const session = getSessionFromCookies(req.headers.get('cookie'));
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const policy = loadPolicy(id);
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    if (policy.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    deletePolicy(id);
    return NextResponse.json({ deleted: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
