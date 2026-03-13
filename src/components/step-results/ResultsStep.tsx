'use client';
import { useState } from 'react';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { BottomBar } from '../layout/BottomBar';
import { formatCurrency, formatWeight } from '../../utils/format';
import { PIE_COLORS, CASH_COLOR } from '../../constants/steps';
import type { PortfolioAnalysis, ExecutionSummary, TargetAllocation, OptimizationMethod } from '../../types/rebalancer';

interface ResultsStepProps {
  before: PortfolioAnalysis | null;
  after: PortfolioAnalysis | null;
  summary: ExecutionSummary | null;
  onReset: () => void;
  policyFrequency: 'monthly' | 'quarterly' | 'notify' | 'manual';
  onPolicyChange: (freq: 'monthly' | 'quarterly' | 'notify' | 'manual') => void;
  targetAllocations?: TargetAllocation[];
  optimizationMethod?: OptimizationMethod;
  riskLevel?: 1 | 2 | 3 | 4 | 5;
  driftThreshold?: number;
  accountType?: 'demo' | 'real';
}

const POLICY_OPTIONS = [
  { value: 'monthly' as const, label: 'Rebalance Monthly', desc: 'Recommended — keep allocations tight', icon: '📅', recommended: true },
  { value: 'quarterly' as const, label: 'Rebalance Quarterly', desc: 'Less frequent, lower costs', icon: '📆', recommended: false },
  { value: 'notify' as const, label: 'Notify on Drift', desc: 'Alert when positions drift >5%', icon: '🔔', recommended: false },
  { value: 'manual' as const, label: 'Manual Only', desc: 'I\'ll rebalance myself', icon: '✋', recommended: false },
];

