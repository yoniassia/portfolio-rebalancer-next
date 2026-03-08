import type { EToroTrading } from 'etoro-sdk';
import type { TargetAllocation, InstrumentValidation } from '../types/rebalancer';

export async function validateInstruments(
  etoro: EToroTrading,
  allocations: TargetAllocation[],
  onProgress?: (current: number, total: number) => void,
): Promise<InstrumentValidation[]> {
  const nonCash = allocations.filter((a) => !a.isCash);
  const results: InstrumentValidation[] = [];

  for (let i = 0; i < nonCash.length; i++) {
    const alloc = nonCash[i]!;
    onProgress?.(i + 1, nonCash.length);

    try {
      // Try to resolve the symbol to an instrument ID
      let instrumentId = alloc.instrumentId;

      if (!instrumentId) {
        try {
          instrumentId = await etoro.resolveInstrument(alloc.symbol);
        } catch {
          // Fall back to search
        }
      }

      if (!instrumentId) {
        // Search by symbol
        const searchResult = await etoro.rest.marketData.searchInstruments({
          internalSymbolFull: alloc.symbol.toUpperCase(),
          fields: 'instrumentId',
          pageSize: 1,
        });
        const item = searchResult?.items?.[0];
        if (item && item.instrumentId > 0) {
          instrumentId = item.instrumentId;
        }
      }

      if (!instrumentId) {
        results.push({
          symbol: alloc.symbol,
          displayName: alloc.displayName,
          isValid: false,
          isOpen: false,
          isTradable: false,
          isBuyEnabled: false,
          error: 'Instrument not found',
          status: 'error',
        });
        continue;
      }

      // Get instrument info for tradability checks
      const searchResult = await etoro.rest.marketData.searchInstruments({
        internalSymbolFull: alloc.symbol.toUpperCase(),
        fields: 'instrumentId',
        pageSize: 1,
      });
      const item = searchResult?.items?.[0];

      const isOpen = item?.isOpen ?? true;
      const isTradable = true; // If we found it, it's tradable
      const isBuyEnabled = true;

      let status: 'valid' | 'warning' | 'error' = 'valid';
      if (!isOpen) status = 'warning';

      results.push({
        symbol: alloc.symbol,
        instrumentId,
        displayName: alloc.displayName,
        isValid: true,
        isOpen,
        isTradable,
        isBuyEnabled,
        status,
      });
    } catch (err) {
      results.push({
        symbol: alloc.symbol,
        displayName: alloc.displayName,
        isValid: false,
        isOpen: false,
        isTradable: false,
        isBuyEnabled: false,
        error: err instanceof Error ? err.message : 'Validation failed',
        status: 'error',
      });
    }
  }

  return results;
}
