# Portfolio Rebalancer — Functional Gap Analysis: Actual vs Planned

**Date:** March 8, 2026
**Source:** PRD + Session Decisions + Codebase Audit

---

## SUMMARY

| Category | Planned | Implemented | Working E2E | Gap |
|----------|---------|-------------|-------------|-----|
| Steps | 9 | 7 | 2 | 🔴 2 steps missing, 5 steps untested E2E |
| Components | 25 | 14 | ~10 | 🔴 11 components missing from Next.js |
| Server Routes | 15 | 15 | ~5 | 🟡 Routes exist but most untested with real data |
| Cron Jobs | 5 | 5 | 0 | 🔴 All cron jobs exist but none verified working |
| Tests | 265 | 265 | 265 pass | ✅ But all on Vite app, 0 on Next.js |
| DB Tables | 6 | 6 | 2 | 🟡 4 tables unused |

---

## 1. STEP FLOW GAPS

### Planned (9 steps):
```
Connect(0) → Configure(1) → Portfolio(2) → Optimize(3) → Target(4) → Backtest(5) → Validation(6) → Execution(7) → Results(8)
```

### Actual (7 steps, no Configure or Backtest):
```
Connect(0) → Portfolio(1) → Optimize(2) → Target(3) → Validation(4) → Execution(5) → Results(6)
```

| Step | In Vite App | In Next.js App | Wired E2E | Status |
|------|-------------|----------------|-----------|--------|
| Connect | ✅ | ✅ | ✅ SSO works | ✅ Working |
| **Configure** | ✅ ConfigureStep.tsx | ❌ **MISSING** | ❌ | 🔴 Not ported |
| Portfolio | ✅ | ✅ | ⚠️ SSO + fetch works, display issues | 🟡 Partially |
| Optimize | ✅ | ✅ | ❌ Not tested E2E | 🟡 UI only |
| Target | ✅ | ✅ | ❌ Not tested E2E | 🟡 UI only |
| **Backtest** | ✅ BacktestStep.tsx | ❌ **MISSING** | ❌ | 🔴 Not ported |
| Validation | ✅ | ✅ | ❌ Not tested E2E | 🟡 UI only |
| Execution | ✅ | ✅ | ❌ Placeholder (no real trades) | 🟡 Placeholder |
| Results | ✅ | ✅ | ❌ Not tested E2E | 🟡 UI only |

### Missing from Next.js:
1. **ConfigureStep** — Service mode (auto/semi/manual), activation mode (threshold/scheduled/manual), autonomy level (auto/approve/inform)
2. **BacktestStep** — 3-year backtest, equity curve SVG, monthly heatmap, metrics comparison

---

## 2. COMPONENT GAPS

### In Vite app but NOT in Next.js (11 missing):

| Component | Purpose | Priority |
|-----------|---------|----------|
| **ConfigureStep.tsx** | Service/activation/autonomy settings | 🔴 HIGH |
| **BacktestStep.tsx** | Backtest config + results display | 🔴 HIGH |
| **EquityCurve.tsx** | SVG equity curve chart | 🔴 HIGH (part of backtest) |
| **MonthlyHeatmap.tsx** | CSS grid monthly returns heatmap | 🔴 HIGH (part of backtest) |
| **NotificationBell.tsx** | Bell icon with pending count badge | 🟡 MEDIUM |
| **NotificationPanel.tsx** | Dropdown with approve/reject buttons | 🟡 MEDIUM |
| **ErrorBoundary.tsx** | React error boundary wrapper | 🟡 MEDIUM |
| **ErrorFallback.tsx** | Error state UI | 🟡 MEDIUM |
| **Skeleton.tsx** | Shimmer loading placeholders | 🟢 LOW |
| **StepTransition.tsx** | CSS fade-in between steps | 🟢 LOW |
| **Toast.tsx** | Toast notification system | 🟢 LOW |

---

## 3. DATA FLOW GAPS

### 3.1 Portfolio Fetch (Connect → Portfolio)

| Feature | Planned | Actual | Gap |
|---------|---------|--------|-----|
| SSO authentication | ✅ | ✅ Working | ✅ |
| Demo/Real toggle | ✅ | ✅ UI exists | ⚠️ Demo may return 401 |
| Token auto-refresh | ✅ | ✅ Code exists | ❌ Not verified (tokens expire in 10 min) |
| Symbol resolution | ✅ | ✅ Code rewritten | ❌ Not verified (was showing ID1400) |
| Live prices (bid/ask) | ✅ | ✅ Code exists | ❌ Not verified |
| P&L calculation | ✅ | ✅ Code exists | ❌ Not verified (was showing $0) |
| Cash/credit display | ✅ | ✅ Code uses clientPortfolio.credit | ❌ Not verified (was showing $0) |
| Eligibility gate (5 min) | ✅ | ❌ Not in Next.js | 🔴 Missing |

### 3.2 Optimization (Portfolio → Optimize → Target)

