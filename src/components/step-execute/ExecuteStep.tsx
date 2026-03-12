'use client';
import { useState } from 'react';
import { Badge } from '../shared/Badge';
import { Spinner } from '../shared/Spinner';
import { BottomBar } from '../layout/BottomBar';
import { Button } from '../shared/Button';
import { formatCurrency } from '../../utils/format';
import type { TradeProgress, ExecutionPhase, RebalancePlan, PortfolioAnalysis } from '../../types/rebalancer';

interface ExecuteStepProps {
  plan: RebalancePlan | null;
  trades: TradeProgress[];
  phase: ExecutionPhase;
  portfolio: PortfolioAnalysis | null;
  onExecute: () => void;
  onViewResults: () => void;
  onCancelOrder?: (orderId: number) => void;
  driftThreshold: number;
  maxPositionWeight: number;
  slippageTolerance: number;
  onDriftThresholdChange: (val: number) => void;
  onMaxPositionWeightChange: (val: number) => void;
  onSlippageToleranceChange: (val: number) => void;
}

const statusVariant = (s: TradeProgress['status']) => {
  if (s === 'success' || s === 'limit-filled') return 'success' as const;
  if (s === 'failed' || s === 'limit-cancelled') return 'error' as const;
  if (s === 'executing') return 'info' as const;
  if (s === 'limit-pending') return 'warning' as const;
  if (s === 'skipped') return 'warning' as const;
  return 'neutral' as const;
};

