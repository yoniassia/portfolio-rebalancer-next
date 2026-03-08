import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { BottomBar } from '../layout/BottomBar';
import { cn } from '../../utils/cn';
import { formatCurrency, formatWeight, formatPnl } from '../../utils/format';
import { PIE_COLORS, CASH_COLOR } from '../../constants/steps';
import type { PortfolioAnalysis, ExecutionSummary } from '../../types/rebalancer';

interface ResultsStepProps {
  before: PortfolioAnalysis | null;
  after: PortfolioAnalysis | null;
  summary: ExecutionSummary | null;
  onReset: () => void;
}

export function ResultsStep({ before, after, summary, onReset }: ResultsStepProps) {
  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {/* Summary Banner */}
        {summary && (
          <div style={{
            background: 'linear-gradient(135deg, #141420 0%, #1a2a1a 100%)',
            borderRadius: 16,
            padding: '14px 16px',
            border: '1px solid var(--border)',
          }}>
            <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Execution Summary</h3>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded p-2" style={{ background: 'rgba(0,200,83,0.12)' }}>
                <div className="mono text-lg font-bold" style={{ color: 'var(--profit)' }}>{summary.successful}</div>
                <div style={{ color: 'var(--profit)' }}>Success</div>
              </div>
              <div className="rounded p-2" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <div className="mono text-lg font-bold" style={{ color: 'var(--loss)' }}>{summary.failed}</div>
                <div style={{ color: 'var(--loss)' }}>Failed</div>
              </div>
              <div className="rounded p-2" style={{ background: 'var(--bg-input)' }}>
                <div className="mono text-lg font-bold" style={{ color: 'var(--text-secondary)' }}>{summary.skipped}</div>
                <div style={{ color: 'var(--text-secondary)' }}>Skipped</div>
              </div>
            </div>
          </div>
        )}

        {/* Before / After comparison */}
        {before && after && (
          <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Before vs After</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>Before</div>
                <div className="mono font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(before.totalValue)}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{before.holdings.length} holdings</div>
                <div className="mono" style={{ color: 'var(--text-secondary)' }}>Cash: {formatCurrency(before.availableCash)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>After</div>
                <div className="mono font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(after.totalValue)}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{after.holdings.length} holdings</div>
                <div className="mono" style={{ color: 'var(--text-secondary)' }}>Cash: {formatCurrency(after.availableCash)}</div>
              </div>
            </div>
          </div>
        )}

        {/* After portfolio holdings */}
        {after && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Current Portfolio</h3>
            <div className="space-y-2">
              {[...after.holdings].sort((a, b) => b.weight - a.weight).map((h, i) => (
                <div key={h.instrumentId} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="mono font-medium w-14" style={{ color: 'var(--text-primary)' }}>{h.symbol}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${h.weight * 100}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                  </div>
                  <span className="mono text-xs w-12 text-right" style={{ color: 'var(--text-secondary)' }}>{formatWeight(h.weight)}</span>
                </div>
              ))}
              {after.availableCash > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CASH_COLOR }} />
                  <span className="mono font-medium w-14" style={{ color: 'var(--text-primary)' }}>CASH</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${after.cashWeight * 100}%`, backgroundColor: CASH_COLOR }}
                    />
                  </div>
                  <span className="mono text-xs w-12 text-right" style={{ color: 'var(--text-secondary)' }}>{formatWeight(after.cashWeight)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trade log */}
        {summary && summary.trades.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Trade Log</h3>
            <div className="space-y-1">
              {summary.trades.map((t, i) => (
                <div 
                  key={i} 
                  className="flex items-center justify-between text-xs py-1.5 last:border-0"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={t.status === 'success' ? 'success' : t.status === 'failed' ? 'error' : 'neutral'}
                    >
                      {t.action === 'buy' ? 'Buy' : t.action === 'full-close' ? 'Close' : 'Reduce'}
                    </Badge>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{t.symbol}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(t.actualAmount ?? t.amount)}</span>
                    {t.status === 'failed' && (
                      <span style={{ color: 'var(--loss)' }}>{t.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomBar>
        <Button onClick={onReset} className="w-full" size="lg">
          Start New Rebalance
        </Button>
      </BottomBar>
    </div>
  );
}
