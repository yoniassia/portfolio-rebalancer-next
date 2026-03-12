'use client';
import { useState } from 'react';
import { Badge } from '../shared/Badge';
import { Spinner } from '../shared/Spinner';
import { BottomBar } from '../layout/BottomBar';
import { Button } from '../shared/Button';
import { formatCurrency } from '../../utils/format';
import { EXECUTION_PHASES } from '../../constants/steps';
import type { TradeProgress, ExecutionPhase, RebalancePlan, PortfolioAnalysis } from '../../types/rebalancer';

interface ExecuteStepProps {
  plan: RebalancePlan | null;
  trades: TradeProgress[];
  phase: ExecutionPhase;
  portfolio: PortfolioAnalysis | null;
  onExecute: () => void;
  onViewResults: () => void;
  driftThreshold: number;
  maxPositionWeight: number;
  slippageTolerance: number;
  onDriftThresholdChange: (val: number) => void;
  onMaxPositionWeightChange: (val: number) => void;
  onSlippageToleranceChange: (val: number) => void;
}

const statusVariant = (s: TradeProgress['status']) => {
  if (s === 'success') return 'success' as const;
  if (s === 'failed') return 'error' as const;
  if (s === 'executing') return 'info' as const;
  if (s === 'skipped') return 'warning' as const;
  return 'neutral' as const;
};

const statusLabel = (s: TradeProgress['status']) => {
  if (s === 'success') return 'Done';
  if (s === 'failed') return 'Failed';
  if (s === 'executing') return 'Running';
  if (s === 'skipped') return 'Skipped';
  return 'Pending';
};

const actionLabel = (a: TradeProgress['action']) => {
  if (a === 'full-close') return 'Close';
  if (a === 'partial-close') return 'Reduce';
  return 'Buy';
};

const actionVariant = (a: TradeProgress['action']) => {
  if (a === 'buy') return 'info' as const;
  if (a === 'full-close') return 'error' as const;
  return 'warning' as const;
};

