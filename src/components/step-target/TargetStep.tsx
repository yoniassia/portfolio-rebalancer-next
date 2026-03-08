'use client';
import { useRef } from 'react';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { SearchInput } from '../shared/SearchInput';
import { BottomBar } from '../layout/BottomBar';
import { cn } from '../../utils/cn';
import { formatWeight } from '../../utils/format';
import { parseCsv, generateCsv, generateTemplateCsv, downloadFile } from '../../utils/csv';
import { PIE_COLORS, CASH_COLOR } from '../../constants/steps';
import type { TargetAllocation } from '../../types/rebalancer';

interface TargetStepProps {
  allocations: TargetAllocation[];
  onUpdateWeight: (index: number, weight: number) => void;
  onRemove: (index: number) => void;
  onAdd: (allocation: TargetAllocation) => void;
  onImportCsv: (allocations: TargetAllocation[]) => void;
  onEqualize: () => void;
  onNext: () => void;
  onSearch: (query: string) => Promise<{ symbol: string; displayName: string; instrumentId: number }[]>;
  totalWeight: number;
  canProceed: boolean;
}

export function TargetStep({
  allocations,
  onUpdateWeight,
  onRemove,
  onAdd,
  onImportCsv,
  onEqualize,
  onNext,
  onSearch,
  totalWeight,
  canProceed,
}: TargetStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const weightOk = Math.abs(totalWeight - 1) < 0.005;
  const nonCash = allocations.filter((a) => !a.isCash);
  const cashAlloc = allocations.find((a) => a.isCash);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { allocations: parsed, errors } = parseCsv(text);
      if (errors.length > 0) {
        alert('CSV errors:\n' + errors.join('\n'));
        return;
      }
      onImportCsv(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const csv = generateCsv(allocations);
    downloadFile(csv, 'target-allocations.csv');
  };

  const handleTemplate = () => {
    const csv = generateTemplateCsv();
    downloadFile(csv, 'allocation-template.csv');
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {/* Total weight indicator */}
        <div className={cn('rounded-lg p-3 text-sm flex items-center justify-between')}
          style={{
            background: weightOk ? 'rgba(0,200,83,0.12)' : 'rgba(239,68,68,0.12)',
            color: weightOk ? 'var(--profit)' : 'var(--loss)',
          }}
        >
          <span>Total Allocation</span>
          <span className="mono font-bold">{formatWeight(totalWeight)}</span>
        </div>

        {/* Search */}
        <SearchInput
          onSearch={onSearch}
          onSelect={(r) => onAdd({ symbol: r.symbol, displayName: r.displayName, instrumentId: r.instrumentId, weight: 0, isCash: false })}
          placeholder="Search by symbol or name..."
        />

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={onEqualize}>
            Equalize
          </Button>
          <Button size="sm" variant="secondary" onClick={handleExport}>
            Export CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Import CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={handleTemplate}>
            Template
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            className="hidden"
          />
        </div>

        {/* Allocations */}
        <div className="space-y-2">
          {nonCash.map((alloc, idx) => {
            const realIdx = allocations.indexOf(alloc);
            const colorIdx = idx % PIE_COLORS.length;
            return (
              <div key={`${alloc.symbol}-${realIdx}`} className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[colorIdx] }} />
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{alloc.symbol}</span>
                    {alloc.displayName && (
                      <span className="text-xs truncate max-w-[100px]" style={{ color: 'var(--text-secondary)' }}>{alloc.displayName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-sm font-medium w-14 text-right" style={{ color: 'var(--text-primary)' }}>
                      {formatWeight(alloc.weight)}
                    </span>
                    <button
                      onClick={() => onRemove(realIdx)}
                      className="p-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--loss)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                      aria-label={`Remove ${alloc.symbol}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={alloc.weight * 100}
                  onChange={(e) => onUpdateWeight(realIdx, Number(e.target.value) / 100)}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
              </div>
            );
          })}

          {/* Cash row */}
          {cashAlloc && (
            <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CASH_COLOR }} />
                  <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>CASH</span>
                </div>
                <span className="mono text-sm font-medium w-14 text-right" style={{ color: 'var(--text-primary)' }}>
                  {formatWeight(cashAlloc.weight)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={cashAlloc.weight * 100}
                onChange={(e) => {
                  const idx = allocations.indexOf(cashAlloc);
                  onUpdateWeight(idx, Number(e.target.value) / 100);
                }}
                className="w-full"
                style={{ accentColor: 'var(--text-tertiary)' }}
              />
            </div>
          )}

          {allocations.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Add instruments using the search above or import a CSV file
            </div>
          )}
        </div>
      </div>

      <BottomBar>
        <Button onClick={onNext} disabled={!canProceed} className="w-full" size="lg">
          {canProceed ? 'Validate Instruments' : `Weight: ${formatWeight(totalWeight)} (need 100%)`}
        </Button>
      </BottomBar>
    </div>
  );
}
