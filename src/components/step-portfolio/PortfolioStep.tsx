'use client';
import { useState, useMemo } from 'react';
import { Button } from '../shared/Button';
import { BottomBar } from '../layout/BottomBar';
import { formatCurrency, formatWeight } from '../../utils/format';
import { PIE_COLORS } from '../../constants/steps';
import type { PortfolioAnalysis, PortfolioHolding } from '../../types/rebalancer';

interface PortfolioStepProps {
  portfolio: PortfolioAnalysis;
  onNext: () => void;
  isDemo: boolean;
}

// ── Arrow icon ─────────────────────────────────────────
const ArrowIcon = ({ up }: { up: boolean }) => (
  <div style={{
    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
    background: up ? 'rgba(0,200,83,0.15)' : 'rgba(239,68,68,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, color: up ? '#00c853' : '#ef4444',
  }}>
    {up ? '↑' : '↓'}
  </div>
);

// ── Single instrument row ─────────────────────────────
const HoldingRow = ({ h }: { h: PortfolioHolding }) => {
  const pnlPct = h.investedAmount > 0
    ? ((h.pnl / h.investedAmount) * 100).toFixed(1)
    : '0.0';
  const isUp = h.pnl >= 0;
  const pnlColor = isUp ? '#00c853' : '#ef4444';
  const posCount = h.positions?.length ?? 1;

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 12,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      border: '1px solid var(--border)',
    }}>
      <ArrowIcon up={isUp} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{h.symbol}</span>
          {posCount > 1 && (
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', background: 'var(--bg-input)', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>
              {posCount} pos
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {formatCurrency(h.investedAmount)} invested · {formatWeight(h.weight)}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(h.totalValue)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: pnlColor, fontVariantNumeric: 'tabular-nums' }}>
          {isUp ? '+' : ''}{pnlPct}%
        </div>
      </div>
    </div>
  );
};