export function ExecuteStep({
  plan, trades, phase, portfolio,
  onExecute, onViewResults,
  driftThreshold, maxPositionWeight, slippageTolerance,
  onDriftThresholdChange, onMaxPositionWeightChange, onSlippageToleranceChange,
}: ExecuteStepProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isIdle = phase === 'idle';
  const isComplete = phase === 'complete' || phase === 'failed';
  const isExecuting = !isIdle && !isComplete;
  const successCount = trades.filter((t) => t.status === 'success').length;
  const failCount = trades.filter((t) => t.status === 'failed').length;

  // Build trade list from plan if trades not yet populated
  const displayTrades = trades.length > 0 ? trades : [
    ...(plan?.fullCloses ?? []).map(t => ({ ...t, status: 'pending' as const })),
    ...(plan?.partialCloses ?? []).map(t => ({ ...t, status: 'pending' as const })),
    ...(plan?.opens ?? []).map(t => ({ ...t, status: 'pending' as const })),
  ];

  // Pre-flight checks
  const closeTrades = displayTrades.filter(t => t.action === 'full-close' || t.action === 'partial-close');
  const buyTrades = displayTrades.filter(t => t.action === 'buy');
  const totalSellAmount = closeTrades.reduce((s, t) => s + t.amount, 0);
  const totalBuyAmount = buyTrades.reduce((s, t) => s + t.amount, 0);
  const cashAvailable = (portfolio?.availableCash ?? 0) + totalSellAmount;
  const cashSufficient = cashAvailable >= totalBuyAmount * 0.95; // 5% buffer

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto" style={{ paddingBottom: 80 }}>

        {/* Phase indicator (only during execution) */}
        {!isIdle && (
          <div style={{ display: 'flex', gap: 6 }}>
            {EXECUTION_PHASES.map((p) => {
              const isActive = phase === p.id;
              const isPast = (
                (p.id === 'closing' && (phase === 'partial-closing' || phase === 'opening' || phase === 'complete')) ||
                (p.id === 'partial-closing' && (phase === 'opening' || phase === 'complete'))
              );
              return (
                <div key={p.id} style={{
                  flex: 1, borderRadius: 8, padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600,
                  background: isActive ? 'rgba(59,130,246,0.12)' : isPast ? 'rgba(0,200,83,0.12)' : 'var(--bg-card)',
                  color: isActive ? '#3b82f6' : isPast ? '#00c853' : 'var(--text-tertiary)',
                  border: isActive ? '1px solid #3b82f6' : '1px solid var(--border)',
                }}>
                  {p.title}
                </div>
              );
            })}
          </div>
        )}

        {/* Execution in progress spinner */}
        {isExecuting && trades.some(t => t.status === 'executing') && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 }}>
            <Spinner size="sm" />
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Executing trades...</span>
          </div>
        )}

        {/* Completion banner */}
        {isComplete && (
          <div style={{
            borderRadius: 12, padding: 14, textAlign: 'center',
            background: phase === 'complete' ? 'rgba(0,200,83,0.12)' : 'rgba(239,68,68,0.12)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: phase === 'complete' ? '#00c853' : '#ef4444' }}>
              {phase === 'complete' ? '✅ Execution Complete' : '❌ Execution Failed'}
            </div>
            <div className="mono" style={{ fontSize: 13, marginTop: 4, color: 'var(--text-secondary)' }}>
              {successCount} succeeded, {failCount} failed
            </div>
          </div>
        )}

        {/* Trade Plan (idle state) */}
        {isIdle && plan && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
              TRADE PLAN ({displayTrades.length} trades)
            </div>

            {/* Pre-flight checks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {[
                { ok: displayTrades.length > 0, label: `${displayTrades.length} trades planned`, detail: `${closeTrades.length} sells, ${buyTrades.length} buys` },
                { ok: cashSufficient, label: cashSufficient ? 'Sufficient cash' : 'Insufficient cash', detail: `Need ${formatCurrency(totalBuyAmount)}, have ${formatCurrency(cashAvailable)}` },
              ].map((check, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: check.ok ? 'rgba(0,200,83,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${check.ok ? '#00c85330' : '#ef444430'}` }}>
                  <span style={{ fontSize: 14 }}>{check.ok ? '✅' : '⚠️'}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: check.ok ? '#00c853' : '#f59e0b' }}>{check.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {displayTrades.map((t, i) => (
            <div key={i} style={{ borderRadius: 10, padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Badge variant={actionVariant(t.action)}>{actionLabel(t.action)}</Badge>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{t.symbol}</span>
                </div>
                {'status' in t && <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                <span className="mono">{formatCurrency('actualAmount' in t && t.actualAmount ? t.actualAmount : t.amount)}</span>
                <span>{t.reason}</span>
              </div>
              {'error' in t && t.error && (
                <div style={{ fontSize: 11, marginTop: 4, color: '#ef4444' }}>{t.error}</div>
              )}
            </div>
          ))}

          {displayTrades.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spinner size="lg" />
              <div style={{ fontSize: 13, marginTop: 8, color: 'var(--text-secondary)' }}>Preparing trades...</div>
            </div>
          )}
        </div>

        {/* Advanced Settings (collapsed) */}
        {isIdle && (
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 10, background: 'var(--bg-card)',
                border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
              }}
            >
              <span>⚙️</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Advanced Settings</span>
              <span style={{ fontSize: 10, transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {showAdvanced && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
                {/* Drift threshold */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Drift threshold</span>
                    <span className="mono" style={{ color: '#00c853', fontWeight: 600 }}>{driftThreshold}%</span>
                  </div>
                  <input type="range" min={2} max={15} step={1} value={driftThreshold} onChange={e => onDriftThresholdChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#00c853' }} />
                </div>
                {/* Max position weight */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Max position weight</span>
                    <span className="mono" style={{ color: '#00c853', fontWeight: 600 }}>{maxPositionWeight}%</span>
                  </div>
                  <input type="range" min={10} max={50} step={5} value={maxPositionWeight} onChange={e => onMaxPositionWeightChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#00c853' }} />
                </div>
                {/* Slippage tolerance */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Slippage tolerance</span>
                    <span className="mono" style={{ color: '#00c853', fontWeight: 600 }}>{slippageTolerance}%</span>
                  </div>
                  <input type="range" min={0.1} max={2} step={0.1} value={slippageTolerance} onChange={e => onSlippageToleranceChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#00c853' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom action */}
      {isIdle && displayTrades.length > 0 && (
        <BottomBar>
          <Button onClick={onExecute} className="w-full" size="lg">
            Execute All Trades ({displayTrades.length})
          </Button>
        </BottomBar>
      )}

      {isComplete && (
        <BottomBar>
          <Button onClick={onViewResults} className="w-full" size="lg">
            View Results →
          </Button>
        </BottomBar>
      )}
    </div>
  );
}