const statusLabel = (s: TradeProgress['status']) => {
  if (s === 'success') return 'Filled';
  if (s === 'limit-filled') return 'Limit Filled';
  if (s === 'limit-pending') return 'Limit Pending';
  if (s === 'limit-cancelled') return 'Cancelled';
  if (s === 'failed') return 'Failed';
  if (s === 'executing') return 'Executing';
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

const phaseLabels: Record<string, string> = {
  closing: '📉 Closing Positions',
  'partial-closing': '📉 Reducing Positions',
  opening: '📈 Opening Positions',
  polling: '⏳ Waiting for Limit Orders',
};

export function ExecuteStep({
  plan, trades, phase, portfolio,
  onExecute, onViewResults, onCancelOrder,
  driftThreshold, maxPositionWeight, slippageTolerance,
  onDriftThresholdChange, onMaxPositionWeightChange, onSlippageToleranceChange,
}: ExecuteStepProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isIdle = phase === 'idle';
  const isComplete = phase === 'complete' || phase === 'failed';
  const isPolling = phase === 'polling';
  const isExecuting = !isIdle && !isComplete && !isPolling;

  const successCount = trades.filter((t) => t.status === 'success' || t.status === 'limit-filled').length;
  const failCount = trades.filter((t) => t.status === 'failed').length;
  const pendingCount = trades.filter((t) => t.status === 'limit-pending').length;
  const cancelledCount = trades.filter((t) => t.status === 'limit-cancelled').length;

  const displayTrades = trades.length > 0 ? trades : [
    ...(plan?.fullCloses ?? []).map(t => ({ ...t, status: 'pending' as const })),
    ...(plan?.partialCloses ?? []).map(t => ({ ...t, status: 'pending' as const })),
    ...(plan?.opens ?? []).map(t => ({ ...t, status: 'pending' as const })),
  ];

  const closeTrades = displayTrades.filter(t => t.action === 'full-close' || t.action === 'partial-close');
  const buyTrades = displayTrades.filter(t => t.action === 'buy');
  const totalSellAmount = closeTrades.reduce((s, t) => s + t.amount, 0);
  const totalBuyAmount = buyTrades.reduce((s, t) => s + t.amount, 0);
  const cashAvailable = (portfolio?.availableCash ?? 0) + totalSellAmount;
  const cashSufficient = cashAvailable >= totalBuyAmount * 0.95;

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto" style={{ paddingBottom: 80 }}>

        {/* Phase banner */}
        {(isExecuting || isPolling) && (
          <div style={{
            borderRadius: 12, padding: '12px 16px',
            background: isPolling ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)',
            border: `1px solid ${isPolling ? '#f59e0b30' : '#3b82f630'}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Spinner size="sm" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: isPolling ? '#f59e0b' : '#3b82f6' }}>
                {phaseLabels[phase] ?? 'Executing...'}
              </div>
              {isPolling && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {pendingCount} limit order{pendingCount !== 1 ? 's' : ''} pending — polling every 30s
                </div>
              )}
            </div>
          </div>
        )}

        {/* Completion banner */}
        {(isComplete || (isPolling && pendingCount === 0)) && (() => {
          const skippedCount = trades.filter(t => t.status === 'skipped').length;
          const authExpired = trades.some(t => t.error?.includes('session expired') || t.error?.includes('re-login') || t.error?.includes('AUTH_EXPIRED'));
          const allOk = failCount === 0 && cancelledCount === 0;
          return (
            <div style={{
              borderRadius: 12, padding: 14, textAlign: 'center',
              background: allOk ? 'rgba(0,200,83,0.12)' : failCount === trades.length ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: allOk ? '#00c853' : failCount === trades.length ? '#ef4444' : '#f59e0b' }}>
                {allOk ? '✅ All Trades Executed' : failCount === trades.length ? '❌ All Trades Failed' : `⚠️ ${successCount}/${trades.length} Executed`}
              </div>
              <div className="mono" style={{ fontSize: 13, marginTop: 4, color: 'var(--text-secondary)' }}>
                {successCount} filled · {failCount} failed · {skippedCount} skipped · {cancelledCount} cancelled
              </div>
              {authExpired && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid #ef444430' }}>
                  <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>🔒 Session expired</div>
                  <button
                    onClick={() => { window.location.href = '/api/auth/login'; }}
                    style={{
                      padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid #3b82f630',
                      cursor: 'pointer',
                    }}
                  >
                    🔑 Re-login to eToro
                  </button>
                </div>
              )}
              {failCount > 0 && !authExpired && (
                <div style={{ marginTop: 8 }}>
                  <button onClick={onExecute} style={{
                    padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid #3b82f630',
                    cursor: 'pointer',
                  }}>
                    🔄 Retry Failed Trades
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Pre-flight (idle) */}
        {isIdle && plan && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
              TRADE PLAN ({displayTrades.length} trades)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {[
                { ok: displayTrades.length > 0, label: `${displayTrades.length} trades planned`, detail: `${closeTrades.length} sells → ${buyTrades.length} buys` },
                { ok: cashSufficient, label: cashSufficient ? 'Cash sufficient' : 'Insufficient cash', detail: `Need ${formatCurrency(totalBuyAmount)}, available ${formatCurrency(cashAvailable)}` },
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

            <div style={{
              padding: '8px 10px', borderRadius: 8, fontSize: 11, color: 'var(--text-tertiary)',
              background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)',
            }}>
              📋 Closes execute first (freeing cash). If a market is closed, a limit order is placed at last price ±0.3% buffer. Buys start after closes complete.
            </div>
          </div>
        )}

        {/* Grouped trade lists */}
        {closeTrades.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>
              PHASE 1 — CLOSE ({closeTrades.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {closeTrades.map((t, i) => (
                <TradeCard key={`close-${i}`} trade={t} onCancel={onCancelOrder} />
              ))}
            </div>
          </div>
        )}

        {buyTrades.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>
              PHASE 2 — BUY ({buyTrades.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {buyTrades.map((t, i) => (
                <TradeCard key={`buy-${i}`} trade={t} onCancel={onCancelOrder} />
              ))}
            </div>
          </div>
        )}

        {displayTrades.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spinner size="lg" />
            <div style={{ fontSize: 13, marginTop: 8, color: 'var(--text-secondary)' }}>Preparing trades...</div>
          </div>
        )}

        {/* Advanced Settings */}
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
                <SliderSetting label="Drift threshold" value={driftThreshold} unit="%" min={2} max={15} step={1} onChange={onDriftThresholdChange} />
                <SliderSetting label="Max position weight" value={maxPositionWeight} unit="%" min={10} max={50} step={5} onChange={onMaxPositionWeightChange} />
                <SliderSetting label="Slippage tolerance" value={slippageTolerance} unit="%" min={0.1} max={2} step={0.1} onChange={onSlippageToleranceChange} />
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

      {(isComplete || (isPolling && pendingCount === 0)) && (
        <BottomBar>
          <Button onClick={onViewResults} className="w-full" size="lg">
            View Results →
          </Button>
        </BottomBar>
      )}
    </div>
  );
}

function TradeCard({ trade: t, onCancel }: { trade: TradeProgress; onCancel?: (id: number) => void }) {
  return (
    <div style={{ borderRadius: 10, padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Badge variant={actionVariant(t.action)}>{actionLabel(t.action)}</Badge>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{t.symbol}</span>
          {t.orderType === 'limit' && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>LIMIT</span>
          )}
        </div>
        <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
        <span className="mono">{formatCurrency('actualAmount' in t && t.actualAmount ? t.actualAmount : t.amount)}</span>
        <span>{t.reason}</span>
      </div>
      {t.limitRate && (
        <div style={{ fontSize: 10, marginTop: 3, color: '#f59e0b' }}>
          Limit @ {t.limitRate.toFixed(2)} (±0.3% buffer)
        </div>
      )}
      {t.error && (
        <div style={{ fontSize: 11, marginTop: 4, color: '#ef4444' }}>{t.error}</div>
      )}
      {t.status === 'limit-pending' && t.orderId && onCancel && (
        <button
          onClick={() => onCancel(t.orderId!)}
          style={{
            marginTop: 6, padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid #ef444430',
            cursor: 'pointer',
          }}
        >
          Cancel Order
        </button>
      )}
    </div>
  );
}

function SliderSetting({ label, value, unit, min, max, step, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="mono" style={{ color: '#00c853', fontWeight: 600 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#00c853' }} />
    </div>
  );
}
