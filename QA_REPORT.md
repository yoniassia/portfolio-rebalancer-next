# QA Report — Portfolio Rebalancer V2
**Date:** 2026-03-13  
**Requested by:** Shay Heffets  
**Status:** ALL PASS

---

## Test Summary

| Suite | Tests | Pass | Fail | Duration |
|-------|-------|------|------|----------|
| policy-store (unit) | 13 | 13 | 0 | <5ms |
| rebalance-log (unit) | 9 | 9 | 0 | <5ms |
| portfolio-analyzer (unit) | 10 | 10 | 0 | <5ms |
| rebalance-planner (unit) | 8 | 8 | 0 | <5ms |
| Functional Runbook (live API) | 28 | 28 | 0 | ~230ms |
| **TOTAL** | **72** | **72** | **0** | **<500ms** |

---

## Unit Test Coverage

### policy-store.ts (13 tests)
- ID generation (uniqueness, format)
- Save/load roundtrip
- Non-existent policy returns null
- updatedAt auto-update
- nextScheduledAt auto-computation for scheduled policies
- No nextScheduledAt for drift-only policies
- Delete existing/non-existent
- List all / filter by user
- Find overdue scheduled policies
- Exclude disabled policies
- Find active drift policies
- Schedule computation (weekly/monthly/quarterly)
- Past-date advancement

### rebalance-log.ts (9 tests)
- ID generation (time-sortable format)
- Save/load roundtrip
- Non-existent returns null
- In-place update
- List with ordering + limit
- Filter by policy/user
- Aggregated stats (byTrigger, byDay, totals)

### portfolio-analyzer.ts (10 tests)
- Holdings, weights, PnL calculation
- Multi-position grouping per instrument
- Empty portfolio handling
- Weight sorting (descending)
- Drift calculation per target
- Within-band detection
- Exceeds-threshold detection
- Instruments in portfolio but not in targets
- New instruments in targets but not in portfolio
- Portfolio → target allocation conversion

### rebalance-planner.ts (8 tests)
- Full closes for removed instruments
- Partial closes for overweight
- Buy orders for underweight
- Balanced portfolio = no trades
- Cash scaling when insufficient
- Empty portfolio → all buys
- Cash flow tracking
- Invalid instrument skipping

---

## Functional Runbook (28 tests against live localhost:3046)

### 1. Admin Dashboard API (3)
- Returns all KPI fields + breakdowns + tables
- Reflects newly created policies
- Rejects wrong admin key

### 2. Cron Rebalance Endpoint (4)
- Dry run returns valid response
- Picks up overdue scheduled policies
- Reports token-expired for policies without refresh token
- 1-hour cooldown prevents re-execution

### 3. Drift Check Endpoint (3)
- Bulk check with admin key
- 401 without auth
- Per-policy check requires cookie auth

### 4. Policies CRUD (6)
- All operations (GET, POST, GET/:id, PATCH/:id, DELETE/:id) require auth
- Returns 401 without cookie

### 5. Page Rendering (3)
- Main page (/) — 200 OK with HTML
- Admin page (/admin) — 200 OK with HTML
- Auth callback (/auth/callback) — 200 OK

### 6. Edge Cases & Security (4)
- Non-existent API → 404
- Concurrent admin requests (5 parallel) — no crashes
- Concurrent cron dry runs (3 parallel) — no crashes
- 10+ policies at once — no performance degradation

### 7. Data Integrity (5)
- File-on-disk matches API response
- Disabled policies excluded from active count
- Execution stats consistent (completed + failed + running ≤ total)
- Mode breakdown sums = total policies
- Account type breakdown sums = total policies

---

## Bugs Fixed During QA

### BUG-1: Execution listing not chronologically sorted
**Severity:** Medium  
**Root cause:** `listExecutions` sorted by filename (random hex), not by time  
**Fix:** Changed to sort by `startedAt` timestamp descending  
**Also fixed:** Execution IDs now contain timestamp prefix for natural file ordering

### BUG-2: No execution file cleanup
**Severity:** Low  
**Root cause:** No pruning mechanism — files accumulate indefinitely  
**Fix:** Added `pruneOldExecutions()` (keeps last 500), called from cron endpoint

### BUG-3: Missing test script in package.json
**Severity:** Low  
**Fix:** Added `"test": "vitest run"` and `"test:watch": "vitest"`

---

## Gaps & Recommendations

### P1 — Admin key exposed in client
The admin page has `ADMIN_KEY` hardcoded in the client-side component. Should be:
- Moved to a server-side auth check (cookie or session based)
- Or require admin login before accessing the dashboard

### P2 — No external cron configured
The `/api/cron/rebalance` endpoint needs an external cron (PM2 cron or system cron) calling it every 15-30 minutes for scheduled/drift rebalances to actually trigger automatically.

### P3 — Duplicate portfolio fetch logic
`fetchPortfolioForPolicy` in drift/check and `fetchPortfolio` in cron/rebalance are nearly identical. Should be extracted to a shared utility.

---

## How to Run Tests

```bash
cd /home/quant/apps/portfolio-rebalancer-next

# Unit tests only
npm test

# With watch mode
npm run test:watch

# Specific file
npx vitest run src/engine/portfolio-analyzer.test.ts
```
