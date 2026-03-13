export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDbStats, getTrackedInstruments, getCachedMatrix, buildCacheKey } from '@/lib/returns-db';

const ADMIN_KEY = process.env.ADMIN_KEY || 'rebalancer-admin-2026';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = getDbStats();
    const instruments = getTrackedInstruments();
    const now = Date.now();

    const staleThresholdHours = 48;
    const staleInstruments = instruments.filter(i => {
      if (!i.lastUpdated) return true;
      return (now - new Date(i.lastUpdated).getTime()) / 3600_000 > staleThresholdHours;
    });

    const neverUpdated = instruments.filter(i => !i.lastUpdated);

    const byType: Record<string, number> = {};
    const byTypeWithData: Record<string, number> = {};
    for (const i of instruments) {
      const type = i.isCrypto ? 'Crypto' : i.instrumentTypeId === 5 ? 'Stock' : `Type ${i.instrumentTypeId}`;
      byType[type] = (byType[type] || 0) + 1;
      if (i.lastUpdated) byTypeWithData[type] = (byTypeWithData[type] || 0) + 1;
    }

    const recentlyUpdated = instruments
      .filter(i => i.lastUpdated)
      .sort((a, b) => new Date(b.lastUpdated!).getTime() - new Date(a.lastUpdated!).getTime())
      .slice(0, 10)
      .map(i => ({
        id: i.instrumentId,
        symbol: i.symbol,
        type: i.isCrypto ? 'Crypto' : 'Stock',
        lastUpdated: i.lastUpdated,
        hoursAgo: Math.round((now - new Date(i.lastUpdated!).getTime()) / 3600_000 * 10) / 10,
      }));

    const topStale = staleInstruments
      .sort((a, b) => {
        if (!a.lastUpdated) return -1;
        if (!b.lastUpdated) return 1;
        return new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime();
      })
      .slice(0, 10)
      .map(i => ({
        id: i.instrumentId,
        symbol: i.symbol,
        type: i.isCrypto ? 'Crypto' : 'Stock',
        lastUpdated: i.lastUpdated || null,
      }));

    const withData = instruments.filter(i => i.lastUpdated).length;
    const coveragePct = instruments.length > 0 ? Math.round(withData / instruments.length * 1000) / 10 : 0;

    const instrumentList = instruments.map(i => ({
      id: i.instrumentId,
      symbol: i.symbol,
      displayName: i.displayName,
      type: i.isCrypto ? 'Crypto' : 'Stock',
      typeId: i.instrumentTypeId,
      crypto: i.isCrypto,
      lastUpdated: i.lastUpdated || null,
      stale: !i.lastUpdated || (now - new Date(i.lastUpdated).getTime()) / 3600_000 > staleThresholdHours,
    }));

    return NextResponse.json({
      ...stats,
      coverage: {
        total: instruments.length,
        withData,
        coveragePct,
        stale: staleInstruments.length,
        neverUpdated: neverUpdated.length,
      },
      byType,
      byTypeWithData,
      recentlyUpdated,
      topStale,
      instrumentList,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Stats unavailable',
    }, { status: 500 });
  }
}
