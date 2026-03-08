# Portfolio Rebalancer — Gap Analysis: Actual vs Planned

**Date:** March 8, 2026
**Reference:** AgentX (`/home/quant/apps/agentx/`)
**Target:** Align rebalancer look & feel with AgentX design language

---

## 1. THEME & COLOR SYSTEM

| Element | AgentX (Target) ✅ | Rebalancer (Actual) ❌ | Gap |
|---------|-------------------|----------------------|-----|
| Background | `#0D0D0D` (near black) | `#f8f9fa` (light grey) | **CRITICAL** — entire app is light theme |
| Card bg | `#141420` (dark blue) | `bg-white` | **CRITICAL** |
| Card hover | `#1A1A2E` | `bg-etoro-light-grey` (#f5f5f5) | **CRITICAL** |
| Input bg | `#1E1E30` | white/grey | **CRITICAL** |
| Border | `#2A2A3E` (dark) | `#e5e7eb` (light grey) | **HIGH** |
| Text primary | `#FFFFFF` | `#333333` | **CRITICAL** |
| Text secondary | `#9CA3AF` | `#6b7280` | Medium |
| Accent | `#00C853` (green) | `#00c853` ✅ | OK |
| Profit | `#00C853` | - | **Missing** |
| Loss | `#EF4444` | `#f44336` | Close, align |
| Warning | `#F59E0B` | `#ff9800` | Close, align |
| Blue | `#3B82F6` | `#2196f3` | Align |

**Impact:** 135 Tailwind class references use light theme colors across 14 components + globals.css

---

## 2. TYPOGRAPHY

| Element | AgentX (Target) ✅ | Rebalancer (Actual) ❌ | Gap |
|---------|-------------------|----------------------|-----|
| Primary font | `DM Sans` | `Inter` | **HIGH** — wrong font family |
| Mono font | `JetBrains Mono` | Not used | **HIGH** — no mono class for numbers |
| Font loading | Google Fonts in layout | Not configured | Need to add |

---

## 3. COMPONENT PATTERNS

### AgentX Design Language:
- **Inline styles using CSS vars** (`style={{ background: 'var(--bg-card)' }}`)
- **Card pattern:** `bg-card`, `border` color, `borderRadius: 14px`
- **Gradient banners:** `linear-gradient(135deg, #141420, #1a2a1a)` for hero sections
- **Summary cards:** 3-column grid, small label (9px, uppercase, letter-spacing), mono values
- **Tab switcher:** Pills in card bg, accent bg on active, black text on active
- **Direction badges:** 36x36 rounded squares with colored background tints
- **P&L colors:** Green for profit, red for loss, everywhere
- **Number formatting:** `className="mono"` on all financial values
- **Empty states:** Centered emoji + text
- **Loading states:** Pulsing emoji
- **Safe area padding:** `env(safe-area-inset-bottom)` for iOS

### Rebalancer Current:
- **Tailwind utility classes** (`className="bg-white text-etoro-text"`)
- **Card pattern:** White bg, light grey borders, rounded-lg
- **No gradient banners**
- **Summary missing** — no equity banner, no portfolio value display
- **Tab switcher:** Green bg on active, white bg on inactive
- **No direction badges**
- **No P&L color coding**
- **No mono class usage**
- **Basic empty/loading states**
- **No safe area padding**

---

## 4. SPECIFIC COMPONENT GAPS

### 4.1 ConnectStep.tsx (10 light refs)
- White background toggles → dark card bg
- Green/blue toggle buttons → accent pill style
- Light text colors → white/grey on dark
- Missing: gradient header, eToro logo styling

### 4.2 PortfolioStep.tsx (24 light refs) — **LARGEST GAP**
- Entire holdings list is light-themed
- No instrument direction badges (↑/↓)
- No P&L color coding (profit green/loss red)
- No "PORTFOLIO VALUE" equity banner
- No summary cards row (Available / Invested / P&L)
- No mono font on financial values
- No expand/collapse for multi-position instruments
- Missing: market status badges (LIVE/STALE/Market Closed)

### 4.3 OptimizeStep.tsx (34 light refs) — **MOST REFERENCES**
- All cards, toggles, inputs are light
- Tab switcher is green on white → needs accent on dark
- Sliders/inputs need dark styling
- Weight displays need mono font

### 4.4 ResultsStep.tsx (26 light refs)
- Results cards all white
- No P&L color coding
- No gradient banners for summary

### 4.5 TargetStep.tsx (9 light refs)
- Weight bars, percentages need dark bg + mono font

### 4.6 ValidationStep.tsx (9 light refs)
- Check/warning/error indicators on white bg

### 4.7 ExecutionStep.tsx (7 light refs)
- Trade execution cards on white bg
- Progress indicators need dark styling

### 4.8 Layout Components
- **AppShell.tsx:** `bg-white shadow-lg` → `bg-primary`, no shadow
- **StepHeader.tsx:** `bg-white border-b` → `bg-card border` with dark colors
- **BottomBar.tsx:** `bg-white border-t` → `bg-card border` matching AgentX nav

### 4.9 Shared Components
- **Button.tsx:** Light hover states → dark hover
- **SearchInput.tsx:** White dropdown → dark dropdown with dark border
- **Badge.tsx:** Light bg variants → dark bg with color tints

---

## 5. STRUCTURAL GAPS

| Feature | AgentX ✅ | Rebalancer ❌ |
|---------|----------|--------------|
| CSS approach | CSS vars in :root + inline styles | Tailwind classes + @theme block |
| Scrollbar styling | Custom thin (4px) dark | Default browser |
| Safe area (iOS) | `env(safe-area-inset-bottom)` | Not implemented |
| Accessibility | `.sr-only` with focus-visible override | Basic sr-only |
| Pulse animation | `@keyframes pulse` defined | Not defined |
| Max width container | `maxWidth: 480` inline | `max-w-[430px]` class |

---

## 6. DEV PLAN

### Phase 1: Foundation (Est. 15 min)
1. **Replace globals.css** — Copy AgentX `:root` vars, body styling, scrollbar, animations
2. **Add fonts** — DM Sans + JetBrains Mono in layout.tsx (Google Fonts)
3. **Update Tailwind theme** — Map CSS vars to Tailwind or remove @theme block entirely
4. **Max width** — Change from 430px to 480px to match AgentX

### Phase 2: Layout Components (Est. 10 min)
5. **AppShell.tsx** — Dark bg, remove shadow, 480px max
6. **StepHeader.tsx** — Dark card bg, dark border, white text
7. **BottomBar.tsx** — Match AgentX bottom nav pattern (fixed, card bg, border-top)

### Phase 3: Shared Components (Est. 10 min)
8. **Button.tsx** — Accent bg, dark hover states
9. **Badge.tsx** — Color tint backgrounds (rgba patterns from AgentX)
10. **SearchInput.tsx** — Dark dropdown, dark input bg, dark border
11. **Spinner.tsx** — Use pulsing emoji pattern from AgentX

### Phase 4: Step Components (Est. 30 min)
12. **ConnectStep.tsx** — Dark toggles, gradient header, accent buttons
13. **PortfolioStep.tsx** — Full rewrite to match AgentX Portfolio view:
    - Equity banner with gradient
    - 3-column summary cards (Available/Invested/P&L)
    - Instrument cards with direction badges
    - P&L color coding + mono font
    - Expand/collapse for multi-position
14. **OptimizeStep.tsx** — Dark cards, dark inputs/sliders, accent tabs
15. **TargetStep.tsx** — Dark weight bars, mono percentages
16. **ValidationStep.tsx** — Dark cards, colored status badges
17. **ExecutionStep.tsx** — Dark execution cards, progress styling
18. **ResultsStep.tsx** — Dark results cards, P&L color coding, gradient summary

### Phase 5: Polish (Est. 10 min)
19. Add `.mono` class usage on ALL financial numbers
20. Add safe area padding for iOS
21. Add custom scrollbar styling
22. Verify bundle size < 500KB
23. Test on mobile viewport (480px)
24. Build + deploy + screenshot

### Total Estimated Time: ~75 min (1 sub-agent)

### Priority Order (if time-constrained):
1. **globals.css + fonts** (foundation — everything else depends on this)
2. **PortfolioStep** (most visible, most impact)
3. **Layout components** (shell, header, bottom bar)
4. **ConnectStep** (first thing user sees)
5. **OptimizeStep** (most Tailwind refs to fix)
6. **Remaining steps** (Target, Validation, Execution, Results)

---

## 7. DECISION NEEDED

**Approach A: CSS vars + inline styles** (AgentX pattern)
- Replace all Tailwind color classes with inline `style={{ background: 'var(--bg-card)' }}`
- Pros: Exact match to AgentX, easy to maintain parity
- Cons: Large diff, loses Tailwind utility benefits

**Approach B: Tailwind with mapped dark vars**
- Update `@theme` block to use AgentX's color values
- Replace `bg-white` → `bg-[var(--bg-card)]` or create Tailwind aliases
- Pros: Smaller diff, keeps Tailwind patterns
- Cons: Not exact match to AgentX code style

**Recommendation: Approach A** — Match AgentX exactly. The rebalancer is a smaller app (14 components) and consistency with AgentX is more important than Tailwind conventions.
