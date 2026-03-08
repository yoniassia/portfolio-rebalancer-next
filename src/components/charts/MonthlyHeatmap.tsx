import { memo } from 'react';

interface MonthlyHeatmapProps {
  monthlyReturns: { year: number; month: number; benchmarkReturn: number; optimizedReturn: number }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MonthlyHeatmap = memo(function MonthlyHeatmap({ monthlyReturns }: MonthlyHeatmapProps) {
  if (monthlyReturns.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)' }}>
        No monthly data available
      </div>
    );
  }

  // Group by year
  const years = Array.from(new Set(monthlyReturns.map(r => r.year))).sort((a, b) => b - a);
  
  // Build matrix: year -> month -> return
  const matrix = new Map<number, Map<number, number>>();
  for (const row of monthlyReturns) {
    if (!matrix.has(row.year)) {
      matrix.set(row.year, new Map());
    }
    matrix.get(row.year)!.set(row.month, row.optimizedReturn);
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '400px' }}>
        {/* Header (months) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '2px', marginBottom: '4px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono, monospace' }} />
          {MONTHS.map((month) => (
            <div key={month} style={{ fontSize: '9px', color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
              {month}
            </div>
          ))}
        </div>

        {/* Rows (years) */}
        {years.map((year) => (
          <div key={year} style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '2px', marginBottom: '2px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center' }}>
              {year}
            </div>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => {
              const returnVal = matrix.get(year)?.get(month);
              return (
                <div
                  key={month}
                  style={{
                    aspectRatio: '1/1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9px',
                    fontFamily: 'JetBrains Mono, monospace',
                    borderRadius: '4px',
                    backgroundColor: returnVal !== undefined ? getColor(returnVal) : 'var(--bg-input)',
                    color: returnVal !== undefined && Math.abs(returnVal) > 3 ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                  title={returnVal !== undefined ? `${returnVal.toFixed(2)}%` : ''}
                >
                  {returnVal !== undefined ? (
                    <span style={{ opacity: Math.abs(returnVal) < 1 ? 0.7 : 1 }}>
                      {returnVal > 0 ? '+' : ''}{returnVal.toFixed(1)}
                    </span>
                  ) : (
                    <span style={{ opacity: 0.3 }}>—</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '16px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
        <span>-10%</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {[-10, -7, -4, -1, 0, 1, 4, 7, 10].map((val) => (
            <div
              key={val}
              style={{ width: '20px', height: '12px', borderRadius: '2px', backgroundColor: getColor(val) }}
            />
          ))}
        </div>
        <span>+10%</span>
      </div>
    </div>
  );
});

/**
 * Color scale: deep red → light red → neutral → light green → deep green
 */
function getColor(returnPercent: number): string {
  const clamped = Math.max(-10, Math.min(10, returnPercent));
  
  if (clamped === 0) return 'var(--bg-input)';
  
  if (clamped > 0) {
    // Green gradient
    const intensity = Math.min(1, clamped / 10);
    const r = Math.round(0 + (0 - 0) * intensity);
    const g = Math.round(30 + (200 - 30) * intensity);
    const b = Math.round(30 + (83 - 30) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Red gradient
    const intensity = Math.min(1, Math.abs(clamped) / 10);
    const r = Math.round(30 + (239 - 30) * intensity);
    const g = Math.round(30 + (68 - 30) * intensity);
    const b = Math.round(30 + (68 - 30) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  }
}