function scoreBar(value: number, color: string, label: string) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>
        <span>{label}</span>
        <span className="mono" style={{ fontWeight: 600, color }}>{value}/100</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-input)' }}>
        <div style={{ height: '100%', borderRadius: 99, width: `${value}%`, backgroundColor: color, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────
export function PortfolioStep({ portfolio, onNext, isDemo }: PortfolioStepProps) {
  const [showCopy, setShowCopy] = useState(false);

  const directHoldings = useMemo(() => {
    return (portfolio.directHoldings ?? portfolio.holdings.filter(h => !h.isCopy))
      .slice().sort((a, b) => b.totalValue - a.totalValue);
  }, [portfolio]);

  const copyHoldings = useMemo(() => {
    return (portfolio.copyHoldings ?? portfolio.holdings.filter(h => !!h.isCopy))
      .slice().sort((a, b) => b.totalValue - a.totalValue);
  }, [portfolio]);

  // Capital base for analysis = TOTAL equity (direct + copy + cash) — the real portfolio value
  const totalEquity = portfolio.totalValue;

  // ALL holdings combined for health analysis (direct + copy)
  const allHoldings = useMemo(() => {
    return [...directHoldings, ...copyHoldings].sort((a, b) => b.totalValue - a.totalValue);
  }, [directHoldings, copyHoldings]);

  // Copy allocation metrics
  const copyValue = useMemo(() => copyHoldings.reduce((s, h) => s + h.totalValue, 0), [copyHoldings]);
  const directValue = useMemo(() => directHoldings.reduce((s, h) => s + h.totalValue, 0), [directHoldings]);
  const copyWeight = totalEquity > 0 ? copyValue / totalEquity : 0;
  const directWeight = totalEquity > 0 ? directValue / totalEquity : 0;
  const cashWeight = totalEquity > 0 ? portfolio.availableCash / totalEquity : 0;

  // ── Portfolio Health Analysis (across ALL positions — direct + copy) ──
  const analysis = useMemo(() => {
    const h = allHoldings;
    const n = h.length;
    if (n === 0) return null;

    // Recalculate weights based on TOTAL equity
    const weights = h.map(holding => totalEquity > 0 ? holding.totalValue / totalEquity : 0);

    // 1. Concentration (HHI-based)
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    const normalizedHHI = n > 1 ? hhi * n / (n - 1) : 1;
    const concentrationScore = Math.round(Math.max(0, Math.min(100, 100 * (1 - normalizedHHI))));

    // 2. Effective Diversification
    const effectiveN = hhi > 0 ? 1 / hhi : 0;

    // 3. Risk Balance — sector check + cash drag penalty
    const analysisCashWeight = totalEquity > 0 ? portfolio.availableCash / totalEquity : 0;
    const cashDragPenalty = analysisCashWeight > 0.10 ? Math.min(30, (analysisCashWeight - 0.05) * 200) : 0;
    // Top-heavy penalty
    const sortedWeights = [...weights].sort((a, b) => b - a);
    const topHeavyPenalty = sortedWeights[0] !== undefined && sortedWeights[0] > 0.30
      ? Math.min(40, (sortedWeights[0] - 0.20) * 200)
      : 0;
    const riskBalanceScore = Math.round(Math.max(0, 100 - cashDragPenalty - topHeavyPenalty));

    // Composite health score (each component capped at 100)
    const diversificationScore = Math.min(100, Math.round(effectiveN / Math.max(1, n) * 100));
    const healthScore = Math.round(concentrationScore * 0.40 + diversificationScore * 0.30 + riskBalanceScore * 0.30);

    // Sort for display
    const sortedByWeight = h.map((holding, i) => ({
      ...holding,
      adjustedWeight: weights[i] ?? 0,
    })).sort((a, b) => b.adjustedWeight - a.adjustedWeight);

    // Dynamic insights
    interface Insight { type: 'warning' | 'info' | 'ok'; title: string; detail: string }
    const insights: Insight[] = [];

    // Copy vs direct allocation insight
    const nDirect = directHoldings.length;
    const nCopy = copyHoldings.length;
    const copyPct = totalEquity > 0 ? (copyHoldings.reduce((s, hh) => s + hh.totalValue, 0) / totalEquity * 100) : 0;

    if (copyPct > 50) {
      insights.push({ type: 'info', title: `${copyPct.toFixed(0)}% in copy trading`, detail: `${nCopy} positions via copy traders, ${nDirect} direct. Optimizer will complement your copies with direct positions.` });
    }

    if (n === 1) {
      insights.push({ type: 'warning', title: 'Single position', detail: 'Your entire portfolio is in one asset. Adding instruments can dramatically improve risk-adjusted returns.' });
    } else if (effectiveN < 3 && n >= 3) {
      insights.push({ type: 'warning', title: `Behaves like ${effectiveN.toFixed(1)} positions`, detail: `Despite holding ${n} instruments, concentration means effective diversification is only ${effectiveN.toFixed(1)} independent positions.` });
    }

    const top1 = sortedByWeight[0];
    if (top1 && top1.adjustedWeight > 0.30) {
      insights.push({ type: 'warning', title: `${top1.symbol} is ${(top1.adjustedWeight * 100).toFixed(0)}% of portfolio`, detail: 'High single-instrument concentration. Consider reducing exposure.' });
    }

    if (analysisCashWeight > 0.15) {
      insights.push({ type: 'info', title: `${(analysisCashWeight * 100).toFixed(0)}% sitting in cash`, detail: 'Optimizer can deploy idle cash across diversified positions.' });
    }

    if (nDirect < 5 && nDirect > 0) {
      insights.push({ type: 'info', title: `Only ${nDirect} direct instruments`, detail: `You have ${nCopy > 0 ? nCopy + ' via copy + ' : ''}${nDirect} direct. Optimizer can suggest new direct positions for diversification.` });
    }

    if (insights.length === 0) {
      insights.push({ type: 'ok', title: 'Portfolio looks healthy', detail: 'No major concentration or risk issues detected. Run optimizer to fine-tune allocation.' });
    }

    return {
      concentrationScore,
      diversificationScore,
      effectiveN,
      riskBalanceScore,
      healthScore,
      insights,
      sortedByWeight,
      cashWeight: analysisCashWeight,
    };
  }, [allHoldings, totalEquity, portfolio.availableCash, directHoldings, copyHoldings]);

  const hasEnoughForOptimizer = directHoldings.length >= 2;
  const totalPnl = portfolio.totalPnL ?? portfolio.holdings.reduce((s, h) => s + h.pnl, 0);
  const isUp = totalPnl >= 0;
  const pnlColor = isUp ? '#00c853' : '#ef4444';
  const pnlPct = portfolio.investedValue
    ? `${isUp ? '+' : ''}${((totalPnl / portfolio.investedValue) * 100).toFixed(1)}%`
    : '';

  const healthColor = analysis
    ? analysis.healthScore >= 70 ? '#00c853' : analysis.healthScore >= 45 ? '#f59e0b' : '#ef4444'
    : '#666';
  const healthLabel = analysis
    ? analysis.healthScore >= 70 ? 'Healthy' : analysis.healthScore >= 45 ? 'Needs Attention' : 'At Risk'
    : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>

        {isDemo && (
          <div style={{ margin: '12px 16px 0', padding: '6px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: 12 }}>
            Demo mode — simulated portfolio data
          </div>
        )}

        {/* Portfolio value header */}
        <div style={{ padding: '20px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 2 }}>PORTFOLIO VALUE</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(portfolio.totalValue)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Total P&L</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: pnlColor, fontVariantNumeric: 'tabular-nums' }}>
              {isUp ? '+' : ''}{formatCurrency(Math.abs(totalPnl))}
            </div>
            <div style={{ fontSize: 12, color: pnlColor }}>{pnlPct}</div>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'flex', gap: 0, margin: '0 16px 16px', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {[
            { label: 'Direct', value: formatCurrency(directValue) },
            { label: 'Copy', value: formatCurrency(copyValue) },
            { label: 'Cash', value: formatCurrency(portfolio.availableCash) },
          ].map((item, i) => (
            <div key={i} style={{ flex: 1, padding: '8px 0', textAlign: 'center', background: 'var(--bg-card)', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Health Score Banner */}
        {analysis && (
          <div style={{ margin: '0 16px 16px', background: 'linear-gradient(135deg, #141420 0%, #1a1a2e 100%)', borderRadius: 16, padding: 16, border: `1px solid ${healthColor}40` }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>PORTFOLIO HEALTH</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
              <div className="mono" style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: healthColor }}>{analysis.healthScore}</div>
              <div style={{ paddingBottom: 6 }}>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: healthColor }}>{healthLabel}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Acts like {analysis.effectiveN.toFixed(1)} independent positions
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scoreBar(analysis.concentrationScore, '#10b981', 'Concentration')}
              {scoreBar(analysis.diversificationScore, '#6366f1', 'Diversification')}
              {scoreBar(analysis.riskBalanceScore, '#f59e0b', 'Risk Balance')}
            </div>
          </div>
        )}

        {/* Top Holdings with weight bars (across entire portfolio) */}
        {analysis && analysis.sortedByWeight.length > 0 && (
          <div style={{ padding: '0 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>TOP HOLDINGS (ALL)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {analysis.sortedByWeight.slice(0, 8).map((h, i) => (
                <div key={h.instrumentId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, width: 50, color: 'var(--text-primary)' }}>{h.symbol}</span>
                  {h.isCopy && <span style={{ fontSize: 8, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.15)', borderRadius: 4, padding: '1px 4px' }}>COPY</span>}
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--bg-input)', maxWidth: 120 }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${h.adjustedWeight * 100}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  </div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, width: 42, textAlign: 'right', color: 'var(--text-secondary)' }}>{formatWeight(h.adjustedWeight)}</span>
                  <span className="mono" style={{ fontSize: 11, width: 68, textAlign: 'right', color: 'var(--text-tertiary)' }}>{formatCurrency(h.totalValue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insights */}
        {analysis && (
          <div style={{ padding: '0 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>INSIGHTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analysis.insights.map((ins, i) => {
                const color = ins.type === 'warning' ? '#f59e0b' : ins.type === 'ok' ? '#00c853' : '#6366f1';
                const bg = ins.type === 'warning' ? 'rgba(245,158,11,0.08)' : ins.type === 'ok' ? 'rgba(0,200,83,0.08)' : 'rgba(99,102,241,0.08)';
                const icon = ins.type === 'warning' ? '⚠️' : ins.type === 'ok' ? '✅' : 'ℹ️';
                return (
                  <div key={i} style={{ borderRadius: 10, padding: 12, background: bg, border: `1px solid ${color}30` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color }}>{ins.title}</div>
                        <div style={{ fontSize: 11, marginTop: 2, color: 'var(--text-secondary)' }}>{ins.detail}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Direct holdings list */}
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
            DIRECT HOLDINGS ({directHoldings.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!hasEnoughForOptimizer && (
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid #f59e0b', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>Minimum 2 positions required</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Need at least 2 direct positions to optimize.
                </div>
              </div>
            )}
            {directHoldings.map(h => <HoldingRow key={h.instrumentId} h={h} />)}
          </div>
        </div>

        {/* Copy Trading (collapsed) */}
        {copyHoldings.length > 0 && (
          <div style={{ padding: '0 16px', marginBottom: 24 }}>
            <button
              onClick={() => setShowCopy(!showCopy)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
              }}
            >
              <span>ℹ️</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Copy positions ({copyHoldings.length}) — included in analysis, not rebalanceable</span>
              <span style={{ fontSize: 11, transform: showCopy ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {showCopy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {copyHoldings.map(h => <HoldingRow key={h.instrumentId} h={h} />)}
              </div>
            )}
          </div>
        )}
      </div>

      <BottomBar>
        <Button onClick={onNext} className="w-full" size="lg" disabled={!hasEnoughForOptimizer}>
          Optimize Portfolio →
        </Button>
      </BottomBar>
    </div>
  );
}
