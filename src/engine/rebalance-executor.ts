import type { EToroTrading } from 'etoro-sdk';
import type {
  RebalancePlan,
  TradeProgress,
  ExecutionPhase,
  ExecutionSummary,
} from '../types/rebalancer';

export type ProgressCallback = (
  trade: TradeProgress,
  phase: ExecutionPhase,
  index: number,
) => void;

export async function executeRebalance(
  etoro: EToroTrading,
  plan: RebalancePlan,
  onProgress: ProgressCallback,
): Promise<ExecutionSummary> {
  const startedAt = new Date().toISOString();
  const allTrades: TradeProgress[] = [];
  let tradeIndex = 0;
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  // Phase A: Full Closes
  for (const trade of plan.fullCloses) {
    const progress: TradeProgress = { ...trade, status: 'executing' };
    onProgress(progress, 'closing', tradeIndex);

    try {
      if (trade.positionId) {
        await etoro.closePosition(trade.positionId);
        progress.status = 'success';
        progress.orderId = trade.positionId;
        successful++;
      } else {
        progress.status = 'skipped';
        progress.error = 'No position ID';
        skipped++;
      }
    } catch (err) {
      progress.status = 'failed';
      progress.error = err instanceof Error ? err.message : 'Close failed';
      failed++;
    }

    progress.executedAt = new Date().toISOString();
    onProgress(progress, 'closing', tradeIndex);
    allTrades.push(progress);
    tradeIndex++;
  }

  // Phase B: Partial Closes
  for (const trade of plan.partialCloses) {
    const progress: TradeProgress = { ...trade, status: 'executing' };
    onProgress(progress, 'partial-closing', tradeIndex);

    try {
      if (trade.positionId && trade.units) {
        await etoro.closePosition(trade.positionId, trade.units);
        progress.status = 'success';
        progress.orderId = trade.positionId;
        successful++;
      } else {
        progress.status = 'skipped';
        progress.error = 'Missing position ID or units';
        skipped++;
      }
    } catch (err) {
      progress.status = 'failed';
      progress.error = err instanceof Error ? err.message : 'Partial close failed';
      failed++;
    }

    progress.executedAt = new Date().toISOString();
    onProgress(progress, 'partial-closing', tradeIndex);
    allTrades.push(progress);
    tradeIndex++;
  }

  // Recalculate available cash before opening new positions
  let actualCash = 0;
  try {
    const portfolioResponse = await etoro.getPortfolio();
    actualCash = portfolioResponse.clientPortfolio.credit ?? 0;
  } catch {
    // Use estimated cash as fallback
    actualCash = plan.estimatedCashFromCloses;
  }

  // Phase C: Open Positions
  const totalPlannedBuys = plan.opens.reduce((sum, o) => sum + o.amount, 0);
  const cashScaleFactor = totalPlannedBuys > 0 && actualCash < totalPlannedBuys
    ? actualCash / totalPlannedBuys
    : 1;

  for (const trade of plan.opens) {
    const adjustedAmount = trade.amount * cashScaleFactor;
    if (adjustedAmount < 1) {
      const progress: TradeProgress = {
        ...trade,
        status: 'skipped',
        error: 'Amount too small after adjustment',
        executedAt: new Date().toISOString(),
      };
      onProgress(progress, 'opening', tradeIndex);
      allTrades.push(progress);
      skipped++;
      tradeIndex++;
      continue;
    }

    const progress: TradeProgress = { ...trade, status: 'executing', amount: adjustedAmount };
    onProgress(progress, 'opening', tradeIndex);

    try {
      const order = await etoro.buyByAmount(trade.symbol, adjustedAmount);
      progress.orderId = order?.orderForOpen?.orderID;
      progress.actualAmount = adjustedAmount;

      // Wait for order to fill (up to 30s)
      if (order?.orderForOpen?.orderID) {
        try {
          await etoro.waitForOrder(order.orderForOpen.orderID, 30000);
        } catch {
          // Order may still execute — continue
        }
      }

      progress.status = 'success';
      successful++;
    } catch (err) {
      progress.status = 'failed';
      progress.error = err instanceof Error ? err.message : 'Buy failed';
      failed++;
    }

    progress.executedAt = new Date().toISOString();
    onProgress(progress, 'opening', tradeIndex);
    allTrades.push(progress);
    tradeIndex++;
  }

  return {
    totalTrades: allTrades.length,
    successful,
    failed,
    skipped,
    totalFeesEstimate: 0,
    startedAt,
    completedAt: new Date().toISOString(),
    trades: allTrades,
  };
}