| Feature | Planned | Actual | Gap |
|---------|---------|--------|-----|
| Equal-weight optimizer | ✅ | ✅ Engine exists | ⚠️ Works in demo |
| Min-variance optimizer | ✅ | ✅ Engine exists | ⚠️ Converges to near-equal weights |
| Risk-parity optimizer | ✅ | ✅ Engine exists | ⚠️ Converges to near-equal weights |
| MVO optimizer | ✅ | ✅ Engine exists | ⚠️ Converges to near-equal weights |
| Ledoit-Wolf shrinkage | ✅ | ✅ Code exists | ❌ Not verified with real data |
| Volatility targeting | ✅ | ✅ Code exists | ❌ Not verified |
| Advanced params UI | ✅ | ✅ In OptimizeStep | 🟡 UI renders, not tested E2E |
| Min/max weight constraints | ✅ | ✅ In params | ❌ Not verified |
| Risk aversion slider | ✅ | ✅ In params | ❌ Not verified |
| Lookback period config | ✅ | ✅ In params | ❌ Not verified |

### 3.3 Backtest (Target → Backtest)

| Feature | Planned | Actual | Gap |
|---------|---------|--------|-----|
| 3-year historical data | ✅ | ✅ Server engine exists | ❌ Not wired to frontend |
| Financial Datasets API | ✅ | ✅ data-pipeline.ts | ❌ Not tested |
| Yahoo Finance fallback | ✅ | ✅ yf CLI fallback | ❌ Not tested |
| Equity curve SVG | ✅ | ✅ In Vite app | 🔴 Not in Next.js |
| Monthly heatmap | ✅ | ✅ In Vite app | 🔴 Not in Next.js |
| 10 performance metrics | ✅ | ✅ Engine calculates | ❌ Not displayed |
| Benchmark comparison | ✅ | ✅ Dual simulation | ❌ Not wired |
| Backtest history (DB) | ✅ | ✅ API route exists | ❌ Not tested |

### 3.4 Execution (Validation → Execution → Results)

| Feature | Planned | Actual | Gap |
|---------|---------|--------|-----|
| Trade preview/plan | ✅ | ✅ rebalance-planner.ts | 🟡 Logic exists |
| Instrument validation | ✅ | ✅ instrument-validator.ts | 🟡 Logic exists |
| Trade execution (eToro) | ✅ | ⚠️ Uses etoro-sdk | 🔴 Placeholder — marks complete without real API |
| Close positions | ✅ | ✅ etoro.closePosition() | ❌ Not tested live |
| Open positions | ✅ | ✅ etoro.buyByAmount() | ❌ Not tested live |
| Cash scaling | ✅ | ✅ Adjusts if insufficient cash | ❌ Not tested |
| Execution audit log | ✅ | ✅ rb_executions table | ❌ Not writing to DB |

---

## 4. SERVER-SIDE GAPS

### 4.1 Cron Jobs (all exist in code, none verified)

| Job | Schedule | Status |
|-----|----------|--------|
| Drift monitor | Every 15 min (market hours) | ❌ Needs active user configs to work |
| Scheduled rebalance | Every hour | ❌ Needs user schedule configs |
| Cash detector | Every 30 min | ❌ Needs last_known_cash baseline |
| Token refresh | Every 8 min | ❌ Needs active sessions with refresh_token |
| Session cleanup | Every hour | 🟡 Should work |

**Root issue:** All cron jobs query `rb_configs` for active users, but no user has saved a config yet. The cron jobs are effectively NOOPs.

### 4.2 API Routes (exist but untested with real flow)

| Route | Method | Tested? |
|-------|--------|---------|
| `/api/auth/login` | GET | ✅ Works |
| `/api/auth/me` | GET | ✅ Works |
| `/api/auth/callback` | GET | ✅ Works |
| `/api/auth/logout` | POST | ❌ Not tested |
| `/api/portfolio` | GET | ⚠️ Partially (symbol/cash/pnl issues) |
| `/api/config` | GET | ❌ Not tested |
| `/api/config` | PUT | ❌ Known FK bug (demo user) |
| `/api/rebalance/drift` | GET | ❌ Not tested |
| `/api/rebalance/preview` | POST | ❌ Not tested |
| `/api/rebalance/execute` | POST | ❌ Not tested |
| `/api/rebalance/history` | GET | ❌ Not tested |
| `/api/notifications` | GET | ❌ Not tested |
| `/api/notifications/:id/approve` | POST | ❌ Not tested |
| `/api/notifications/:id/reject` | POST | ❌ Not tested |
| `/api/backtest/run` | POST | ❌ Not tested |
| `/api/backtest/history` | GET | ❌ Not tested |
| `/api/backtest/:id` | GET | ❌ Not tested |

### 4.3 Database Usage

| Table | Has Data | Used By Frontend |
|-------|----------|-----------------|
| `rb_users` | ❌ Empty | ❌ |
| `rb_configs` | ❌ Empty | ❌ |
| `rb_executions` | ❌ Empty | ❌ |
| `rb_audit_log` | ❌ Empty | ❌ |
| `rb_backtests` | ❌ Empty | ❌ |
| `shared_sessions` | ✅ 1 row (expired) | ✅ Auth middleware |

