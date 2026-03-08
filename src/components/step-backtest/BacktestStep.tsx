'use client';
import { useState, useEffect } from 'react';
import { useRebalanceStore } from '../../store/rebalance-store';

interface BacktestStepProps {
  onNext: () => void;
  onSkip: () => void;
}

// ===== EquityChart Component (from AgentX) =====
function EquityChart({ data, benchmark }: { data: Array<[number, number]>; benchmark?: Array<[number, number]> }) {
  if (data.length < 2) return null;
  
  const allValues = [...data.map(d => d[1]), ...(benchmark || []).map(d => d[1])];
  const min = Math.min(...allValues) * 0.995;
  const max = Math.max(...allValues) * 1.005;
  const r = max - min || 1;
  const w = 340;
  const h = 120;
  
  const toPath = (points: Array<[number, number]>) => {
    return points.map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p[1] - min) / r) * h;
      return `${x},${y}`;
    }).join(' ');
  };
  
  const strategyPath = toPath(data);
  const isProfit = data[data.length - 1][1] >= data[0][1];

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="gfill-strategy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isProfit ? '#00C853' : '#EF4444'} stopOpacity="0.25" />
          <stop offset="100%" stopColor={isProfit ? '#00C853' : '#EF4444'} stopOpacity="0" />
        </linearGradient>
      </defs>
      {benchmark && (
        <polyline 
          points={toPath(benchmark)} 
          fill="none" 
          stroke="var(--text-tertiary)" 
          strokeWidth="1.5" 
          strokeDasharray="4 2"
          opacity="0.6"
        />
      )}
      <polygon points={`0,${h} ${strategyPath} ${w},${h}`} fill="url(#gfill-strategy)" />
      <polyline points={strategyPath} fill="none" stroke={isProfit ? '#00C853' : '#EF4444'} strokeWidth="2" />
    </svg>
  );
}

