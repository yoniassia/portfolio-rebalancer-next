/**
 * /api/policies — List all policies for current user, or create a new one.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  listPoliciesByUser,
  savePolicy,
  generatePolicyId,
  type RebalancePolicy,
} from '@/lib/policy-store';

export async function GET(req: NextRequest) {
  try {
    const { getSessionFromCookies } = await import('@/lib/auth');
    const session = getSessionFromCookies(req.headers.get('cookie'));
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const policies = listPoliciesByUser(session.userId);
    return NextResponse.json({ policies });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { getSessionFromCookies } = await import('@/lib/auth');
    const session = getSessionFromCookies(req.headers.get('cookie'));
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const {
      targetAllocations,
      optimizationMethod = 'equal-weight',
      riskLevel = 3,
      mode = 'scheduled',
      schedule,
      driftThreshold = 0.05,
      accountType = 'demo',
      maxPositionWeight = 25,
      slippageTolerance = 0.5,
    } = body;

    if (!targetAllocations?.length) {
      return NextResponse.json({ error: 'targetAllocations required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const policy: RebalancePolicy = {
      id: generatePolicyId(),
      userId: session.userId,
      username: session.username,
      displayName: session.displayName,
      targetAllocations,
      optimizationMethod,
      riskLevel,
      mode,
      schedule,
      driftThreshold,
      accountType,
      maxPositionWeight,
      slippageTolerance,
      refreshToken: session.refreshToken,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    savePolicy(policy);
    return NextResponse.json({ policy }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
