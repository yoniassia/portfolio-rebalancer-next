export function formatPercent(value: number, decimals = 1): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

export function formatWeight(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatWeightDisplay(percent: number, decimals = 1): string {
  return `${percent.toFixed(decimals)}%`;
}

export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return formatCurrency(value, 0);
}

export function formatPnl(value: number): { text: string; isPositive: boolean } {
  const isPositive = value >= 0;
  return {
    text: `${isPositive ? '+' : ''}${formatCurrency(value)}`,
    isPositive,
  };
}
