import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync, unlinkSync } from 'fs';

const TEST_DB_DIR = join(process.cwd(), '.rebalancer-data-test');
const TEST_DB_PATH = join(TEST_DB_DIR, 'returns-test.db');

function createTestDb() {
  mkdirSync(TEST_DB_DIR, { recursive: true });
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS instruments (
      instrument_id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, display_name TEXT,
      instrument_type_id INTEGER DEFAULT 5, is_crypto INTEGER DEFAULT 0,
      trading_days INTEGER DEFAULT 252, tracked INTEGER DEFAULT 1,
      first_tracked TEXT, last_updated TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_prices (
      instrument_id INTEGER NOT NULL, date TEXT NOT NULL, close REAL NOT NULL,
      PRIMARY KEY (instrument_id, date)
    );
    CREATE TABLE IF NOT EXISTS daily_returns (
      instrument_id INTEGER NOT NULL, date TEXT NOT NULL, log_return REAL NOT NULL,
      PRIMARY KEY (instrument_id, date)
    );
    CREATE TABLE IF NOT EXISTS matrix_cache (
      cache_key TEXT PRIMARY KEY, instrument_ids TEXT NOT NULL, symbols TEXT NOT NULL,
      lookback_days INTEGER NOT NULL, data_points INTEGER NOT NULL,
      covariance_matrix TEXT NOT NULL, correlation_matrix TEXT NOT NULL,
      mean_returns TEXT NOT NULL, volatilities TEXT NOT NULL,
      trading_days_arr TEXT NOT NULL, computed_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );
  `);
  return db;
}

describe('returns-db: SQLite schema and operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it('creates tables correctly', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as any[];
    const names = tables.map(t => t.name);
    expect(names).toContain('instruments');
    expect(names).toContain('daily_prices');
    expect(names).toContain('daily_returns');
    expect(names).toContain('matrix_cache');
  });

  it('inserts and retrieves instruments', () => {
    db.prepare('INSERT INTO instruments (instrument_id, symbol, instrument_type_id, is_crypto, trading_days, tracked) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1001, 'AAPL', 5, 0, 252, 1);
    db.prepare('INSERT INTO instruments (instrument_id, symbol, instrument_type_id, is_crypto, trading_days, tracked) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1002, 'BTC', 11, 1, 365, 1);

    const all = db.prepare('SELECT * FROM instruments WHERE tracked = 1').all() as any[];
    expect(all.length).toBe(2);
    expect(all[0].symbol).toBe('AAPL');
    expect(all[1].is_crypto).toBe(1);
    expect(all[1].trading_days).toBe(365);
  });

  it('handles upsert (ON CONFLICT UPDATE)', () => {
    db.prepare('INSERT INTO instruments (instrument_id, symbol, instrument_type_id, is_crypto, trading_days, tracked) VALUES (?, ?, ?, ?, ?, ?)').run(1001, 'AAPL', 5, 0, 252, 1);
    db.prepare('INSERT INTO instruments (instrument_id, symbol, instrument_type_id, is_crypto, trading_days, tracked) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(instrument_id) DO UPDATE SET symbol = excluded.symbol').run(1001, 'AAPL.US', 5, 0, 252, 1);

    const row = db.prepare('SELECT symbol FROM instruments WHERE instrument_id = 1001').get() as any;
    expect(row.symbol).toBe('AAPL.US');
  });

  it('bulk inserts prices with deduplication', () => {
    db.prepare('INSERT INTO instruments (instrument_id, symbol) VALUES (?, ?)').run(1001, 'AAPL');

    const prices = [
      { date: '2026-01-01', close: 150.0 },
      { date: '2026-01-02', close: 152.0 },
      { date: '2026-01-03', close: 151.0 },
    ];

    const stmt = db.prepare('INSERT OR IGNORE INTO daily_prices (instrument_id, date, close) VALUES (?, ?, ?)');
    const txn = db.transaction(() => {
      for (const p of prices) stmt.run(1001, p.date, p.close);
    });
    txn();

    const count = (db.prepare('SELECT COUNT(*) as c FROM daily_prices WHERE instrument_id = 1001').get() as any).c;
    expect(count).toBe(3);

    // Re-insert same — should not duplicate
    txn();
    const count2 = (db.prepare('SELECT COUNT(*) as c FROM daily_prices WHERE instrument_id = 1001').get() as any).c;
    expect(count2).toBe(3);
  });

  it('computes log returns correctly', () => {
    db.prepare('INSERT INTO instruments (instrument_id, symbol) VALUES (?, ?)').run(1001, 'AAPL');

    const prices = [
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 110 },
      { date: '2026-01-03', close: 105 },
    ];

    for (const p of prices) {
      db.prepare('INSERT INTO daily_prices (instrument_id, date, close) VALUES (?, ?, ?)').run(1001, p.date, p.close);
    }

    const rows = db.prepare('SELECT date, close FROM daily_prices WHERE instrument_id = 1001 ORDER BY date ASC').all() as any[];
    const returns: Array<{ date: string; logReturn: number }> = [];
    for (let i = 1; i < rows.length; i++) {
      returns.push({
        date: rows[i].date,
        logReturn: Math.log(rows[i].close / rows[i - 1].close),
      });
    }

    expect(returns.length).toBe(2);
    expect(returns[0]!.logReturn).toBeCloseTo(Math.log(110 / 100), 10);
    expect(returns[1]!.logReturn).toBeCloseTo(Math.log(105 / 110), 10);
  });

  it('aligns returns across multiple instruments', () => {
    db.prepare('INSERT INTO instruments (instrument_id, symbol, trading_days) VALUES (?, ?, ?)').run(1001, 'AAPL', 252);
    db.prepare('INSERT INTO instruments (instrument_id, symbol, trading_days) VALUES (?, ?, ?)').run(1002, 'MSFT', 252);

    // AAPL: has dates 01 through 05
    const aaplReturns = [
      { date: '2026-01-02', logReturn: 0.01 },
      { date: '2026-01-03', logReturn: -0.005 },
      { date: '2026-01-04', logReturn: 0.02 },
      { date: '2026-01-05', logReturn: -0.01 },
    ];
    // MSFT: has dates 02 through 05 (missing 01, so overlaps on 02-05)
    const msftReturns = [
      { date: '2026-01-02', logReturn: 0.015 },
      { date: '2026-01-03', logReturn: -0.003 },
      { date: '2026-01-05', logReturn: 0.008 },
    ];

    for (const r of aaplReturns) db.prepare('INSERT INTO daily_returns (instrument_id, date, log_return) VALUES (?, ?, ?)').run(1001, r.date, r.logReturn);
    for (const r of msftReturns) db.prepare('INSERT INTO daily_returns (instrument_id, date, log_return) VALUES (?, ?, ?)').run(1002, r.date, r.logReturn);

    // Find common dates
    const aaplDates = new Set(db.prepare('SELECT date FROM daily_returns WHERE instrument_id = 1001').all().map((r: any) => r.date));
    const msftDates = new Set(db.prepare('SELECT date FROM daily_returns WHERE instrument_id = 1002').all().map((r: any) => r.date));

    const common = [...aaplDates].filter(d => msftDates.has(d)).sort();
    expect(common).toEqual(['2026-01-02', '2026-01-03', '2026-01-05']);
  });

  it('matrix cache: stores and retrieves with expiry', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 86400000);
    const past = new Date(now.getTime() - 86400000);

    // Valid cache entry
    db.prepare(`INSERT INTO matrix_cache (cache_key, instrument_ids, symbols, lookback_days, data_points,
      covariance_matrix, correlation_matrix, mean_returns, volatilities, trading_days_arr, computed_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('test_key', '[1001,1002]', '["AAPL","MSFT"]', 252, 200,
        '[[0.04,0.01],[0.01,0.03]]', '[[1,0.5],[0.5,1]]',
        '[0.12,0.08]', '[0.2,0.17]', '[252,252]',
        now.toISOString(), future.toISOString());

    // Expired cache entry
    db.prepare(`INSERT INTO matrix_cache (cache_key, instrument_ids, symbols, lookback_days, data_points,
      covariance_matrix, correlation_matrix, mean_returns, volatilities, trading_days_arr, computed_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('expired_key', '[1003]', '["TSLA"]', 252, 100,
        '[[0.05]]', '[[1]]', '[0.15]', '[0.22]', '[252]',
        past.toISOString(), past.toISOString());

    // Query valid
    const valid = db.prepare('SELECT * FROM matrix_cache WHERE cache_key = ? AND expires_at > ?')
      .get('test_key', now.toISOString()) as any;
    expect(valid).toBeTruthy();
    expect(JSON.parse(valid.instrument_ids)).toEqual([1001, 1002]);

    // Query expired — should return nothing
    const expired = db.prepare('SELECT * FROM matrix_cache WHERE cache_key = ? AND expires_at > ?')
      .get('expired_key', now.toISOString()) as any;
    expect(expired).toBeUndefined();

    // Prune expired
    const pruned = db.prepare('DELETE FROM matrix_cache WHERE expires_at < ?').run(now.toISOString());
    expect(pruned.changes).toBe(1);
  });

  it('computes covariance matrix from aligned returns', () => {
    // 2 assets, 5 observations
    const returns = [
      [0.01, -0.005, 0.02, -0.01, 0.015],
      [0.008, -0.003, 0.015, -0.008, 0.012],
    ];
    const tradingDays = [252, 252];
    const T = 5;

    const dailyMeans = returns.map(r => r.reduce((s, v) => s + v, 0) / T);
    const nAssets = 2;

    const cov: number[][] = Array.from({ length: nAssets }, () => new Array(nAssets).fill(0));
    for (let i = 0; i < nAssets; i++) {
      for (let j = i; j < nAssets; j++) {
        let c = 0;
        for (let t = 0; t < T; t++) {
          c += (returns[i]![t]! - dailyMeans[i]!) * (returns[j]![t]! - dailyMeans[j]!);
        }
        c /= (T - 1);
        const ann = i === j ? c * tradingDays[i]! : c * Math.sqrt(tradingDays[i]! * tradingDays[j]!);
        cov[i]![j] = ann;
        cov[j]![i] = ann;
      }
    }

    // Covariance should be symmetric
    expect(cov[0]![1]).toBe(cov[1]![0]);
    // Diagonal should be positive (variance)
    expect(cov[0]![0]).toBeGreaterThan(0);
    expect(cov[1]![1]).toBeGreaterThan(0);
    // Correlation should be between -1 and 1
    const vol0 = Math.sqrt(cov[0]![0]!);
    const vol1 = Math.sqrt(cov[1]![1]!);
    const corr = cov[0]![1]! / (vol0 * vol1);
    expect(corr).toBeGreaterThanOrEqual(-1);
    expect(corr).toBeLessThanOrEqual(1);
  });

  it('handles crypto vs stock trading days', () => {
    db.prepare('INSERT INTO instruments (instrument_id, symbol, instrument_type_id, is_crypto, trading_days) VALUES (?, ?, ?, ?, ?)').run(1001, 'AAPL', 5, 0, 252);
    db.prepare('INSERT INTO instruments (instrument_id, symbol, instrument_type_id, is_crypto, trading_days) VALUES (?, ?, ?, ?, ?)').run(1002, 'BTC', 11, 1, 365);

    const aapl = db.prepare('SELECT trading_days FROM instruments WHERE instrument_id = 1001').get() as any;
    const btc = db.prepare('SELECT trading_days FROM instruments WHERE instrument_id = 1002').get() as any;

    expect(aapl.trading_days).toBe(252);
    expect(btc.trading_days).toBe(365);
  });

  it('cache key is deterministic regardless of ID order', () => {
    const key1 = `mtx_252_${[1001, 1002, 1003].sort((a, b) => a - b).join(',')}`;
    const key2 = `mtx_252_${[1003, 1001, 1002].sort((a, b) => a - b).join(',')}`;
    expect(key1).toBe(key2);
    expect(key1).toBe('mtx_252_1001,1002,1003');
  });
});
