import { Badge } from '../shared/Badge';
import { Button } from '../shared/Button';
import { BottomBar } from '../layout/BottomBar';
import { formatCurrency, formatWeight, formatPnl } from '../../utils/format';
import { cn } from '../../utils/cn';
import { PIE_COLORS, CASH_COLOR } from '../../constants/steps';
import type { PortfolioAnalysis } from '../../types/rebalancer';

interface PortfolioStepProps {
  portfolio: PortfolioAnalysis;
  onNext: () => void;
  isDemo: boolean;
}

const SummaryCard = ({ label, value, valueColor, sub, subColor }: { label: string; value: string; valueColor?: string; sub?: string; subColor?: string }) => (
  <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '10px 12px', border: '1px solid var(--border)' }}>
    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: valueColor || 'var(--text-primary)' }}>{value}</div>
    {sub && <div className="mono" style={{ fontSize: 10, color: subColor || 'var(--text-tertiary)', marginTop: 1 }}>{sub}</div>}
  </div>
);

export function PortfolioStep({ portfolio, onNext, isDemo }: PortfolioStepProps) {
  const sorted = [...portfolio.holdings].sort((a, b) => b.weight - a.weight);
  const totalPnl = portfolio.holdings.reduce((s, h) => s + h.pnl, 0);
  const pnl = formatPnl(totalPnl);
  const hasEnoughForOptimizer = portfolio.holdings.length >= 2;
  const pnlColor = totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)';
  const pnlPct = portfolio.investedValue ? `${totalPnl >= 0 ? '+' : ''}${((totalPnl / portfolio.investedValue) * 100).toFixed(1)}%` : '';

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {isDemo && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>
            Demo mode — showing simulated portfolio data
          </div>
        )}

        {/* Summary Cards Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <SummaryCard label="AVAILABLE" value={formatCurrency(portfolio.availableCash)} />
          <SummaryCard label="INVESTED" value={formatCurrency(portfolio.investedValue)} />
          <SummaryCard 
            label="P&L" 
            value={pnl.text} 
            valueColor={pnlColor} 
            sub={pnlPct} 
            subColor={pnlColor} 
          />
        </div>

        {/* Equity Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #141420 0%, #1a2a1a 100%)',
          borderRadius: 16,
          padding: '14px 16px',
          border: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 1 }}>PORTFOLIO VALUE</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>{formatCurrency(portfolio.totalValue)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Total P&L</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: pnlColor }}>
              {pnl.text}
            </div>
            <div className="mono" style={{ fontSize: 11, color: pnlColor }}>
              {pnlPct}
            </div>
          </div>
        </div>

        {!hasEnoughForOptimizer && (
          <div 
            className="rounded-lg p-4 text-center"
            style={{ 
              background: 'rgba(245,158,11,0.15)', 
              border: '1.5px solid var(--warning)',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--warning)', marginBottom: 4 }}>
              Minimum 2 Securities Required
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Your portfolio has {portfolio.holdings.length} position{portfolio.holdings.length !== 1 ? 's' : ''}. 
              Add at least {2 - portfolio.holdings.length} more to use the rebalancer.
            </div>
          </div>
        )}

        {/* Holdings */}
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Holdings ({sorted.length})</h3>
          <div className="space-y-2">
            {sorted.map((h, i) => {
              const hp = formatPnl(h.pnl);
              const hpColor = h.pnl >= 0 ? 'var(--profit)' : 'var(--loss)';
              return (
                <div 
                  key={h.instrumentId} 
                  className="rounded-lg p-3"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{h.symbol}</span>
                      <span className="text-xs truncate max-w-[120px]" style={{ color: 'var(--text-tertiary)' }}>{h.displayName}</span>
                    </div>
                    <span className="mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatWeight(h.weight)}</span>
                  </div>
                  <div className="h-1.5 rounded-full mb-1.5" style={{ background: 'var(--bg-input)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${h.weight * 100}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="mono" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(h.totalValue)}</span>
                    <span className="mono" style={{ color: hpColor }}>
                      {hp.text}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Cash row */}
            {portfolio.availableCash > 0 && (
              <div 
                className="rounded-lg p-3"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CASH_COLOR }} />
                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>CASH</span>
                  </div>
                  <span className="mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatWeight(portfolio.cashWeight)}</span>
                </div>
                <div className="h-1.5 rounded-full mb-1.5" style={{ background: 'var(--bg-input)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${portfolio.cashWeight * 100}%`, backgroundColor: CASH_COLOR }}
                  />
                </div>
                <div className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {formatCurrency(portfolio.availableCash)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <BottomBar>
        <Button onClick={onNext} className="w-full" size="lg" disabled={!hasEnoughForOptimizer}>
          Continue
        </Button>
      </BottomBar>
    </div>
  );
}
