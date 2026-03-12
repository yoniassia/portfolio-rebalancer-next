'use client';
import { useState, useCallback } from 'react';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { Spinner } from '../shared/Spinner';
import { BottomBar } from '../layout/BottomBar';
import { cn } from '../../utils/cn';
import { formatWeight } from '../../utils/format';
import { PIE_COLORS } from '../../constants/steps';
import type { OptimizationMethod, OptimizationResult, PortfolioAnalysis, BacktestResult } from '../../types/rebalancer';

interface OptimizeStepProps {
  portfolio: PortfolioAnalysis;
  onOptimize: (method: OptimizationMethod, params: Record<string, number>) => Promise<OptimizationResult>;
  onApply: (result: OptimizationResult) => void;
  isOptimizing: boolean;
  progress: { phase: string; current: number; total: number } | null;
  result: OptimizationResult | null;
  holdingCount: number;
  onClearResult: () => void;
}

const RISK_LEVELS = [
  { level: 1 as const, label: 'Very Low', desc: 'Minimum variance', method: 'min-variance' as OptimizationMethod, params: { riskAversion: 2.5 } },
  { level: 2 as const, label: 'Low', desc: 'Risk parity, cautious', method: 'risk-parity' as OptimizationMethod, params: { riskAversion: 2.5 } },
  { level: 3 as const, label: 'Moderate', desc: 'Balanced risk parity', method: 'risk-parity' as OptimizationMethod, params: { riskAversion: 2.5 } },
  { level: 4 as const, label: 'High', desc: 'Growth oriented MVO', method: 'mvo' as OptimizationMethod, params: { riskAversion: 1.5 } },
  { level: 5 as const, label: 'Very High', desc: 'Aggressive MVO', method: 'mvo' as OptimizationMethod, params: { riskAversion: 0.5 } },
];

const RISK_COLORS = ['#10b981', '#22c55e', '#f59e0b', '#f97316', '#ef4444'];

function formatReasonLabel(reason?: string): { label: string; variant: 'info' | 'success' | 'warning' } {
  switch (reason) {
    case 'Diversifier': return { label: '🔀 Diversifier', variant: 'info' };
    case 'Momentum': return { label: '📈 Momentum', variant: 'success' };
    case 'Capital Preservation': return { label: '🛡️ Preservation', variant: 'warning' };
    case 'Risk Reducer': return { label: '⚖️ Risk Reducer', variant: 'info' };
    default: return { label: reason ?? 'Candidate', variant: 'info' };
  }
}

// ── Mini Equity Chart ────────────────────────────────────
function EquityChart({ data, benchmark }: { data: [number, number][]; benchmark?: [number, number][] }) {
  if (data.length < 2) return null;
  const allValues = [...data.map(d => d[1]), ...(benchmark ?? []).map(d => d[1])];
  const min = Math.min(...allValues) * 0.995;
  const max = Math.max(...allValues) * 1.005;
  const r = max - min || 1;
  const w = 340;
  const h = 100;
  const toPath = (points: [number, number][]) => points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p[1] - min) / r) * h;
    return `${x},${y}`;
  }).join(' ');
  const isProfit = data[data.length - 1]![1] >= data[0]![1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="ec-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isProfit ? '#00C853' : '#EF4444'} stopOpacity="0.2" />
          <stop offset="100%" stopColor={isProfit ? '#00C853' : '#EF4444'} stopOpacity="0" />
        </linearGradient>
      </defs>
      {benchmark && <polyline points={toPath(benchmark)} fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.5" />}
      <polygon points={`0,${h} ${toPath(data)} ${w},${h}`} fill="url(#ec-fill)" />
      <polyline points={toPath(data)} fill="none" stroke={isProfit ? '#00C853' : '#EF4444'} strokeWidth="2" />
    </svg>
  );
}

