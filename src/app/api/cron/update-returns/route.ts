/**
 * /api/cron/update-returns — Batch job to update return series and pre-compute matrices.
 *
 * Pipeline:
 * 1. Fetch latest candle data for stale instruments (batched with delays to avoid 429s)
 * 2. Compute and store log returns
 * 3. Pre-compute covariance/correlation matrices for all active policy instrument sets
 *
 * Protected by admin key. Runs every 10 minutes via cron.
 * Smart staleness: only fetches instruments not updated in the last STALE_HOURS.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getTrackedInstruments,
  getFetchableInstruments,
  upsertInstruments,
  bulkInsertPrices,
  computeAndStoreReturns,
  getLastPriceDate,
  getDbStats,
  invalidateCache,
  pruneExpiredCache,
  recordFetchFailure,
  resetFetchFailures,
  autoDisableFailedInstruments,
} from '@/lib/returns-db';
import { forceComputeAndCache } from '@/lib/matrix-cache';

const ADMIN_KEY = process.env.ADMIN_KEY || 'rebalancer-admin-2026';
const ETORO_BASE = 'https://public-api.etoro.com/api/v1';
const ETORO_API_KEY = process.env.ETORO_API_KEY || '';
const ETORO_USER_KEY = process.env.ETORO_USER_KEY || '';

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 3000;
const STALE_HOURS = 12;
const PER_RUN_LIMIT = 30;

interface CandlePoint {
  date: string;
  close: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCandlesWithRetry(instrumentId: number, days: number): Promise<CandlePoint[]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(
      `${ETORO_BASE}/market-data/instruments/${instrumentId}/history/candles/desc/OneDay/${days}`,
      {
        headers: {
          'x-api-key': ETORO_API_KEY,
          'x-user-key': ETORO_USER_KEY,
          'x-request-id': randomUUID(),
        },
      },
    );

    if (res.status === 429) {
      if (attempt === MAX_RETRIES) throw new Error('429 rate limit after max retries');
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : RETRY_BASE_MS * Math.pow(2, attempt);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) throw new Error(`Candle fetch failed: ${res.status}`);

    const data = await res.json();
    const candles = data?.candles?.[0]?.candles ?? data?.candles ?? [];
    return candles
      .map((c: any) => ({
        date: String(c.fromDate ?? c.date ?? '').slice(0, 10),
        close: typeof c.close === 'number' ? c.close : 0,
      }))
      .filter((c: CandlePoint) => c.date.length === 10 && c.close > 0);
  }
  return [];
}

function isStale(lastUpdated: string | undefined): boolean {
  if (!lastUpdated) return true;
  const age = Date.now() - new Date(lastUpdated).getTime();
  return age > STALE_HOURS * 3600_000;
}

async function processBatch<T>(
  items: T[],
  batchSize: number,
  delayMs: number,
  worker: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map((item, j) => worker(item, i + j)));
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
}

function getPolicyInstrumentSets(): number[][] {
  try {
    const { listActivePolicies } = require('@/lib/policy-store');
    const policies = listActivePolicies();
    const sets: number[][] = [];
    for (const policy of policies) {
      const ids = (policy.targetAllocations ?? [])
        .map((t: any) => t.instrumentId)
        .filter((id: any) => typeof id === 'number' && id > 0);
      if (ids.length >= 2) sets.push(ids);
    }
    return sets;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const seedMode = req.nextUrl.searchParams.get('seed') === 'true';
  const startTime = Date.now();
  const log: string[] = [];

  try {
    // Phase 0: If seed mode, discover all instruments from eToro search
    if (seedMode) {
      log.push('Seed mode: discovering instruments from eToro...');
      try {
        const searchRes = await fetch(`${ETORO_BASE}/market-data/search?query=*&pageSize=500`, {
          headers: {
            'x-api-key': ETORO_API_KEY,
            'x-user-key': ETORO_USER_KEY,
            'x-request-id': randomUUID(),
          },
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const items = searchData?.items ?? searchData?.instruments ?? [];
          const instruments = items
            .filter((i: any) => {
              const id = i.instrumentId ?? i.instrumentID;
              return id && id > 0 && i.isCurrentlyTradable !== false && i.isHiddenFromClient !== true;
            })
            .map((i: any) => ({
              instrumentId: i.instrumentId ?? i.instrumentID,
              symbol: i.symbolFull ?? i.internalSymbolFull ?? `${i.instrumentId ?? i.instrumentID}`,
              displayName: i.instrumentDisplayName ?? i.displayname ?? i.displayName,
              instrumentTypeId: i.instrumentTypeID ?? i.instrumentTypeId ?? i.internalAssetClassId ?? 5,
            }));
          upsertInstruments(instruments);
          log.push(`Registered ${instruments.length} instruments from eToro catalog`);
        }
      } catch (e: any) {
        log.push(`Seed discovery failed: ${e.message}`);
      }
    }

    // Phase 1: Get tracked instruments
    const instruments = getTrackedInstruments();
    log.push(`Tracked instruments: ${instruments.length}`);

    if (instruments.length === 0) {
      return NextResponse.json({
        status: 'no-instruments',
        log,
        hint: 'Run with ?seed=true to discover and register all eToro instruments',
        elapsed: Date.now() - startTime,
      });
    }

    // Phase 1b: Auto-disable instruments with >= 3 consecutive failures
    const disabled = autoDisableFailedInstruments();
    if (disabled > 0) log.push(`Auto-disabled ${disabled} instruments with repeated fetch failures`);

    // Phase 2: Filter to stale + fetchable instruments (skip failures + recently updated)
    const fetchable = seedMode ? instruments : getFetchableInstruments();
    const staleInstruments = fetchable.filter(inst => seedMode || isStale(inst.lastUpdated));

    const toFetch = staleInstruments.slice(0, PER_RUN_LIMIT);

    log.push(`Total tracked: ${instruments.length} | Stale: ${staleInstruments.length} | Fetching this run: ${toFetch.length} (limit ${PER_RUN_LIMIT})`);

    if (toFetch.length === 0) {
      const stats = getDbStats();
      return NextResponse.json({
        status: 'ok',
        message: 'All instruments up to date — nothing to fetch',
        elapsed: Date.now() - startTime,
        stats,
        log,
      });
    }

    // Phase 3: Fetch candles in throttled batches (BATCH_SIZE at a time, BATCH_DELAY_MS between)
    log.push(`Fetching candles: ${BATCH_SIZE} concurrent, ${BATCH_DELAY_MS}ms between batches...`);
    let totalNewPrices = 0;
    let totalNewReturns = 0;
    let fetchErrors = 0;

    interface FetchResult {
      symbol: string;
      candles: number;
      newPrices: number;
      newReturns: number;
      error: string | null;
    }

    const results: FetchResult[] = new Array(toFetch.length);

    await processBatch(toFetch, BATCH_SIZE, BATCH_DELAY_MS, async (inst, idx) => {
      try {
        const lastDate = getLastPriceDate(inst.instrumentId);
        let daysToFetch = 756;

        if (lastDate) {
          const daysSince = Math.ceil((Date.now() - new Date(lastDate).getTime()) / 86400000);
          daysToFetch = Math.max(5, daysSince + 3);
        }

        const candles = await fetchCandlesWithRetry(inst.instrumentId, daysToFetch);

        if (candles.length === 0) {
          recordFetchFailure(inst.instrumentId, 'Empty candle response');
          results[idx] = { symbol: inst.symbol, candles: 0, newPrices: 0, newReturns: 0, error: 'Empty response (failure tracked)' };
          return;
        }

        const newPrices = bulkInsertPrices(inst.instrumentId, candles);
        const newReturns = computeAndStoreReturns(inst.instrumentId);
        resetFetchFailures(inst.instrumentId);

        results[idx] = { symbol: inst.symbol, candles: candles.length, newPrices, newReturns, error: null };
      } catch (e: any) {
        recordFetchFailure(inst.instrumentId, e.message);
        results[idx] = { symbol: inst.symbol, candles: 0, newPrices: 0, newReturns: 0, error: `${e.message} (failure tracked)` };
      }
    });

    for (const r of results) {
      if (!r) continue;
      if (r.error) {
        fetchErrors++;
        log.push(`  ✗ ${r.symbol}: ${r.error}`);
      } else if (r.newPrices > 0 || r.newReturns > 0) {
        totalNewPrices += r.newPrices;
        totalNewReturns += r.newReturns;
        log.push(`  ✓ ${r.symbol}: +${r.newPrices} prices, +${r.newReturns} returns`);
      }
    }

    log.push(`Prices: ${totalNewPrices} new rows | Returns: ${totalNewReturns} new rows | Errors: ${fetchErrors}`);

    // Phase 4: Invalidate stale caches for updated instruments
    const updatedIds = results.filter(r => r?.newPrices && r.newPrices > 0).map(r => {
      const inst = toFetch.find(i => i.symbol === r.symbol);
      return inst?.instrumentId;
    }).filter(Boolean) as number[];

    if (updatedIds.length > 0) {
      const invalidated = invalidateCache(updatedIds);
      log.push(`Invalidated ${invalidated} stale matrix caches`);
    }

    // Phase 5: Pre-compute matrices for active policy instrument sets
    const policySets = getPolicyInstrumentSets();
    let matricesComputed = 0;

    if (policySets.length > 0) {
      log.push(`Pre-computing matrices for ${policySets.length} active policies...`);

      for (const ids of policySets) {
        try {
          const result = forceComputeAndCache(ids, 252);
          if (result) {
            matricesComputed++;
            log.push(`  ✓ Matrix for ${result.symbols.join(',')} — ${result.dataPoints} data points`);
          } else {
            log.push(`  ✗ Insufficient data for instrument set [${ids.join(',')}]`);
          }
        } catch (e: any) {
          log.push(`  ✗ Matrix computation failed: ${e.message}`);
        }
      }
    }

    // Phase 6: Cleanup
    const pruned = pruneExpiredCache();
    if (pruned > 0) log.push(`Pruned ${pruned} expired cache entries`);

    const stats = getDbStats();
    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      status: 'ok',
      elapsed,
      summary: {
        totalTracked: instruments.length,
        fetchableInstruments: fetchable.length,
        autoDisabled: disabled,
        staleFound: staleInstruments.length,
        fetchedThisRun: toFetch.length,
        newPrices: totalNewPrices,
        newReturns: totalNewReturns,
        fetchErrors,
        matricesComputed,
        prunedCaches: pruned,
        remainingStale: Math.max(0, staleInstruments.length - PER_RUN_LIMIT),
      },
      stats,
      log,
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      error: error.message,
      log,
      elapsed: Date.now() - startTime,
    }, { status: 500 });
  }
}
