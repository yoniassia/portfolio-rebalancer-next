'use client';
import { useState } from 'react';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { Spinner } from '../shared/Spinner';
import { BottomBar } from '../layout/BottomBar';
import { cn } from '../../utils/cn';
import { formatWeight } from '../../utils/format';
import { PIE_COLORS } from '../../constants/steps';
import type { OptimizationMethod, OptimizationResult } from '../../types/rebalancer';

interface OptimizeStepProps {
  onOptimize: (method: OptimizationMethod, params: Record<string, number>) => Promise<OptimizationResult>;
  onApplyResult: (result: OptimizationResult) => void;
  onSkip: () => void;
  isOptimizing: boolean;
  progress: { phase: string; current: number; total: number } | null;
  result: OptimizationResult | null;
  holdingCount: number;
}

const RISK_LEVELS = [
  { level: 1, label: 'Very Low', desc: 'Conservative, minimum variance', method: 'min-variance' as OptimizationMethod, vol: '5-10%', params: { maxWeight: 0.15 } },
  { level: 2, label: 'Low', desc: 'Cautious, risk parity', method: 'risk-parity' as OptimizationMethod, vol: '8-14%', params: { maxWeight: 0.20 } },
  { level: 3, label: 'Moderate', desc: 'Balanced, risk parity', method: 'risk-parity' as OptimizationMethod, vol: '12-18%', params: { maxWeight: 0.25 } },
  { level: 4, label: 'High', desc: 'Growth oriented, mean-variance', method: 'mvo' as OptimizationMethod, vol: '16-24%', params: { riskAversion: 1.5, maxWeight: 0.30 } },
  { level: 5, label: 'Very High', desc: 'Aggressive, mean-variance', method: 'mvo' as OptimizationMethod, vol: '22-35%', params: { riskAversion: 0.5, maxWeight: 0.40 } },
];

const METHODS = [
  { id: 'equal-weight' as OptimizationMethod, label: 'Equal Weight', desc: 'Distribute equally across all assets' },
  { id: 'min-variance' as OptimizationMethod, label: 'Min Variance', desc: 'Minimize portfolio volatility' },
  { id: 'risk-parity' as OptimizationMethod, label: 'Risk Parity', desc: 'Equal risk contribution per asset' },
  { id: 'mvo' as OptimizationMethod, label: 'Mean-Variance', desc: 'Maximize risk-adjusted returns' },
];

