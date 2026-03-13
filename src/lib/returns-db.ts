/**
 * SQLite-backed storage for daily prices, returns, and pre-computed matrices.
 * Uses better-sqlite3 for synchronous, fast access in Next.js API routes.
 */
import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), '.rebalancer-data', 'returns.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const { mkdirSync } = require('fs');
  mkdirSync(join(process.cwd(), '.rebalancer-data'), { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('cache_size = -64000'); // 64MB cache
  _db.pragma('temp_store = MEMORY');

  migrate(_db);
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS instruments (
      instrument_id   INTEGER PRIMARY KEY,
      symbol          TEXT NOT NULL,
      display_name    TEXT,
      instrument_type_id INTEGER DEFAULT 5,
      is_crypto       INTEGER DEFAULT 0,
      trading_days    INTEGER DEFAULT 252,
      tracked         INTEGER DEFAULT 1,
      first_tracked   TEXT,
      last_updated    TEXT,
      fetch_failures  INTEGER DEFAULT 0,
      last_error      TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_prices (
      instrument_id   INTEGER NOT NULL,
      date            TEXT NOT NULL,
      close           REAL NOT NULL,
      PRIMARY KEY (instrument_id, date)
    );

    CREATE TABLE IF NOT EXISTS daily_returns (
      instrument_id   INTEGER NOT NULL,
      date            TEXT NOT NULL,
      log_return      REAL NOT NULL,
      PRIMARY KEY (instrument_id, date)
    );

    CREATE TABLE IF NOT EXISTS matrix_cache (
      cache_key           TEXT PRIMARY KEY,
      instrument_ids      TEXT NOT NULL,
      symbols             TEXT NOT NULL,
      lookback_days       INTEGER NOT NULL,
      data_points         INTEGER NOT NULL,
      covariance_matrix   TEXT NOT NULL,
      correlation_matrix  TEXT NOT NULL,
      mean_returns        TEXT NOT NULL,
      volatilities        TEXT NOT NULL,
      trading_days_arr    TEXT NOT NULL,
      computed_at         TEXT NOT NULL,
      expires_at          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prices_instrument ON daily_prices(instrument_id);
    CREATE INDEX IF NOT EXISTS idx_prices_date ON daily_prices(date);
    CREATE INDEX IF NOT EXISTS idx_returns_instrument ON daily_returns(instrument_id);
    CREATE INDEX IF NOT EXISTS idx_returns_date ON daily_returns(date);
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON matrix_cache(expires_at);
  `);

  // Migration: add failure tracking columns if missing (existing DBs)
  try {
    db.exec('ALTER TABLE instruments ADD COLUMN fetch_failures INTEGER DEFAULT 0');
  } catch { /* column already exists */ }
  try {
    db.exec('ALTER TABLE instruments ADD COLUMN last_error TEXT');
  } catch { /* column already exists */ }
}

// ── Instrument Management ──────────────────────────────────

export interface TrackedInstrument {
  instrumentId: number;
  symbol: string;
  displayName?: string;
  instrumentTypeId: number;
  isCrypto: boolean;
  tradingDays: number;
  tracked: boolean;
  lastUpdated?: string;
  fetchFailures: number;
  lastError?: string;
}

const CRYPTO_TYPE_IDS = new Set([11, 12, 100]);

export function upsertInstrument(inst: {
  instrumentId: number;
  symbol: string;
  displayName?: string;
  instrumentTypeId?: number;
}): void {
  const db = getDb();
  const typeId = inst.instrumentTypeId ?? 5;
  const isCrypto = CRYPTO_TYPE_IDS.has(typeId) ? 1 : 0;
  const tradingDays = isCrypto ? 365 : 252;

  db.prepare(`
    INSERT INTO instruments (instrument_id, symbol, display_name, instrument_type_id, is_crypto, trading_days, tracked, first_tracked)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(instrument_id) DO UPDATE SET
      symbol = excluded.symbol,
      display_name = COALESCE(excluded.display_name, display_name),
      instrument_type_id = excluded.instrument_type_id,
      is_crypto = excluded.is_crypto,
      trading_days = excluded.trading_days,
      tracked = 1
  `).run(inst.instrumentId, inst.symbol, inst.displayName ?? null, typeId, isCrypto, tradingDays, new Date().toISOString());
}

export function upsertInstruments(instruments: Array<{
  instrumentId: number;
  symbol: string;
  displayName?: string;
  instrumentTypeId?: number;
}>): void {
  const db = getDb();
  const txn = db.transaction(() => {
    for (const inst of instruments) upsertInstrument(inst);
  });
  txn();
}

export function getTrackedInstruments(): TrackedInstrument[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM instruments WHERE tracked = 1').all() as any[];
  return rows.map(r => ({
    instrumentId: r.instrument_id,
    symbol: r.symbol,
    displayName: r.display_name,
    instrumentTypeId: r.instrument_type_id,
    isCrypto: r.is_crypto === 1,
    tradingDays: r.trading_days,
    tracked: r.tracked === 1,
    lastUpdated: r.last_updated,
    fetchFailures: r.fetch_failures ?? 0,
    lastError: r.last_error,
  }));
}

export function getLastPriceDate(instrumentId: number): string | null {
  const db = getDb();
  const row = db.prepare('SELECT MAX(date) as last_date FROM daily_prices WHERE instrument_id = ?').get(instrumentId) as any;
  return row?.last_date ?? null;
}

// ── Price & Return Storage ──────────────────────────────────

export function bulkInsertPrices(instrumentId: number, prices: Array<{ date: string; close: number }>): number {
  const db = getDb();
  let inserted = 0;
  const stmt = db.prepare('INSERT OR IGNORE INTO daily_prices (instrument_id, date, close) VALUES (?, ?, ?)');
  const txn = db.transaction(() => {
    for (const p of prices) {
      const info = stmt.run(instrumentId, p.date, p.close);
      inserted += info.changes;
    }
    db.prepare('UPDATE instruments SET last_updated = ? WHERE instrument_id = ?')
      .run(new Date().toISOString(), instrumentId);
  });
  txn();
  return inserted;
}

export function computeAndStoreReturns(instrumentId: number): number {
  const db = getDb();

  const lastReturnDate = (db.prepare('SELECT MAX(date) as d FROM daily_returns WHERE instrument_id = ?').get(instrumentId) as any)?.d;

  let query = 'SELECT date, close FROM daily_prices WHERE instrument_id = ? ORDER BY date ASC';
  const params: any[] = [instrumentId];

  if (lastReturnDate) {
    const priorDate = db.prepare(
      'SELECT MAX(date) as d FROM daily_prices WHERE instrument_id = ? AND date <= ?'
    ).get(instrumentId, lastReturnDate) as any;

    if (priorDate?.d) {
      query = 'SELECT date, close FROM daily_prices WHERE instrument_id = ? AND date >= ? ORDER BY date ASC';
      params.push(priorDate.d);
    }
  }

  const prices = db.prepare(query).all(...params) as Array<{ date: string; close: number }>;
  if (prices.length < 2) return 0;

  let inserted = 0;
  const stmt = db.prepare('INSERT OR IGNORE INTO daily_returns (instrument_id, date, log_return) VALUES (?, ?, ?)');

  const txn = db.transaction(() => {
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1]!.close;
      const curr = prices[i]!.close;
      if (prev > 0 && curr > 0) {
        const logReturn = Math.log(curr / prev);
        const info = stmt.run(instrumentId, prices[i]!.date, logReturn);
        inserted += info.changes;
      }
    }
  });
  txn();
  return inserted;
}

// ── Return Series Queries ──────────────────────────────────

export interface AlignedReturns {
  instrumentIds: number[];
  symbols: string[];
  tradingDays: number[];
  dates: string[];
  returns: number[][];  // [asset][day]
  dataPoints: number;
  missingInstruments: string[];
}

export function getAlignedReturns(
  instrumentIds: number[],
  lookbackDays: number = 252,
): AlignedReturns {
  const db = getDb();
  const cutoffDate = getCutoffDate(lookbackDays);
  const missingInstruments: string[] = [];

  // Get instrument metadata
  const instruments = new Map<number, { symbol: string; tradingDays: number }>();
  for (const id of instrumentIds) {
    const row = db.prepare('SELECT symbol, trading_days FROM instruments WHERE instrument_id = ?').get(id) as any;
    if (row) {
      instruments.set(id, { symbol: row.symbol, tradingDays: row.trading_days });
    }
  }

  // Find common dates — only instruments that have data
  const validIds: number[] = [];
  const dateSets: Set<string>[] = [];

  for (const id of instrumentIds) {
    const dates = db.prepare(
      'SELECT DISTINCT date FROM daily_returns WHERE instrument_id = ? AND date >= ? ORDER BY date'
    ).all(id, cutoffDate) as Array<{ date: string }>;

    if (dates.length < 30) {
      const sym = instruments.get(id)?.symbol ?? `${id}`;
      missingInstruments.push(sym);
      continue;
    }

    validIds.push(id);
    dateSets.push(new Set(dates.map(d => d.date)));
  }

  if (validIds.length < 2) {
    return {
      instrumentIds: validIds,
      symbols: validIds.map(id => instruments.get(id)?.symbol ?? `${id}`),
      tradingDays: validIds.map(id => instruments.get(id)?.tradingDays ?? 252),
      dates: [],
      returns: [],
      dataPoints: 0,
      missingInstruments,
    };
  }

  // Intersect all date sets
  let commonDates = [...dateSets[0]!];
  for (let i = 1; i < dateSets.length; i++) {
    commonDates = commonDates.filter(d => dateSets[i]!.has(d));
  }
  commonDates.sort();

  // Fetch aligned returns
  const dateSet = new Set(commonDates);
  const returns: number[][] = [];

  for (const id of validIds) {
    const rows = db.prepare(
      'SELECT date, log_return FROM daily_returns WHERE instrument_id = ? AND date >= ? ORDER BY date'
    ).all(id, cutoffDate) as Array<{ date: string; log_return: number }>;

    const aligned = rows.filter(r => dateSet.has(r.date)).map(r => r.log_return);
    returns.push(aligned);
  }

  return {
    instrumentIds: validIds,
    symbols: validIds.map(id => instruments.get(id)?.symbol ?? `${id}`),
    tradingDays: validIds.map(id => instruments.get(id)?.tradingDays ?? 252),
    dates: commonDates,
    returns,
    dataPoints: commonDates.length,
    missingInstruments,
  };
}

function getCutoffDate(lookbackDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.ceil(lookbackDays * 1.5)); // buffer for weekends/holidays
  return d.toISOString().slice(0, 10);
}

// ── Matrix Cache ──────────────────────────────────────────

export interface CachedMatrix {
  instrumentIds: number[];
  symbols: string[];
  lookbackDays: number;
  dataPoints: number;
  covarianceMatrix: number[][];
  correlationMatrix: number[][];
  meanReturns: number[];
  volatilities: number[];
  tradingDays: number[];
  computedAt: string;
}

export function buildCacheKey(instrumentIds: number[], lookbackDays: number): string {
  const sorted = [...instrumentIds].sort((a, b) => a - b);
  return `mtx_${lookbackDays}_${sorted.join(',')}`;
}

export function getCachedMatrix(instrumentIds: number[], lookbackDays: number): CachedMatrix | null {
  const db = getDb();
  const key = buildCacheKey(instrumentIds, lookbackDays);
  const now = new Date().toISOString();

  const row = db.prepare(
    'SELECT * FROM matrix_cache WHERE cache_key = ? AND expires_at > ?'
  ).get(key, now) as any;

  if (!row) return null;

  return {
    instrumentIds: JSON.parse(row.instrument_ids),
    symbols: JSON.parse(row.symbols),
    lookbackDays: row.lookback_days,
    dataPoints: row.data_points,
    covarianceMatrix: JSON.parse(row.covariance_matrix),
    correlationMatrix: JSON.parse(row.correlation_matrix),
    meanReturns: JSON.parse(row.mean_returns),
    volatilities: JSON.parse(row.volatilities),
    tradingDays: JSON.parse(row.trading_days_arr),
    computedAt: row.computed_at,
  };
}

export function saveCachedMatrix(
  instrumentIds: number[],
  symbols: string[],
  lookbackDays: number,
  data: {
    dataPoints: number;
    covarianceMatrix: number[][];
    correlationMatrix: number[][];
    meanReturns: number[];
    volatilities: number[];
    tradingDays: number[];
  },
  ttlHours: number = 24,
): void {
  const db = getDb();
  const key = buildCacheKey(instrumentIds, lookbackDays);
  const now = new Date();
  const expires = new Date(now.getTime() + ttlHours * 3600_000);

  db.prepare(`
    INSERT OR REPLACE INTO matrix_cache
    (cache_key, instrument_ids, symbols, lookback_days, data_points,
     covariance_matrix, correlation_matrix, mean_returns, volatilities,
     trading_days_arr, computed_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    key,
    JSON.stringify([...instrumentIds].sort((a, b) => a - b)),
    JSON.stringify(symbols),
    lookbackDays,
    data.dataPoints,
    JSON.stringify(data.covarianceMatrix),
    JSON.stringify(data.correlationMatrix),
    JSON.stringify(data.meanReturns),
    JSON.stringify(data.volatilities),
    JSON.stringify(data.tradingDays),
    now.toISOString(),
    expires.toISOString(),
  );
}

export function invalidateCache(instrumentIds?: number[]): number {
  const db = getDb();
  if (!instrumentIds) {
    return db.prepare('DELETE FROM matrix_cache').run().changes;
  }
  // Invalidate any cache that contains any of the given instruments
  let deleted = 0;
  const rows = db.prepare('SELECT cache_key, instrument_ids FROM matrix_cache').all() as any[];
  for (const row of rows) {
    const ids: number[] = JSON.parse(row.instrument_ids);
    if (ids.some(id => instrumentIds.includes(id))) {
      db.prepare('DELETE FROM matrix_cache WHERE cache_key = ?').run(row.cache_key);
      deleted++;
    }
  }
  return deleted;
}

export function pruneExpiredCache(): number {
  const db = getDb();
  return db.prepare('DELETE FROM matrix_cache WHERE expires_at < ?').run(new Date().toISOString()).changes;
}

// ── Failure Tracking ──────────────────────────────────────

const MAX_FAILURES = 3;

export function recordFetchFailure(instrumentId: number, error: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE instruments SET
      fetch_failures = COALESCE(fetch_failures, 0) + 1,
      last_error = ?
    WHERE instrument_id = ?
  `).run(error, instrumentId);
}

export function resetFetchFailures(instrumentId: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE instruments SET fetch_failures = 0, last_error = NULL
    WHERE instrument_id = ?
  `).run(instrumentId);
}

export function autoDisableFailedInstruments(): number {
  const db = getDb();
  return db.prepare(`
    UPDATE instruments SET tracked = 0
    WHERE fetch_failures >= ? AND tracked = 1
  `).run(MAX_FAILURES).changes;
}

export function getFetchableInstruments(): TrackedInstrument[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM instruments WHERE tracked = 1 AND COALESCE(fetch_failures, 0) < ?'
  ).all(MAX_FAILURES) as any[];
  return rows.map(r => ({
    instrumentId: r.instrument_id,
    symbol: r.symbol,
    displayName: r.display_name,
    instrumentTypeId: r.instrument_type_id,
    isCrypto: r.is_crypto === 1,
    tradingDays: r.trading_days,
    tracked: r.tracked === 1,
    lastUpdated: r.last_updated,
    fetchFailures: r.fetch_failures ?? 0,
    lastError: r.last_error,
  }));
}

// ── Stats ──────────────────────────────────────────────────

export function getDbStats(): {
  instruments: number;
  trackedInstruments: number;
  priceRows: number;
  returnRows: number;
  cachedMatrices: number;
  oldestPrice: string | null;
  newestPrice: string | null;
} {
  const db = getDb();
  const instruments = (db.prepare('SELECT COUNT(*) as c FROM instruments').get() as any).c;
  const tracked = (db.prepare('SELECT COUNT(*) as c FROM instruments WHERE tracked = 1').get() as any).c;
  const prices = (db.prepare('SELECT COUNT(*) as c FROM daily_prices').get() as any).c;
  const returns = (db.prepare('SELECT COUNT(*) as c FROM daily_returns').get() as any).c;
  const cached = (db.prepare('SELECT COUNT(*) as c FROM matrix_cache WHERE expires_at > ?').get(new Date().toISOString()) as any).c;
  const oldest = (db.prepare('SELECT MIN(date) as d FROM daily_prices').get() as any)?.d ?? null;
  const newest = (db.prepare('SELECT MAX(date) as d FROM daily_prices').get() as any)?.d ?? null;

  return {
    instruments,
    trackedInstruments: tracked,
    priceRows: prices,
    returnRows: returns,
    cachedMatrices: cached,
    oldestPrice: oldest,
    newestPrice: newest,
  };
}
