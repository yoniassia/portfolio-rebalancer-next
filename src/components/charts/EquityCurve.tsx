import { useMemo, memo } from 'react';

interface EquityCurveProps {
  benchmarkData: { date: string; value: number }[];
  optimizedData: { date: string; value: number }[];
}

export const EquityCurve = memo(function EquityCurve({ benchmarkData, optimizedData }: EquityCurveProps) {
  const { viewBox, benchmarkPath, optimizedPath, yAxisLabels, xAxisLabels, gridLines } = useMemo(() => {
    if (benchmarkData.length === 0 || optimizedData.length === 0) {
      return { viewBox: '0 0 100 100', benchmarkPath: '', optimizedPath: '', yAxisLabels: [], xAxisLabels: [], gridLines: [] };
    }

    const width = 100;
    const height = 60;
    const padding = { top: 5, right: 5, bottom: 15, left: 12 };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find min/max values
    const allValues = [...benchmarkData.map(d => d.value), ...optimizedData.map(d => d.value)];
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const valueRange = maxValue - minValue;

    // Generate paths
    const createPath = (data: { date: string; value: number }[]) => {
      return data
        .map((point, i) => {
          const x = padding.left + (i / (data.length - 1)) * chartWidth;
          const y = padding.top + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' ');
    };

    const benchmarkPath = createPath(benchmarkData);
    const optimizedPath = createPath(optimizedData);

    // Y-axis labels (5 evenly spaced)
    const yAxisLabels = Array.from({ length: 5 }, (_, i) => {
      const value = minValue + (valueRange * (4 - i)) / 4;
      const y = padding.top + (i / 4) * chartHeight;
      return { value: `$${(value / 1000).toFixed(1)}k`, y };
    });

    // X-axis labels (show first, middle, last)
    const xAxisLabels = [
      { date: formatDate(benchmarkData[0].date), x: padding.left },
      { date: formatDate(benchmarkData[Math.floor(benchmarkData.length / 2)].date), x: padding.left + chartWidth / 2 },
      { date: formatDate(benchmarkData[benchmarkData.length - 1].date), x: padding.left + chartWidth },
    ];

    // Grid lines (horizontal)
    const gridLines = Array.from({ length: 5 }, (_, i) => {
      const y = padding.top + (i / 4) * chartHeight;
      return { y, x1: padding.left, x2: padding.left + chartWidth };
    });

    return {
      viewBox: `0 0 ${width} ${height}`,
      benchmarkPath,
      optimizedPath,
      yAxisLabels,
      xAxisLabels,
      gridLines,
    };
  }, [benchmarkData, optimizedData]);

  const benchmarkReturn = benchmarkData.length > 0
    ? ((benchmarkData[benchmarkData.length - 1].value - benchmarkData[0].value) / benchmarkData[0].value) * 100
    : 0;

  const optimizedReturn = optimizedData.length > 0
    ? ((optimizedData[optimizedData.length - 1].value - optimizedData[0].value) / optimizedData[0].value) * 100
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', background: 'var(--accent)' }} />
          <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
            Optimized: {optimizedReturn > 0 ? '+' : ''}{optimizedReturn.toFixed(1)}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', background: 'var(--text-tertiary)' }} />
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
            Buy & Hold: {benchmarkReturn > 0 ? '+' : ''}{benchmarkReturn.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: '100%', aspectRatio: '2/1', position: 'relative' }}>
        <svg viewBox={viewBox} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {gridLines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y}
              x2={line.x2}
              y2={line.y}
              stroke="var(--border)"
              strokeWidth="0.2"
            />
          ))}

          {/* Benchmark line */}
          <path
            d={benchmarkPath}
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
          />

          {/* Optimized line */}
          <path
            d={optimizedPath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* Y-axis labels */}
          {yAxisLabels.map((label, i) => (
            <text
              key={i}
              x={10}
              y={label.y}
              fontSize="2.5"
              fill="var(--text-tertiary)"
              textAnchor="end"
              dominantBaseline="middle"
              fontFamily="JetBrains Mono, monospace"
            >
              {label.value}
            </text>
          ))}

          {/* X-axis labels */}
          {xAxisLabels.map((label, i) => (
            <text
              key={i}
              x={label.x}
              y={58}
              fontSize="2.2"
              fill="var(--text-tertiary)"
              textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
              fontFamily="JetBrains Mono, monospace"
            >
              {label.date}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
});

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `${month} '${year}`;
}