export function OptimizeStep({ portfolio, onOptimize, onApply, isOptimizing, progress, result, holdingCount, onClearResult }: OptimizeStepProps) {
  // Sub-screens: 'config' | 'results'
  const [screen, setScreen] = useState<'config' | 'results'>(result ? 'results' : 'config');
  const [riskLevel, setRiskLevel] = useState(3);
  const [addNew, setAddNew] = useState(true);
  const [newCount, setNewCount] = useState(3);
  const [disabledNewInstruments, setDisabledNewInstruments] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const canOptimize = holdingCount >= 2;
  const effectiveM = addNew ? newCount : 0;

  // When risk level changes with results showing → go back to config, clear results
  const handleRiskChange = useCallback((level: number) => {
    setRiskLevel(level);
    if (result) {
      onClearResult();
      setScreen('config');
      setDisabledNewInstruments(new Set());
    }
  }, [result, onClearResult]);

  const handleAddNewChange = useCallback((val: boolean) => {
    setAddNew(val);
    if (result) {
      onClearResult();
      setScreen('config');
      setDisabledNewInstruments(new Set());
    }
  }, [result, onClearResult]);

  const handleNewCountChange = useCallback((count: number) => {
    setNewCount(count);
    if (result) {
      onClearResult();
      setScreen('config');
      setDisabledNewInstruments(new Set());
    }
  }, [result, onClearResult]);

  const handleOptimize = async () => {
    const risk = RISK_LEVELS[riskLevel - 1]!;
    setError(null);
    try {
      const optimResult = await onOptimize(risk.method, { ...risk.params, m: effectiveM });
      if (optimResult) setScreen('results');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Optimization failed';
      setError(msg);
      if (msg.toLowerCase().includes('not authenticated') || msg.toLowerCase().includes('401')) {
        setTimeout(() => { window.location.href = '/api/auth/login'; }, 1500);
      }
    }
  };

  const toggleNewInstrument = (instrumentId: number) => {
    const next = new Set(disabledNewInstruments);
    if (next.has(instrumentId)) next.delete(instrumentId);
    else next.add(instrumentId);
    setDisabledNewInstruments(next);
  };

  // ── CONFIG SCREEN (3a) ────────────────────────────────
  if (screen === 'config' || !result) {
    return (
      <div className="flex flex-col flex-1">
        <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto" style={{ paddingBottom: 80 }}>

          {!canOptimize && (
            <div style={{ borderRadius: 10, padding: 12, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: 13, fontWeight: 500 }}>
              Optimizer requires 2+ instruments. You have {holdingCount}.
            </div>
          )}

          {/* Risk Tolerance */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 10 }}>RISK TOLERANCE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {RISK_LEVELS.map((r, i) => (
                <button
                  key={r.level}
                  onClick={() => handleRiskChange(r.level)}
                  disabled={!canOptimize}
                  style={{
                    flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', cursor: canOptimize ? 'pointer' : 'not-allowed',
                    background: riskLevel === r.level ? `${RISK_COLORS[i]}22` : 'var(--bg-card)',
                    outline: riskLevel === r.level ? `2px solid ${RISK_COLORS[i]}` : '1px solid var(--border)',
                    opacity: canOptimize ? 1 : 0.5, transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 2 }}>
                    {['🛡️', '🔒', '⚖️', '📈', '🚀'][i]}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: riskLevel === r.level ? RISK_COLORS[i] : 'var(--text-secondary)' }}>
                    {r.label}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, textAlign: 'center' }}>
              {RISK_LEVELS[riskLevel - 1]?.desc} · {RISK_LEVELS[riskLevel - 1]?.method.replace('-', ' ')}
            </div>
          </div>

          {/* Add New Instruments */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: addNew ? 10 : 0 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Add new instruments</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>AI-suggested diversifiers</div>
              </div>
              <button
                onClick={() => handleAddNewChange(!addNew)}
                disabled={!canOptimize}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: addNew ? '#00c853' : 'var(--bg-input)', transition: 'background 0.2s', position: 'relative',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2,
                  left: addNew ? 22 : 2, transition: 'left 0.2s',
                }} />
              </button>
            </div>
            {addNew && (
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 5, 10].map(v => (
                  <button
                    key={v}
                    onClick={() => handleNewCountChange(v)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: newCount === v ? 'rgba(0,200,83,0.15)' : 'var(--bg-input)',
                      color: newCount === v ? '#00c853' : 'var(--text-secondary)',
                      outline: newCount === v ? '1.5px solid #00c853' : 'none',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Optimize button */}
          <Button onClick={handleOptimize} loading={isOptimizing} disabled={!canOptimize || isOptimizing} className="w-full" size="lg">
            {isOptimizing ? 'Optimizing...' : 'Run Optimization'}
          </Button>

          {isOptimizing && progress && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spinner size="sm" />
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{progress.phase}</span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: 'var(--bg-input)' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`, background: '#00c853', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {error && (
            <div style={{ borderRadius: 10, padding: 12, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 13, fontWeight: 500 }}>
              {error}
              {(error.toLowerCase().includes('not authenticated') || error.toLowerCase().includes('401')) && (
                <div style={{ fontSize: 11, marginTop: 4, color: '#ef444499' }}>Redirecting to login...</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RESULTS SCREEN (3b) ───────────────────────────────
  const backtest = result.backtest;
  const currentBacktest = result.currentBacktest;

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto" style={{ paddingBottom: 80 }}>

        {/* Before vs After comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {/* Current */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>CURRENT</div>
            {result.existingReweighted?.slice(0, 5).map((item, i) => (
              <div key={item.instrumentId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                <span className="mono" style={{ color: 'var(--text-secondary)' }}>{item.symbol}</span>
                <span className="mono" style={{ color: 'var(--text-tertiary)' }}>{formatWeight(item.currentWeight ?? 0)}</span>
              </div>
            ))}
            {currentBacktest && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Sharpe</span>
                  <span className="mono" style={{ color: 'var(--text-secondary)' }}>{currentBacktest.sharpe_ratio.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Vol</span>
                  <span className="mono" style={{ color: 'var(--text-secondary)' }}>{currentBacktest.volatility.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>
          {/* Proposed */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 12, border: '1px solid #00c85340' }}>
            <div style={{ fontSize: 10, color: '#00c853', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>PROPOSED</div>
            {result.existingReweighted?.slice(0, 5).map((item, i) => (
              <div key={item.instrumentId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                <span className="mono" style={{ color: 'var(--text-primary)' }}>{item.symbol}</span>
                <span className="mono" style={{ color: '#00c853' }}>{formatWeight(item.targetWeight)}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Exp Return</span>
                <span className="mono" style={{ color: '#00c853' }}>{(result.metrics.expectedReturn * 100).toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Sharpe</span>
                <span className="mono" style={{ color: '#00c853' }}>{result.metrics.sharpeRatio.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Vol</span>
                <span className="mono" style={{ color: 'var(--text-secondary)' }}>{(result.metrics.expectedVolatility * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Backtest Chart */}
        {backtest && backtest.equity_curve.length > 0 && (
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
              3-YEAR BACKTEST
            </div>
            <EquityChart data={backtest.equity_curve} benchmark={backtest.benchmark_curve} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 14, height: 2, background: backtest.total_return_pct >= 0 ? '#00c853' : '#ef4444' }} />
                <span>Rebalanced</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 14, height: 1, borderTop: '1px dashed var(--text-tertiary)' }} />
                <span>Buy & Hold</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
              {[
                { label: 'Return', value: `${backtest.total_return_pct >= 0 ? '+' : ''}${backtest.total_return_pct}%`, color: backtest.total_return_pct >= 0 ? '#00c853' : '#ef4444' },
                { label: 'B&H', value: `${backtest.benchmark_return_pct >= 0 ? '+' : ''}${backtest.benchmark_return_pct}%`, color: 'var(--text-secondary)' },
                { label: 'Sharpe', value: backtest.sharpe_ratio.toFixed(2), color: 'var(--text-primary)' },
                { label: 'Max DD', value: `${backtest.max_drawdown_pct}%`, color: '#ef4444' },
              ].map((m, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2 }}>{m.label}</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Changes list */}
        {result.existingReweighted && result.existingReweighted.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>WEIGHT CHANGES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.existingReweighted.map((item) => {
                const delta = (item.targetWeight ?? 0) - (item.currentWeight ?? 0);
                const isIncrease = delta >= 0;
                return (
                  <div key={item.instrumentId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600, flex: 1, color: 'var(--text-primary)' }}>{item.symbol}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatWeight(item.currentWeight ?? 0)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>→</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-primary)' }}>{formatWeight(item.targetWeight)}</span>
                    <Badge variant={isIncrease ? 'success' : 'warning'}>
                      {isIncrease ? '+' : ''}{(delta * 100).toFixed(1)}%
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* New Instrument Suggestions */}
        {result.newRecommendations && result.newRecommendations.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
              NEW INSTRUMENTS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.newRecommendations.map((item) => {
                const disabled = disabledNewInstruments.has(item.instrumentId);
                const reasonLabel = formatReasonLabel(item.reason);
                const yearChange = item.oneYearPriceChange;
                return (
                  <div
                    key={item.instrumentId}
                    style={{
                      padding: '10px 12px', borderRadius: 10, background: 'var(--bg-card)',
                      border: `1px solid ${disabled ? 'var(--border)' : '#00c85340'}`,
                      opacity: disabled ? 0.5 : 1, transition: 'opacity 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => toggleNewInstrument(item.instrumentId)}
                        style={{
                          width: 22, height: 22, borderRadius: 6, border: 'none', cursor: 'pointer', flexShrink: 0,
                          background: disabled ? 'var(--bg-input)' : '#00c853', color: disabled ? 'var(--text-tertiary)' : '#000',
                          fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {disabled ? '−' : '✓'}
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.symbol}</span>
                          <Badge variant={reasonLabel.variant}>{reasonLabel.label}</Badge>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {item.displayName}
                          {typeof yearChange === 'number' && ` · ${yearChange > 0 ? '+' : ''}${yearChange.toFixed(1)}% 1yr`}
                        </div>
                      </div>
                      <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: '#00c853' }}>{formatWeight(item.targetWeight)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No new instruments message */}
        {result.newRecommendations?.length === 0 && addNew && (
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
            No new instruments cleared the minimum weight threshold.
          </div>
        )}

      </div>

      <BottomBar>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button onClick={() => onApply(result)} className="w-full" size="lg">
            Apply This Plan →
          </Button>
          <button
            onClick={() => { onClearResult(); setScreen('config'); setDisabledNewInstruments(new Set()); }}
            style={{ width: '100%', textAlign: 'center', fontSize: 13, padding: '6px 0', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Adjust Configuration
          </button>
        </div>
      </BottomBar>
    </div>
  );
}