---

## 5. FEATURE GAPS BY PRIORITY

### 🔴 P0 — CRITICAL (Core flow broken)

1. **Portfolio display** — Symbols showing as IDs, cash $0, P&L $0 (sub-agent deployed fix, unverified)
2. **Token refresh** — Sessions expire in 10 min, no working refresh yet
3. **ConfigureStep missing** — User can't set service mode, activation triggers, autonomy level
4. **No eligibility gate in Next.js** — Users with <5 positions can proceed (should be blocked)

### 🟡 P1 — HIGH (Features planned but not functional)

5. **BacktestStep missing** — No backtest UI in Next.js (server engine exists)
6. **EquityCurve + MonthlyHeatmap charts** — Not ported to Next.js
7. **Notification system** — NotificationBell + Panel not in Next.js
8. **Config persistence** — PUT /api/config fails for demo users (FK constraint)
9. **Optimizer convergence** — min-variance, risk-parity, MVO converge to near-equal weights (gradient descent insufficient, need CVXPY or quadprog)
10. **Execution wiring** — Placeholder only, no real eToro trade execution
11. **Approval flow** — approve/reject buttons exist server-side but no frontend

### 🟢 P2 — MEDIUM (Polish + UX)

12. **ErrorBoundary** — Not in Next.js
13. **Skeleton loaders** — Not in Next.js
14. **Toast notifications** — Not in Next.js
15. **StepTransition animations** — Not in Next.js
16. **Demo mode (`?mode=demo`)** — Not consistently implemented across all routes
17. **Email notifications** — Planned (approval flow) but no email infrastructure
18. **Audit logging** — rb_audit_log table exists but nothing writes to it
19. **Execution history** — History route exists but frontend doesn't display it

### 🔵 P3 — LOW (Future)

20. **eToro demo portfolio auth** — Demo endpoint returns 401 with SSO token
21. **Optimizer upgrade** — Replace gradient descent with proper convex solver
22. **Desktop layout** — Mobile-first only, desktop deferred
23. **Compliance/MiFID** — Explicitly deferred

---

## 6. TWO-APP PROBLEM

**Root cause of many gaps:** The project has TWO separate codebases:

| | Vite App (original) | Next.js App (deployed) |
|---|---|---|
| **Path** | `/home/quant/apps/portfolio-rebalancer/` | `/home/quant/apps/portfolio-rebalancer-next/` |
| **Components** | 25 | 14 |
| **Tests** | 265 (all passing) | 0 |
| **Engine** | Full optimizer + planner + executor | Same (shared) |
| **Server** | Express on port 3047 | — (uses Express API) |
| **PM2** | `rebalancer-api` | `portfolio-rebalancer` |
| **Live** | ❌ Not served | ✅ Served on port 3046 |

**Sprint 1-5 work was done on the Vite app.** The Next.js app was set up separately with only the core step components ported. 11 components from Sprints 2-5 (Configure, Backtest, charts, notifications, error handling, skeletons, toasts) were **never ported** to Next.js.

---

## 7. RECOMMENDED DEV PLAN

### Sprint 6A: Fix Core Flow (Est. 2 hours)
1. Verify portfolio display fix (symbols, cash, P&L) — already deployed
2. Verify token refresh works over 10+ min window
3. Add eligibility gate to PortfolioStep (min 5 positions)
4. Port ConfigureStep from Vite → Next.js (dark theme)
5. Wire ConfigureStep into page.tsx as step 1

### Sprint 6B: Port Missing Components (Est. 2 hours)
6. Port BacktestStep from Vite → Next.js (dark theme)
7. Port EquityCurve.tsx (pure SVG chart)
8. Port MonthlyHeatmap.tsx (CSS grid)
9. Wire BacktestStep into page.tsx as step 5
10. Update RebalanceStep enum to 9 steps

### Sprint 6C: Notification + Error Handling (Est. 1 hour)
11. Port NotificationBell + NotificationPanel (dark theme)
12. Port ErrorBoundary + ErrorFallback
13. Port Toast system
14. Port Skeleton loaders
15. Port StepTransition animations

### Sprint 6D: Integration Testing (Est. 2 hours)
16. End-to-end test: Login → Portfolio → Optimize → Target → Backtest → Validate → Execute (demo)
17. Fix Config PUT FK constraint
18. Verify all cron jobs log correctly
19. Test approval flow (pending → approve/reject)
20. Test backtest with real Financial Datasets API data

### Sprint 7: Execution Wiring (Est. 3 hours)
21. Wire real eToro trade execution (via etoro-sdk)
22. Execution audit logging to DB
23. Results step reads from actual execution data
24. End-to-end demo trade test

**Total estimated: ~10 hours across 4 sprints**

---

## 8. QUICK WINS (< 30 min each)

1. Port ConfigureStep.tsx — it's already built, just needs dark theme + wiring
2. Add eligibility gate — 10 lines of conditional rendering
3. Port ErrorBoundary — copy from Vite, wrap App
4. Fix Config PUT — insert demo user row or bypass FK check
5. Add `?mode=demo` query param support across all server routes
