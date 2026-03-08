import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { Spinner } from '../shared/Spinner';
import { BottomBar } from '../layout/BottomBar';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/format';
import type { InstrumentValidation, RebalancePlan } from '../../types/rebalancer';

interface ValidationStepProps {
  validations: InstrumentValidation[];
  isValidating: boolean;
  plan: RebalancePlan | null;
  canExecute: boolean;
  onValidate: () => void;
  onExecute: () => void;
}

export function ValidationStep({
  validations,
  isValidating,
  plan,
  canExecute,
  onValidate,
  onExecute,
}: ValidationStepProps) {
  const counts = {
    valid: validations.filter((v) => v.status === 'valid').length,
    warning: validations.filter((v) => v.status === 'warning').length,
    error: validations.filter((v) => v.status === 'error').length,
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {validations.length === 0 && !isValidating && (
          <div className="text-center py-8">
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Validate instruments before execution
            </p>
            <Button onClick={onValidate}>Run Validation</Button>
          </div>
        )}

        {isValidating && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Spinner size="lg" />
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Checking instruments...</p>
          </div>
        )}

        {validations.length > 0 && (
          <>
            {/* Summary */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-lg p-2 text-center" style={{ background: 'rgba(0,200,83,0.12)' }}>
                <div className="mono text-lg font-bold" style={{ color: 'var(--profit)' }}>{counts.valid}</div>
                <div className="text-xs" style={{ color: 'var(--profit)' }}>Valid</div>
              </div>
              <div className="flex-1 rounded-lg p-2 text-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <div className="mono text-lg font-bold" style={{ color: 'var(--warning)' }}>{counts.warning}</div>
                <div className="text-xs" style={{ color: 'var(--warning)' }}>Warning</div>
              </div>
              <div className="flex-1 rounded-lg p-2 text-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <div className="mono text-lg font-bold" style={{ color: 'var(--loss)' }}>{counts.error}</div>
                <div className="text-xs" style={{ color: 'var(--loss)' }}>Error</div>
              </div>
            </div>

            {/* Validation list */}
            <div className="space-y-2">
              {validations.map((v) => (
                <div key={v.symbol} className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{v.symbol}</span>
                      {v.displayName && (
                        <span className="text-xs truncate max-w-[120px]" style={{ color: 'var(--text-secondary)' }}>{v.displayName}</span>
                      )}
                    </div>
                    <Badge variant={v.status === 'valid' ? 'success' : v.status === 'warning' ? 'warning' : 'error'}>
                      {v.status === 'valid' ? 'Ready' : v.status === 'warning' ? 'Warning' : 'Error'}
                    </Badge>
                  </div>
                  {v.error && (
                    <p className="text-xs mt-1" style={{ color: 'var(--loss)' }}>{v.error}</p>
                  )}
                  {v.status === 'warning' && !v.isOpen && (
                    <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>Market currently closed</p>
                  )}
                </div>
              ))}
            </div>

            {/* Execution plan preview */}
            {plan && (
              <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Execution Plan</h3>
                <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {plan.fullCloses.length > 0 && (
                    <div>Close {plan.fullCloses.length} position(s) — est. <span className="mono">{formatCurrency(plan.estimatedCashFromCloses - plan.partialCloses.reduce((s, t) => s + t.amount, 0))}</span></div>
                  )}
                  {plan.partialCloses.length > 0 && (
                    <div>Reduce {plan.partialCloses.length} position(s) — est. <span className="mono">{formatCurrency(plan.partialCloses.reduce((s, t) => s + t.amount, 0))}</span></div>
                  )}
                  {plan.opens.length > 0 && (
                    <div>Open {plan.opens.length} position(s) — est. <span className="mono">{formatCurrency(plan.estimatedCashNeeded)}</span></div>
                  )}
                  <div className="pt-1 mt-1 font-medium" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    Cash after: <span className="mono">~{formatCurrency(plan.estimatedCashAfter)}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {validations.length > 0 && (
        <BottomBar>
          <div className="space-y-2">
            <Button
              onClick={onExecute}
              disabled={!canExecute}
              className="w-full"
              size="lg"
              variant={canExecute ? 'primary' : 'secondary'}
            >
              {canExecute ? 'Execute Rebalance' : 'Cannot Execute (Errors)'}
            </Button>
            <Button onClick={onValidate} variant="ghost" className="w-full" size="sm">
              Re-validate
            </Button>
          </div>
        </BottomBar>
      )}
    </div>
  );
}