export function OptimizeStep({
  onOptimize,
  onApplyResult,
  onSkip,
  isOptimizing,
  progress,
  result,
  holdingCount,
}: OptimizeStepProps) {
  const [tab, setTab] = useState<'simple' | 'advanced'>('simple');
  const [riskLevel, setRiskLevel] = useState<number>(3);
  const [selectedMethod, setSelectedMethod] = useState<OptimizationMethod>('risk-parity');
  const [advMaxWeight, setAdvMaxWeight] = useState(25);

  const canOptimize = holdingCount >= 2;

  const handleOptimize = () => {
    if (tab === 'simple') {
      const risk = RISK_LEVELS[riskLevel - 1]!;
      const params: Record<string, number> = {};
      for (const [k, v] of Object.entries(risk.params)) {
        if (v !== undefined) params[k] = v;
      }
      onOptimize(risk.method, params);
    } else {
      const params: Record<string, number> = { maxWeight: advMaxWeight / 100 };
      onOptimize(selectedMethod, params);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {!canOptimize && (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>
            <span className="font-medium">Optimizer requires 5+ instruments.</span>{' '}
            You have {holdingCount}. You can skip to set targets manually.
          </div>
        )}

        {/* Tab selector */}
        <div className="flex rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', padding: 4, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setTab('simple')}
            className={cn('flex-1 py-2 text-sm font-medium transition-colors rounded-lg')}
            style={{
              background: tab === 'simple' ? 'var(--accent)' : 'transparent',
              color: tab === 'simple' ? '#000' : 'var(--text-secondary)',
            }}
          >
            Simple
          </button>
          <button
            onClick={() => setTab('advanced')}
            className={cn('flex-1 py-2 text-sm font-medium transition-colors rounded-lg')}
            style={{
              background: tab === 'advanced' ? 'var(--accent)' : 'transparent',
              color: tab === 'advanced' ? '#000' : 'var(--text-secondary)',
            }}
          >
            Advanced
          </button>
        </div>

        {/* Simple mode */}
        {tab === 'simple' && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Select Risk Level</h3>
            {RISK_LEVELS.map((r) => (
              <button
                key={r.level}
                onClick={() => setRiskLevel(r.level)}
                disabled={!canOptimize}
                className={cn('w-full text-left rounded-lg p-3 transition-colors')}
                style={{
                  border: riskLevel === r.level ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: riskLevel === r.level ? 'rgba(0,200,83,0.12)' : 'var(--bg-card)',
                  opacity: !canOptimize ? 0.5 : 1,
                  cursor: !canOptimize ? 'not-allowed' : 'pointer',
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{r.label}</span>
                      <Badge variant={r.level <= 2 ? 'success' : r.level === 3 ? 'info' : 'warning'}>
                        Level {r.level}
                      </Badge>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{r.desc}</p>
                  </div>
                  <span className="mono text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>Vol: {r.vol}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Advanced mode */}
        {tab === 'advanced' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Methodology</h3>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMethod(m.id)}
                    disabled={!canOptimize}
                    className={cn('text-left rounded-lg p-3 transition-colors')}
                    style={{
                      border: selectedMethod === m.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: selectedMethod === m.id ? 'rgba(0,200,83,0.12)' : 'var(--bg-card)',
                      opacity: !canOptimize ? 0.5 : 1,
                      cursor: !canOptimize ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{m.label}</div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {selectedMethod !== 'equal-weight' && (
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Max Weight per Asset: <span className="mono">{advMaxWeight}%</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={50}
                  value={advMaxWeight}
                  onChange={(e) => setAdvMaxWeight(Number(e.target.value))}
                  disabled={!canOptimize}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div className="flex justify-between text-xs mono" style={{ color: 'var(--text-secondary)' }}>
                  <span>5%</span>
                  <span>50%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optimize button */}
        {!result && (
          <Button
            onClick={handleOptimize}
            loading={isOptimizing}
            disabled={!canOptimize || isOptimizing}
            className="w-full"
          >
            {isOptimizing ? 'Optimizing...' : 'Optimize Portfolio'}
          </Button>
        )}

        {/* Progress */}
        {isOptimizing && progress && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{progress.phase}</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: 'var(--bg-input)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ 
                  width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
            <p className="mono text-xs text-right" style={{ color: 'var(--text-secondary)' }}>
              {progress.current}/{progress.total}
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <div className="rounded-lg p-3" style={{ border: '1px solid var(--accent)', background: 'var(--bg-card)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="success">Optimized</Badge>
                <span className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>
                  {result.method.replace('-', ' ')}
                </span>
              </div>

              {/* Weight bars */}
              <div className="space-y-1.5 mb-3">
                {result.symbols.map((sym, i) => (
                  <div key={sym} className="flex items-center gap-2 text-xs">
                    <div className="mono w-12 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{sym}</div>
                    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${result.weights[i]! * 100}%`,
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                    </div>
                    <div className="mono w-12" style={{ color: 'var(--text-secondary)' }}>{formatWeight(result.weights[i]!)}</div>
                  </div>
                ))}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded p-2" style={{ background: 'var(--bg-input)' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>Expected Return</div>
                  <div className="mono font-medium" style={{ color: 'var(--text-primary)' }}>{(result.metrics.expectedReturn * 100).toFixed(1)}%</div>
                </div>
                <div className="rounded p-2" style={{ background: 'var(--bg-input)' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>Volatility</div>
                  <div className="mono font-medium" style={{ color: 'var(--text-primary)' }}>{(result.metrics.expectedVolatility * 100).toFixed(1)}%</div>
                </div>
                <div className="rounded p-2" style={{ background: 'var(--bg-input)' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>Sharpe Ratio</div>
                  <div className="mono font-medium" style={{ color: 'var(--text-primary)' }}>{result.metrics.sharpeRatio.toFixed(2)}</div>
                </div>
                <div className="rounded p-2" style={{ background: 'var(--bg-input)' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>Diversification</div>
                  <div className="mono font-medium" style={{ color: 'var(--text-primary)' }}>{result.metrics.diversificationRatio.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomBar>
        <div className="space-y-2">
          {result && (
            <Button
              onClick={() => onApplyResult(result)}
              className="w-full"
              size="lg"
            >
              Apply & Continue
            </Button>
          )}
          <button
            onClick={onSkip}
            className="w-full text-center text-sm py-1"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Skip Optimization
          </button>
        </div>
      </BottomBar>
    </div>
  );
}
