import { Badge } from '../shared/Badge';
import { Spinner } from '../shared/Spinner';
import { BottomBar } from '../layout/BottomBar';
import { Button } from '../shared/Button';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/format';
import { EXECUTION_PHASES } from '../../constants/steps';
import type { TradeProgress, ExecutionPhase } from '../../types/rebalancer';

interface ExecutionStepProps {
  trades: TradeProgress[];
  phase: ExecutionPhase;
  onViewResults: () => void;
  onExecute?: () => void;
}

const statusVariant = (s: TradeProgress['status']) => {
  if (s === 'success') return 'success';
  if (s === 'failed') return 'error';
  if (s === 'executing') return 'info';
  if (s === 'skipped') return 'warning';
  return 'neutral';
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

export function ExecutionStep({ trades, phase, onViewResults, onExecute }: ExecutionStepProps) {
  const isIdle = phase === 'idle';
  const isComplete = phase === 'complete' || phase === 'failed';
  const isExecuting = !isIdle && !isComplete;
  const successCount = trades.filter((t) => t.status === 'success').length;
  const failCount = trades.filter((t) => t.status === 'failed').length;

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {/* Phase indicator */}
        <div className="flex gap-2">
          {EXECUTION_PHASES.map((p) => {
            const isActive = phase === p.id;
            const isPast = (
              (p.id === 'closing' && (phase === 'partial-closing' || phase === 'opening' || phase === 'complete')) ||
              (p.id === 'partial-closing' && (phase === 'opening' || phase === 'complete'))
            );
            return (
              <div
                key={p.id}
                className={cn('flex-1 rounded-lg p-2 text-center text-xs transition-colors')}
                style={{
                  background: isActive ? 'rgba(59,130,246,0.12)' : isPast ? 'rgba(0,200,83,0.12)' : 'var(--bg-card)',
                  color: isActive ? 'var(--blue)' : isPast ? 'var(--profit)' : 'var(--text-secondary)',
                  border: isActive ? '1px solid var(--blue)' : '1px solid var(--border)',
                }}
              >
                <div className="font-medium">{p.title}</div>
              </div>
            );
          })}
        </div>

        {!isComplete && trades.some((t) => t.status === 'executing') && (
          <div className="flex items-center justify-center gap-2 py-2">
            <Spinner size="sm" />
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Executing trades...</span>
          </div>
        )}

        {isComplete && (
          <div className={cn('rounded-lg p-3 text-center')}
            style={{
              background: phase === 'complete' ? 'rgba(0,200,83,0.12)' : 'rgba(239,68,68,0.12)',
            }}
          >
            <div className={cn('text-lg font-bold')} 
              style={{ color: phase === 'complete' ? 'var(--profit)' : 'var(--loss)' }}
            >
              {phase === 'complete' ? 'Execution Complete' : 'Execution Failed'}
            </div>
            <div className="mono text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {successCount} succeeded, {failCount} failed
            </div>
          </div>
        )}

        {/* Trade list */}
        <div className="space-y-2">
          {trades.map((t, i) => (
            <div key={i} className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant={t.action === 'buy' ? 'info' : t.action === 'full-close' ? 'error' : 'warning'}>
                    {actionLabel(t.action)}
                  </Badge>
                  <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{t.symbol}</span>
                </div>
                <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
              </div>
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="mono">{formatCurrency(t.actualAmount ?? t.amount)}</span>
                <span>{t.reason}</span>
              </div>
              {t.error && (
                <p className="text-xs mt-1" style={{ color: 'var(--loss)' }}>{t.error}</p>
              )}
            </div>
          ))}

          {trades.length === 0 && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Spinner size="lg" />
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Preparing trades...</p>
            </div>
          )}
        </div>
      </div>

      {isIdle && onExecute && trades.length > 0 && (
        <BottomBar>
          <Button onClick={onExecute} className="w-full" size="lg">
            Confirm &amp; Execute {trades.length} Trade{trades.length !== 1 ? 's' : ''}
          </Button>
        </BottomBar>
      )}

      {isComplete && (
        <BottomBar>
          <Button onClick={onViewResults} className="w-full" size="lg">
            View Results
          </Button>
        </BottomBar>
      )}
    </div>
  );
}