export function ResultsStep({
  before, after, summary, onReset, policyFrequency, onPolicyChange,
  targetAllocations, optimizationMethod, riskLevel, driftThreshold, accountType,
}: ResultsStepProps) {
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);

  const activatePolicy = async () => {
    if (!targetAllocations?.length) {
      setPolicyConfirmed(true);
      return;
    }

    setPolicyLoading(true);
    setPolicyError(null);
    try {
      const mode = policyFrequency === 'notify' ? 'drift' as const
        : policyFrequency === 'manual' ? 'scheduled' as const
        : 'both' as const;

      const scheduleMap: Record<string, any> = {
        monthly: { frequency: 'monthly', dayOfMonth: 1, hour: 8, minute: 0 },
        quarterly: { frequency: 'quarterly', dayOfMonth: 1, hour: 8, minute: 0 },
      };

      const res = await fetch('/api/policies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAllocations,
          optimizationMethod: optimizationMethod ?? 'equal-weight',
          riskLevel: riskLevel ?? 3,
          mode,
          schedule: scheduleMap[policyFrequency] ?? undefined,
          driftThreshold: driftThreshold ?? 0.05,
          accountType: accountType ?? 'demo',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      setPolicyConfirmed(true);
    } catch (e: any) {
      setPolicyError(e.message);
    } finally {
      setPolicyLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto" style={{ paddingBottom: 80 }}>

        {/* Execution Summary Banner */}
        {summary && (
          <div style={{
            background: 'linear-gradient(135deg, #141420 0%, #1a2a1a 100%)',
            borderRadius: 16, padding: 16, border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 10 }}>EXECUTION SUMMARY</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
              <div style={{ borderRadius: 8, padding: '8px 4px', background: 'rgba(0,200,83,0.12)' }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: '#00c853' }}>{summary.successful}</div>
                <div style={{ fontSize: 10, color: '#00c853' }}>Success</div>
              </div>
              <div style={{ borderRadius: 8, padding: '8px 4px', background: 'rgba(239,68,68,0.12)' }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{summary.failed}</div>
                <div style={{ fontSize: 10, color: '#ef4444' }}>Failed</div>
              </div>
              <div style={{ borderRadius: 8, padding: '8px 4px', background: 'var(--bg-input)' }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-secondary)' }}>{summary.skipped}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Skipped</div>
              </div>
            </div>
            {summary.totalFeesEstimate > 0 && (
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Estimated spread cost: {formatCurrency(summary.totalFeesEstimate)}
              </div>
            )}
          </div>
        )}

        {/* Before / After comparison */}
        {before && after && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 6 }}>BEFORE</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(before.totalValue)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{before.holdings.length} holdings</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cash: {formatCurrency(before.availableCash)}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 12, border: '1px solid #00c85340' }}>
              <div style={{ fontSize: 10, color: '#00c853', fontWeight: 600, marginBottom: 6 }}>AFTER</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(after.totalValue)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{after.holdings.length} holdings</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cash: {formatCurrency(after.availableCash)}</div>
            </div>
          </div>
        )}

        {/* Current Portfolio */}
        {after && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>CURRENT PORTFOLIO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...after.holdings].sort((a, b) => b.weight - a.weight).map((h, i) => (
                <div key={h.instrumentId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, width: 50, color: 'var(--text-primary)' }}>{h.symbol}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--bg-input)' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${h.weight * 100}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  </div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, width: 42, textAlign: 'right', color: 'var(--text-secondary)' }}>{formatWeight(h.weight)}</span>
                </div>
              ))}
              {after.availableCash > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: CASH_COLOR, flexShrink: 0 }} />
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, width: 50, color: 'var(--text-primary)' }}>CASH</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--bg-input)' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${after.cashWeight * 100}%`, backgroundColor: CASH_COLOR }} />
                  </div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, width: 42, textAlign: 'right', color: 'var(--text-secondary)' }}>{formatWeight(after.cashWeight)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trade Log */}
        {summary && summary.trades.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>TRADE LOG</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {summary.trades.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < summary.trades.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Badge variant={t.status === 'success' ? 'success' : t.status === 'failed' ? 'error' : 'neutral'}>
                      {t.action === 'buy' ? 'Buy' : t.action === 'full-close' ? 'Close' : 'Reduce'}
                    </Badge>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.symbol}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatCurrency(t.actualAmount ?? t.amount)}</span>
                    {t.status === 'failed' && t.error && <span style={{ fontSize: 10, color: '#ef4444' }}>{t.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Policy Activation */}
        <div style={{ background: 'linear-gradient(135deg, #141420 0%, #1a1a2e 100%)', borderRadius: 16, padding: 16, border: '1px solid #6366f140' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            🤖 Keep your portfolio optimized?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Set a rebalancing schedule to maintain your target allocation automatically.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {POLICY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onPolicyChange(opt.value); setPolicyConfirmed(false); }}
                style={{
                  width: '100%', textAlign: 'left', borderRadius: 10, padding: '10px 12px',
                  background: policyFrequency === opt.value ? 'rgba(99,102,241,0.15)' : 'var(--bg-card)',
                  border: `1.5px solid ${policyFrequency === opt.value ? '#6366f1' : 'var(--border)'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{opt.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: policyFrequency === opt.value ? '#a5b4fc' : 'var(--text-primary)' }}>
                        {opt.label}
                      </span>
                      {opt.recommended && <Badge variant="success">Recommended</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{opt.desc}</div>
                  </div>
                  {policyFrequency === opt.value && <span style={{ color: '#6366f1', fontSize: 16 }}>✓</span>}
                </div>
              </button>
            ))}
          </div>
          {policyFrequency !== 'manual' && !policyConfirmed && (
            <button
              onClick={activatePolicy}
              disabled={policyLoading}
              style={{
                width: '100%', marginTop: 10, padding: '10px', borderRadius: 10,
                background: policyLoading ? '#6366f180' : '#6366f1', color: '#fff', border: 'none', cursor: policyLoading ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {policyLoading ? 'Activating...' : `Activate ${policyFrequency === 'notify' ? 'Drift Alerts' : `${policyFrequency.charAt(0).toUpperCase() + policyFrequency.slice(1)} Rebalancing`}`}
            </button>
          )}
          {policyError && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid #ef444440', fontSize: 12, color: '#ef4444', textAlign: 'center' }}>
              ❌ {policyError}
            </div>
          )}
          {policyConfirmed && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(0,200,83,0.12)', border: '1px solid #00c85340', fontSize: 12, color: '#00c853', textAlign: 'center' }}>
              ✅ {policyFrequency === 'notify' ? 'Drift monitoring' : `${policyFrequency.charAt(0).toUpperCase() + policyFrequency.slice(1)} rebalancing`} activated — your portfolio will be automatically maintained
            </div>
          )}
        </div>
      </div>

      <BottomBar>
        <Button onClick={onReset} className="w-full" size="lg">
          Done
        </Button>
      </BottomBar>
    </div>
  );
}
