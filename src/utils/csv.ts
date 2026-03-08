import type { TargetAllocation } from '../types/rebalancer';

export function parseCsv(csvContent: string): { allocations: TargetAllocation[]; errors: string[] } {
  const errors: string[] = [];
  const allocations: TargetAllocation[] = [];
  const lines = csvContent.trim().split(/\r?\n/);

  if (lines.length < 2) {
    errors.push('CSV must have a header row and at least one data row');
    return { allocations, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const parts = line.split(',').map((p) => p.trim());
    const symbol = parts[0]?.toUpperCase() ?? '';
    const weightStr = parts[1] ?? '';

    if (!symbol) {
      errors.push(`Row ${i + 1}: missing symbol`);
      continue;
    }

    const weight = parseFloat(weightStr);
    if (isNaN(weight) || weight < 0 || weight > 100) {
      errors.push(`Row ${i + 1}: weight must be 0-100 (got "${weightStr}")`);
      continue;
    }

    allocations.push({
      symbol,
      weight: weight / 100,
      isCash: symbol === 'CASH',
    });
  }

  return { allocations, errors };
}

export function generateCsv(allocations: TargetAllocation[]): string {
  const header = 'Symbol,Weight';
  const rows = allocations.map((a) => `${a.symbol},${(a.weight * 100).toFixed(1)}`);
  return [header, ...rows].join('\n');
}

export function generateTemplateCsv(): string {
  return `Symbol,Weight\nAAPL,20\nMSFT,20\nGOOGL,15\nTSLA,15\nAMZN,10\nNVDA,10\nCASH,10`;
}

export function downloadFile(content: string, filename: string, mimeType = 'text/csv'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
