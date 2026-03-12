/**
 * Inline Backtest Engine — simple monthly rebalance simulation.
 *
 * Input:  target weights, daily OHLC candle data, starting capital, options
 * Output: equity curves, metrics, and benchmark comparison
 *
 * NO external service dependency.
 */

export interface BacktestInstrument {
  symbol: string;
  instrumentId: number;
  targetWeight: number;
}

export interface CandleDay {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface BacktestOptions {
  startingCapital: number;
  rebalanceFrequency: 'monthly';
  spreadCost: number; // e.g. 0.0015 for 0.15%
  driftThreshold: number; // e.g. 0.02 for 2%
}

export interface BacktestOutput {
  equity_curve: [number, number][]; // [timestamp_ms, portfolio_value]
  benchmark_curve: [number, number][]; // buy-and-hold benchmark
  total_return_pct: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  benchmark_return_pct: number;
  benchmark_sharpe: number;
  total_trades: number;
  total_spread_cost: number;
}

/**
 * Run a simple rebalance backtest.
 *
 * @param instruments  - Array of {symbol, instrumentId, targetWeight}
 * @param candleData   - Map<instrumentId, CandleDay[]> sorted ascending by date
 * @param options      - Backtest configuration
 */
export function runSimpleRebalanceBacktest(
  instruments: BacktestInstrument[],
  candleData: Map<number, CandleDay[]>,
  options: BacktestOptions
): BacktestOutput {
  const { startingCapital, spreadCost, driftThreshold } = options;

  // Find common dates across all instruments
  const dateSets = instruments.map((inst) => {
    const candles = candleData.get(inst.instrumentId) ?? [];
    return new Set(candles.map((c) => c.date));
  });

  let commonDates: string[] = [];
  if (dateSets.length > 0 && dateSets[0]) {
    commonDates = [...dateSets[0]];
    for (let i = 1; i < dateSets.length; i++) {
      commonDates = commonDates.filter((d) => dateSets[i]!.has(d));
    }
  }
  commonDates.sort();

  if (commonDates.length < 2) {
    // Not enough data — return flat result
    return {
      equity_curve: [],
      benchmark_curve: [],
      total_return_pct: 0,
      annualized_return: 0,
      volatility: 0,
      sharpe_ratio: 0,
      max_drawdown_pct: 0,
      benchmark_return_pct: 0,
      benchmark_sharpe: 0,
      total_trades: 0,
      total_spread_cost: 0,
    };
  }

  // Build price lookup: instrumentId → date → close
  const priceLookup = new Map<number, Map<string, number>>();
  for (const inst of instruments) {
    const candles = candleData.get(inst.instrumentId) ?? [];
    const dateMap = new Map<string, number>();
    for (const c of candles) {
      dateMap.set(c.date, c.close);
    }
    priceLookup.set(inst.instrumentId, dateMap);
  }

  const n = instruments.length;

  // ── Initialize positions ──────────────────────────────
  // Strategy: rebalance to target weights
  const stratUnits = new Array(n).fill(0);
  // Benchmark: buy-and-hold initial weights
  const benchUnits = new Array(n).fill(0);

  const day0 = commonDates[0]!;
  let totalSpreadCost = 0;
  let totalTrades = 0;

  // Allocate initial capital
  for (let i = 0; i < n; i++) {
    const price = priceLookup.get(instruments[i]!.instrumentId)?.get(day0) ?? 0;
    if (price <= 0) continue;
    const allocAmount = startingCapital * instruments[i]!.targetWeight;
    const cost = allocAmount * spreadCost;
    stratUnits[i] = (allocAmount - cost) / price;
    benchUnits[i] = (allocAmount - cost) / price;
    totalSpreadCost += cost;
    totalTrades++;
  }

  const equityCurve: [number, number][] = [];
  const benchmarkCurve: [number, number][] = [];
  const dailyReturns: number[] = [];
  const benchDailyReturns: number[] = [];

  let prevStratValue = startingCapital;
  let prevBenchValue = startingCapital;
  let peakStratValue = startingCapital;
  let maxDrawdown = 0;
  let lastRebalanceMonth = -1;

  for (let d = 0; d < commonDates.length; d++) {
    const date = commonDates[d]!;
    const ts = new Date(date).getTime();

    // Calculate current values
    let stratValue = 0;
    let benchValue = 0;
    for (let i = 0; i < n; i++) {
      const price = priceLookup.get(instruments[i]!.instrumentId)?.get(date) ?? 0;
      stratValue += stratUnits[i] * price;
      benchValue += benchUnits[i] * price;
    }

    equityCurve.push([ts, Math.round(stratValue * 100) / 100]);
    benchmarkCurve.push([ts, Math.round(benchValue * 100) / 100]);

    // Track daily returns (skip day 0)
    if (d > 0) {
      if (prevStratValue > 0) dailyReturns.push(stratValue / prevStratValue - 1);
      if (prevBenchValue > 0) benchDailyReturns.push(benchValue / prevBenchValue - 1);
    }

    // Track max drawdown
    if (stratValue > peakStratValue) peakStratValue = stratValue;
    const dd = peakStratValue > 0 ? (peakStratValue - stratValue) / peakStratValue : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    prevStratValue = stratValue;
    prevBenchValue = benchValue;

    // ── Rebalance check (first trading day of each month) ──────
    const dateObj = new Date(date);
    const currentMonth = dateObj.getFullYear() * 12 + dateObj.getMonth();

    if (currentMonth !== lastRebalanceMonth && d > 0) {
      lastRebalanceMonth = currentMonth;

      // Check if any weight drifts beyond threshold
      const currentWeights = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        const price = priceLookup.get(instruments[i]!.instrumentId)?.get(date) ?? 0;
        currentWeights[i] = stratValue > 0 ? (stratUnits[i] * price) / stratValue : 0;
      }

      let needsRebalance = false;
      for (let i = 0; i < n; i++) {
        if (Math.abs(currentWeights[i] - instruments[i]!.targetWeight) > driftThreshold) {
          needsRebalance = true;
          break;
        }
      }

      if (needsRebalance) {
        // Rebalance: sell overweight, buy underweight
        for (let i = 0; i < n; i++) {
          const price = priceLookup.get(instruments[i]!.instrumentId)?.get(date) ?? 0;
          if (price <= 0) continue;

          const targetValue = stratValue * instruments[i]!.targetWeight;
          const currentValue = stratUnits[i] * price;
          const diff = targetValue - currentValue;

          if (Math.abs(diff) > 1) { // at least $1 difference
            const tradeCost = Math.abs(diff) * spreadCost;
            totalSpreadCost += tradeCost;
            totalTrades++;

            // Adjust units: for buys we get slightly less (spread), for sells we get slightly less
            if (diff > 0) {
              stratUnits[i] += (diff - tradeCost) / price;
            } else {
              stratUnits[i] += (diff + tradeCost) / price;
            }
          }
        }
      }
    }
  }