// ===== MetricCard Component (from AgentX) =====
function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ===== Main BacktestStep Component =====
export function BacktestStep({ onNext, onSkip }: BacktestStepProps) {
  const { portfolio, targetAllocations, optimizationMethod } = useRebalanceStore();
  
  const [rebalanceFreq, setRebalanceFreq] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly');
  const [period, setPeriod] = useState<'1y' | '3y' | '5y'>('3y');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Build universe from holdings (excluding cash symbols)
      const universe = (portfolio?.holdings || [])
        .map(h => h.symbol)
        .filter(symbol => symbol && symbol !== 'CASH' && symbol !== 'USD')
        .slice(0, 20); // Limit to 20 for performance

      if (universe.length === 0) {
        throw new Error('No holdings to backtest');
      }

      // Map optimization method to goal
      const goalMap: Record<string, string> = {
        'equal-weight': 'balanced',
        'min-variance': 'preserve',
        'risk-parity': 'balanced',
        'mvo': 'maximum',
      };
      const goal = goalMap[optimizationMethod || 'risk-parity'] || 'balanced';

      // Map frequency
      const freqMap: Record<string, string> = {
        'weekly': 'weekly',
        'monthly': 'monthly',
        'quarterly': 'monthly', // Use monthly for quarterly
      };

      const response = await fetch('/api/backtest/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universe,
          goal,
          rebalanceFreq: freqMap[rebalanceFreq],
          period,
          cash: portfolio?.totalValue || 100000,
          stopLoss: 8,
          takeProfit: 16,
          maxPositionPct: 25,
          spread: 0.15,
        }),
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Backtest failed');
      }
      
      const data = await response.json();
      setResults(data);
    } catch (e: any) {
      setError(e.message || 'Failed to run backtest');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>
          Running Backtest...
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Testing your strategy on historical data
        </div>
        <div style={{ marginTop: 20 }}>
          <div style={{ width: 200, height: 3, background: 'var(--border)', margin: '0 auto', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: '60%', height: '100%', background: 'var(--accent)', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        
        {/* Bottom Actions */}
        <div style={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          background: 'var(--bg-primary)', 
          borderTop: '1px solid var(--border)', 
          padding: '16px', 
          maxWidth: '480px', 
          margin: '0 auto' 
        }}>
          <button
            onClick={onSkip}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
              borderRadius: '12px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Skip Backtest
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <div style={{ padding: 16, background: '#EF444420', border: '1px solid #EF4444', borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>⚠️ Backtest Error</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{error}</div>
          <button 
            onClick={runBacktest} 
            style={{ 
              marginTop: 12, 
              padding: '8px 16px', 
              borderRadius: 8, 
              background: 'var(--accent)', 
              color: '#000',
              border: 'none', 
              fontSize: 12, 
              fontWeight: 700, 
              cursor: 'pointer' 
            }}
          >
            Try Again
          </button>
        </div>
        
        {/* Bottom Actions */}
        <div style={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          background: 'var(--bg-primary)', 
          borderTop: '1px solid var(--border)', 
          padding: '16px', 
          maxWidth: '480px', 
          margin: '0 auto' 
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onSkip}
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--bg-input)',
                color: 'var(--text-secondary)',
                borderRadius: '12px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Skip Backtest
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Results state
  if (results) {
    const { summary, equity_curve, benchmark_curve } = results;
    const returnColor = summary.total_return_pct >= 0 ? 'var(--profit)' : 'var(--loss)';

    return (
      <div style={{ paddingBottom: '96px' }}>
        <div style={{ padding: '16px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>
            Backtest Results
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            How your strategy performed over {summary.period}
          </p>

          {/* Equity Curve Chart */}
          {equity_curve && equity_curve.length > 0 && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, textAlign: 'center' }}>
                Portfolio Growth Over Time
              </div>
              <EquityChart data={equity_curve} benchmark={benchmark_curve} />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 16, height: 2, background: returnColor }} />
                  <span>Strategy</span>
                </div>
                {benchmark_curve && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 16, height: 1, background: 'var(--text-tertiary)', borderTop: '1px dashed var(--text-tertiary)' }} />
                    <span>Benchmark</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Summary Card with Returns Comparison */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
            {/* Strategy Return */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Strategy</span>
                <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: returnColor }}>
                  {summary.total_return_pct >= 0 ? '+' : ''}{summary.total_return_pct}%
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min(Math.abs(summary.total_return_pct) * 2, 100)}%`, 
                  height: '100%', 
                  background: returnColor,
                  transition: 'width 0.5s'
                }} />
              </div>
            </div>

            {/* Benchmark Return */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Benchmark</span>
                <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  +{summary.benchmark_return_pct}%
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min(summary.benchmark_return_pct * 2, 100)}%`, 
                  height: '100%', 
                  background: 'var(--text-tertiary)',
                  transition: 'width 0.5s'
                }} />
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <MetricCard 
                label="Alpha" 
                value={`${summary.alpha_pct >= 0 ? '+' : ''}${summary.alpha_pct}%`} 
                color={summary.alpha_pct >= 0 ? 'var(--profit)' : 'var(--loss)'} 
              />
              <MetricCard label="Sharpe" value={summary.sharpe_ratio.toFixed(2)} />
              <MetricCard label="Max DD" value={`${summary.max_drawdown_pct}%`} color="var(--loss)" />
              <MetricCard label="Win Rate" value={`${summary.win_rate_pct}%`} />
            </div>

            {/* Trade Stats */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
              {summary.total_trades} trades · Avg {summary.avg_trade_return_pct >= 0 ? '+' : ''}{summary.avg_trade_return_pct}% · {summary.avg_holding_days}d hold
            </div>
          </div>

          {/* Best/Worst Trades */}
          {summary.best_trade && summary.worst_trade && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 10, border: '1px solid var(--profit)33' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>🏆 Best Trade</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{summary.best_trade.ticker}</div>
                <div className="mono" style={{ fontSize: 16, color: 'var(--profit)', fontWeight: 700 }}>
                  +{summary.best_trade.return_pct}%
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 10, border: '1px solid var(--loss)33' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>📉 Worst Trade</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{summary.worst_trade.ticker}</div>
                <div className="mono" style={{ fontSize: 16, color: 'var(--loss)', fontWeight: 700 }}>
                  {summary.worst_trade.return_pct}%
                </div>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
              ⚠️ Past performance does not guarantee future results. Backtest uses technical factors only and simulates eToro spreads.
            </div>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <div style={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          background: 'var(--bg-primary)', 
          borderTop: '1px solid var(--border)', 
          padding: '16px', 
          maxWidth: '480px', 
          margin: '0 auto' 
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onSkip}
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--bg-input)',
                color: 'var(--text-secondary)',
                borderRadius: '12px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Skip
            </button>
            <button
              onClick={onNext}
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--accent)',
                color: '#000000',
                borderRadius: '12px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Configuration state (initial)
  return (
    <div style={{ paddingBottom: '96px' }}>
      <div style={{ padding: '16px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>
          Backtest Configuration
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Test your strategy on historical data
        </p>

        {/* Rebalance Frequency */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Rebalance Frequency
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {(['weekly', 'monthly', 'quarterly'] as const).map((freq) => (
              <button
                key={freq}
                onClick={() => setRebalanceFreq(freq)}
                style={{
                  padding: '10px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: rebalanceFreq === freq ? 'var(--accent)' : 'var(--bg-card)',
                  color: rebalanceFreq === freq ? '#000' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {freq.charAt(0).toUpperCase() + freq.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Period */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Test Period
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {(['1y', '3y', '5y'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '10px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: period === p ? 'var(--accent)' : 'var(--bg-card)',
                  color: period === p ? '#000' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <button
          onClick={runBacktest}
          style={{
            width: '100%',
            padding: '14px',
            background: 'var(--accent)',
            color: '#000',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Run Backtest
        </button>
      </div>

      {/* Bottom Action Bar */}
      <div style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        background: 'var(--bg-primary)', 
        borderTop: '1px solid var(--border)', 
        padding: '16px', 
        maxWidth: '480px', 
        margin: '0 auto' 
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onSkip}
            style={{
              flex: 1,
              padding: '12px',
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
              borderRadius: '12px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Skip Backtest
          </button>
        </div>
      </div>
    </div>
  );
}