  // ── Calculate summary metrics ────────────────────────
  const finalStratValue = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1]![1] : startingCapital;
  const finalBenchValue = benchmarkCurve.length > 0 ? benchmarkCurve[benchmarkCurve.length - 1]![1] : startingCapital;

  const totalReturnPct = startingCapital > 0 ? ((finalStratValue - startingCapital) / startingCapital) * 100 : 0;
  const benchReturnPct = startingCapital > 0 ? ((finalBenchValue - startingCapital) / startingCapital) * 100 : 0;

  const tradingDaysPerYear = 252;
  const years = commonDates.length / tradingDaysPerYear;

  const annualizedReturn = years > 0 && startingCapital > 0
    ? (Math.pow(finalStratValue / startingCapital, 1 / years) - 1) * 100
    : 0;

  // Annualized volatility
  const meanDailyReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    : 0;
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((s, r) => s + (r - meanDailyReturn) ** 2, 0) / (dailyReturns.length - 1)
    : 0;
  const dailyVol = Math.sqrt(variance);
  const annualVol = dailyVol * Math.sqrt(tradingDaysPerYear) * 100;

  const sharpe = annualVol > 0 ? annualizedReturn / annualVol : 0;

  // Benchmark sharpe
  const benchMeanDaily = benchDailyReturns.length > 0
    ? benchDailyReturns.reduce((s, r) => s + r, 0) / benchDailyReturns.length
    : 0;
  const benchVariance = benchDailyReturns.length > 1
    ? benchDailyReturns.reduce((s, r) => s + (r - benchMeanDaily) ** 2, 0) / (benchDailyReturns.length - 1)
    : 0;
  const benchDailyVol = Math.sqrt(benchVariance);
  const benchAnnualVol = benchDailyVol * Math.sqrt(tradingDaysPerYear);
  const benchAnnualReturn = years > 0 && startingCapital > 0
    ? (Math.pow(finalBenchValue / startingCapital, 1 / years) - 1)
    : 0;
  const benchSharpe = benchAnnualVol > 0 ? benchAnnualReturn / benchAnnualVol : 0;

  return {
    equity_curve: equityCurve,
    benchmark_curve: benchmarkCurve,
    total_return_pct: Math.round(totalReturnPct * 100) / 100,
    annualized_return: Math.round(annualizedReturn * 100) / 100,
    volatility: Math.round(annualVol * 100) / 100,
    sharpe_ratio: Math.round(sharpe * 100) / 100,
    max_drawdown_pct: Math.round(maxDrawdown * 10000) / 100,
    benchmark_return_pct: Math.round(benchReturnPct * 100) / 100,
    benchmark_sharpe: Math.round(benchSharpe * 100) / 100,
    total_trades: totalTrades,
    total_spread_cost: Math.round(totalSpreadCost * 100) / 100,
  };
}
