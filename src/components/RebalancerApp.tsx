'use client';
import { useEffect } from 'react';
import { AppShell } from './layout/AppShell';
import { StepHeader } from './layout/StepHeader';
import { StepTransition } from './shared/StepTransition';
import { ConnectStep } from './step-connect/ConnectStep';
import { PortfolioStep } from './step-portfolio/PortfolioStep';
import { OptimizeStep } from './step-optimize/OptimizeStep';
import { ExecuteStep } from './step-execute/ExecuteStep';
import { ResultsStep } from './step-results/ResultsStep';
import { RebalanceStep } from '../types/rebalancer';
import type { OptimizationMethod, OptimizationResult, TradeProgress } from '../types/rebalancer';
import { useRebalanceStore } from '../store/rebalance-store';
import { createMockPortfolio, createMockPlanFromAllocations } from '../utils/mock-data';

export function RebalancerApp() {
  const store = useRebalanceStore();
  const {
    step, setStep, goBack,
    isConnected, setConnected, setConnection, mode,
    portfolio, setPortfolio,
    optimizationResult, isOptimizing, optimizationProgress,
    setOptimizationResult, setIsOptimizing, setOptimizationProgress,
    targetAllocations, setTargetAllocations,
    executionPlan, setExecutionPlan,
    executionProgress, executionPhase, executeRebalance,
    setFinalPortfolio,
    finalPortfolio, executionSummary,
    policyFrequency, setPolicyFrequency,
    driftThreshold, setDriftThreshold,
    maxPositionWeight, setMaxPositionWeight,
    slippageTolerance, setSlippageTolerance,
    reset, resetOptimization,
  } = store;

  const isDemo = mode === 'demo';

  useEffect(() => {
    useRebalanceStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authSuccess = params.get('auth') === 'success';

    if (authSuccess || (!isConnected && step > RebalanceStep.Connect)) {
      fetch('/api/auth/me', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user || data?.username) {
            setConnection('', '', 'sso');
            setConnected(true);
            if (authSuccess) {
              window.history.replaceState({}, '', '/');
              loadPortfolio().then(() => setStep(RebalanceStep.Portfolio));
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  const loadPortfolio = async () => {
    const currentMode = useRebalanceStore.getState().mode;
    if (currentMode === 'demo') {
      setPortfolio(createMockPortfolio());
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const accType = typeof window !== 'undefined' ? (localStorage.getItem('etoro_account_type') ?? 'real') : 'real';
      const res = await fetch(`/api/portfolio?accountType=${accType}`, { credentials: 'include', signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data?.holdings) setPortfolio(data);
        else setPortfolio(createMockPortfolio());
      } else {
        setPortfolio(createMockPortfolio());
      }
    } catch {
      setPortfolio(createMockPortfolio());
    }
  };

  useEffect(() => {
    if (!portfolio && step >= RebalanceStep.Portfolio) loadPortfolio();
  }, [step, portfolio]);

  const handleConnect = async (apiKey: string, userKey: string, connectMode: 'demo' | 'sso', accountType?: 'real' | 'demo') => {
    if (connectMode === 'sso') {
      if (typeof window !== 'undefined') localStorage.setItem('etoro_account_type', accountType ?? 'real');
      window.location.href = '/api/auth/login';
      return;
    }
    setConnection(apiKey, userKey, 'demo');
    setConnected(true);
    setPortfolio(createMockPortfolio());
    setStep(RebalanceStep.Portfolio);
  };

  const handleOptimize = async (method: OptimizationMethod, params: Record<string, number>): Promise<OptimizationResult> => {
    const directHoldings = portfolio?.directHoldings ?? portfolio?.holdings?.filter((holding) => !holding.isCopy) ?? [];
    if (directHoldings.length < 2) throw new Error('Need at least 2 direct holdings to optimize');

    const n = directHoldings.length;
    const holdingsWithWeight = directHoldings.map((holding) => ({
      ...holding,
      weight: portfolio && portfolio.totalValue > 0 ? holding.totalValue / portfolio.totalValue : 1 / n,
    }));

    setIsOptimizing(true);
    setOptimizationProgress({ phase: 'Running optimizer…', current: 1, total: 1 });

    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directHoldings: holdingsWithWeight,
          copyInstrumentIds: (portfolio?.copyHoldings ?? []).map(h => h.instrumentId),
          method,
          m: params.m ?? 5,
          riskAversion: params.riskAversion ?? 2.5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Optimization failed');

      const result: OptimizationResult = {
        weights: data.weights ?? [],
        method: data.method ?? method,
        instrumentIds: data.instrumentIds ?? [],
        symbols: data.symbols ?? [],
        metrics: {
          expectedReturn: data.metrics?.expectedReturn ?? 0,
          expectedVolatility: data.metrics?.expectedVolatility ?? 0,
          sharpeRatio: data.metrics?.sharpeRatio ?? 0,
          maxWeight: data.metrics?.maxWeight ?? 0,
          diversificationRatio: data.metrics?.diversificationRatio ?? 1,
        },
        riskContributions: data.riskContributions ?? [],
        dataQuality: {
          dataPoints: data.dataQuality?.dataPoints ?? 0,
          missingInstruments: data.dataQuality?.missingInstruments ?? [],
        },
        newRecommendations: data.newRecommendations,
        existingReweighted: data.existingReweighted,
        constraints: data.constraints,
        marketCapCoverage: data.marketCapCoverage,
        backtest: data.backtest ?? undefined,
        currentBacktest: data.currentBacktest ?? undefined,
      };

      setOptimizationResult(result);
      return result;
    } finally {
      setIsOptimizing(false);
      setOptimizationProgress(null);
    }
  };

  const handleApplyResult = (result: OptimizationResult) => {
    // Build target allocations from result
    const allocs = result.symbols.map((sym, i) => ({
      symbol: sym,
      instrumentId: result.instrumentIds?.[i] ?? i,
      displayName: portfolio?.holdings.find(h => h.instrumentId === result.instrumentIds?.[i])?.displayName ?? sym,
      weight: result.weights[i] ?? 0,
      isCash: false,
    }));
    setTargetAllocations(allocs);

    // Build execution plan
    const plan = createMockPlanFromAllocations(allocs, portfolio);
    setExecutionPlan(plan);

    setStep(RebalanceStep.Execute);
  };

  const POLL_INTERVAL = 30_000; // 30s between polls
  const MAX_POLL_CYCLES = 60; // ~30 min max polling
  const INTER_TRADE_DELAY = 500;

  const getAccountType = (): 'real' | 'demo' => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('etoro_account_type') : null;
    return (stored as 'real' | 'demo') ?? 'demo';
  };

  const executeTrade = async (trade: any, accountType: string) => {
    const res = await fetch('/api/execute', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades: [trade], accountType }),
    });
    const data = await res.json();
    if (res.status === 401) throw new Error('AUTH_EXPIRED');
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    return data.results?.[0];
  };

  const pollLimitOrders = async (
    progressList: TradeProgress[],
    accountType: string,
  ): Promise<TradeProgress[]> => {
    const pendingIds = progressList
      .filter(t => t.status === 'limit-pending' && t.orderId)
      .map(t => t.orderId!);

    if (!pendingIds.length) return progressList;

    store.setExecutionPhase('polling');

    for (let cycle = 0; cycle < MAX_POLL_CYCLES; cycle++) {
      const stillPending = progressList.filter(t => t.status === 'limit-pending' && t.orderId);
      if (!stillPending.length) break;

      const ids = stillPending.map(t => t.orderId!).join(',');
      try {
        const res = await fetch(`/api/order-status?orderIds=${ids}&accountType=${accountType}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          for (const s of data.statuses ?? []) {
            const idx = progressList.findIndex(t => t.orderId === s.orderId);
            if (idx < 0) continue;
            if (s.isFilled) {
              progressList[idx] = {
                ...progressList[idx]!,
                status: 'limit-filled',
                actualAmount: s.executedAmount ?? progressList[idx]!.amount,
                executedAt: new Date().toISOString(),
              };
            } else if (s.isCancelled) {
              progressList[idx] = { ...progressList[idx]!, status: 'limit-cancelled', error: 'Order cancelled' };
            }
          }
          store.setExecutionProgress([...progressList]);
        }
      } catch { /* continue polling */ }

      const remaining = progressList.filter(t => t.status === 'limit-pending');
      if (!remaining.length) break;
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }

    return progressList;
  };

  const handleExecute = async () => {
    const plan = executionPlan ?? createMockPlanFromAllocations(targetAllocations, portfolio);
    if (!executionPlan) setExecutionPlan(plan);

    const closeTrades = [
      ...plan.fullCloses.map((t) => ({
        action: t.action, instrumentId: t.instrumentId, symbol: t.symbol, amount: t.amount,
        positionId: t.positionId ?? portfolio?.holdings.find((h) => h.instrumentId === t.instrumentId)?.positions?.[0]?.positionID,
        units: t.units, unitsToDeduct: t.action === 'partial-close' ? t.units : undefined, reason: t.reason,
      })),
      ...plan.partialCloses.map((t) => ({
        action: t.action, instrumentId: t.instrumentId, symbol: t.symbol, amount: t.amount,
        positionId: t.positionId ?? portfolio?.holdings.find((h) => h.instrumentId === t.instrumentId)?.positions?.[0]?.positionID,
        units: t.units, unitsToDeduct: t.units, reason: t.reason,
      })),
    ];
    const buyTrades = plan.opens.map((t) => ({
      action: t.action, instrumentId: t.instrumentId, symbol: t.symbol, amount: t.amount, reason: t.reason,
    }));

    const allTrades = [...closeTrades, ...buyTrades];

    if (isDemo) {
      const progressList: TradeProgress[] = allTrades.map((t) => ({
        symbol: t.symbol ?? `ID:${t.instrumentId}`,
        instrumentId: t.instrumentId,
        action: t.action as 'full-close' | 'partial-close' | 'buy',
        amount: t.amount ?? 0,
        status: 'pending' as const,
        reason: t.reason ?? (t.action === 'buy' ? 'Opening position' : 'Closing position'),
      }));
      store.setExecutionProgress(progressList);
      await executeRebalance();
      setFinalPortfolio(createMockPortfolio());
      setStep(RebalanceStep.Results);
      return;
    }

    const accountType = getAccountType();

    // Initialize progress list
    let progressList: TradeProgress[] = allTrades.map((t) => ({
      symbol: t.symbol ?? `ID:${t.instrumentId}`,
      instrumentId: t.instrumentId,
      action: t.action as 'full-close' | 'partial-close' | 'buy',
      amount: t.amount ?? 0,
      status: 'pending' as const,
      reason: t.reason ?? (t.action === 'buy' ? 'Opening position' : 'Closing position'),
    }));
    store.setExecutionProgress(progressList);

    let cashFreed = 0;
    let authExpired = false;

    // ═══════════════════════════════════════════════
    // PHASE 1: Execute ALL closes (market + limit)
    // ═══════════════════════════════════════════════
    for (let i = 0; i < closeTrades.length; i++) {
      if (authExpired) {
        progressList[i] = { ...progressList[i]!, status: 'skipped', error: 'Session expired' };
        store.setExecutionProgress([...progressList]);
        continue;
      }

      const trade = closeTrades[i]!;
      store.setExecutionPhase(trade.action === 'full-close' ? 'closing' : 'partial-closing');
      progressList[i] = { ...progressList[i]!, status: 'executing' };
      store.setExecutionProgress([...progressList]);

      try {
        const result = await executeTrade(trade, accountType);

        if (result?.status === 'ok') {
          progressList[i] = {
            ...progressList[i]!, status: 'success', orderType: 'market',
            orderId: result.orderId, executedAt: new Date().toISOString(),
          };
          cashFreed += progressList[i]!.amount;
        } else if (result?.status === 'limit-pending') {
          progressList[i] = {
            ...progressList[i]!, status: 'limit-pending', orderType: 'limit',
            orderId: result.orderId, limitRate: result.limitRate, marketOpen: false,
          };
        } else {
          progressList[i] = {
            ...progressList[i]!, status: 'failed',
            error: result?.error ?? 'Unknown error',
          };
        }
      } catch (e: any) {
        if (e.message === 'AUTH_EXPIRED') {
          authExpired = true;
          progressList[i] = { ...progressList[i]!, status: 'failed', error: 'Session expired — re-login' };
        } else {
          progressList[i] = { ...progressList[i]!, status: 'failed', error: e.message };
        }
      }
      store.setExecutionProgress([...progressList]);
      if (i < closeTrades.length - 1) await new Promise(r => setTimeout(r, INTER_TRADE_DELAY));
    }

    // Poll pending limit close orders
    const hasLimitCloses = progressList.slice(0, closeTrades.length).some(t => t.status === 'limit-pending');
    if (hasLimitCloses && !authExpired) {
      progressList = await pollLimitOrders(progressList, accountType);
      for (let i = 0; i < closeTrades.length; i++) {
        if (progressList[i]!.status === 'limit-filled') {
          cashFreed += progressList[i]!.actualAmount ?? progressList[i]!.amount;
        }
      }
    }

    // ═══════════════════════════════════════════════
    // PHASE 2: Execute buys with available cash
    // ═══════════════════════════════════════════════
    const availableCash = (portfolio?.availableCash ?? 0) + cashFreed;

    for (let i = 0; i < buyTrades.length; i++) {
      const idx = closeTrades.length + i;

      if (authExpired) {
        progressList[idx] = { ...progressList[idx]!, status: 'skipped', error: 'Session expired' };
        store.setExecutionProgress([...progressList]);
        continue;
      }

      const trade = buyTrades[i]!;
      const tradeAmount = trade.amount ?? 0;

      // Check if we have enough cash for this buy
      if (tradeAmount > availableCash * 1.05) {
        progressList[idx] = { ...progressList[idx]!, status: 'skipped', error: `Insufficient cash ($${availableCash.toFixed(0)} available)` };
        store.setExecutionProgress([...progressList]);
        continue;
      }

      store.setExecutionPhase('opening');
      progressList[idx] = { ...progressList[idx]!, status: 'executing' };
      store.setExecutionProgress([...progressList]);

      try {
        const result = await executeTrade(trade, accountType);

        if (result?.status === 'ok') {
          progressList[idx] = {
            ...progressList[idx]!, status: 'success', orderType: 'market',
            orderId: result.orderId, executedAt: new Date().toISOString(),
          };
        } else if (result?.status === 'limit-pending') {
          progressList[idx] = {
            ...progressList[idx]!, status: 'limit-pending', orderType: 'limit',
            orderId: result.orderId, limitRate: result.limitRate, marketOpen: false,
          };
        } else {
          progressList[idx] = {
            ...progressList[idx]!, status: 'failed', error: result?.error ?? 'Unknown error',
          };
        }
      } catch (e: any) {
        if (e.message === 'AUTH_EXPIRED') {
          authExpired = true;
          progressList[idx] = { ...progressList[idx]!, status: 'failed', error: 'Session expired — re-login' };
          for (let j = idx + 1; j < progressList.length; j++) {
            progressList[j] = { ...progressList[j]!, status: 'skipped', error: 'Session expired' };
          }
        } else {
          progressList[idx] = { ...progressList[idx]!, status: 'failed', error: e.message };
        }
      }
      store.setExecutionProgress([...progressList]);
      if (i < buyTrades.length - 1) await new Promise(r => setTimeout(r, INTER_TRADE_DELAY));
    }

    // Poll pending limit buy orders
    const hasLimitBuys = progressList.slice(closeTrades.length).some(t => t.status === 'limit-pending');
    if (hasLimitBuys && !authExpired) {
      progressList = await pollLimitOrders(progressList, accountType);
    }

    // ═══════════════════════════════════════════════
    // FINALIZE
    // ═══════════════════════════════════════════════
    const successes = progressList.filter(t => t.status === 'success' || t.status === 'limit-filled').length;
    const failures = progressList.filter(t => t.status === 'failed').length;
    const pending = progressList.filter(t => t.status === 'limit-pending').length;
    const phase = failures === progressList.length ? 'failed'
      : pending > 0 ? 'polling'
      : 'complete';

    store.setExecutionPhase(phase as any);
    store.setExecutionSummary({
      totalTrades: progressList.length,
      successful: successes,
      failed: failures,
      skipped: progressList.filter(t => t.status === 'skipped' || t.status === 'limit-cancelled').length,
      totalFeesEstimate: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      trades: progressList,
    });
  };

  const handleCancelOrder = async (orderId: number) => {
    const accountType = getAccountType();
    try {
      const res = await fetch('/api/order-status', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, accountType }),
      });
      const data = await res.json();
      if (data.cancelled) {
        const updated = executionProgress.map(t =>
          t.orderId === orderId ? { ...t, status: 'limit-cancelled' as const, error: 'Cancelled by user' } : t
        );
        store.setExecutionProgress(updated);
      }
    } catch (e: any) {
      console.error('Cancel failed:', e.message);
    }
  };

  const handleClearOptimizationResult = () => {
    setOptimizationResult(null);
    store.setBacktestResult(null);
    store.setCurrentBacktest(null);
  };

  if (!isConnected && step === RebalanceStep.Connect) {
    return (
      <AppShell>
        <StepTransition stepKey={step}>
          <ConnectStep onConnect={handleConnect} />
        </StepTransition>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <StepHeader currentStep={step} onBack={goBack} showBack={step > RebalanceStep.Portfolio} />
      <StepTransition stepKey={step}>
        {step === RebalanceStep.Portfolio && portfolio && (
          <PortfolioStep
            portfolio={portfolio}
            onNext={() => setStep(RebalanceStep.Optimize)}
            isDemo={isDemo}
          />
        )}
        {step === RebalanceStep.Optimize && !portfolio && (
          <div className="flex-1 flex items-center justify-center">
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
              <div style={{ fontSize: 14 }}>Loading portfolio...</div>
            </div>
          </div>
        )}
        {step === RebalanceStep.Optimize && portfolio && (
          <OptimizeStep
            portfolio={portfolio}
            onOptimize={handleOptimize}
            onApply={handleApplyResult}
            isOptimizing={isOptimizing}
            progress={optimizationProgress}
            result={optimizationResult}
            holdingCount={portfolio?.directHoldings?.length ?? portfolio?.holdings?.filter((h) => !h.isCopy).length ?? 0}
            onClearResult={handleClearOptimizationResult}
          />
        )}
        {step === RebalanceStep.Execute && (
          <ExecuteStep
            plan={executionPlan}
            trades={executionProgress}
            phase={executionPhase}
            portfolio={portfolio}
            onExecute={handleExecute}
            onViewResults={() => setStep(RebalanceStep.Results)}
            onCancelOrder={handleCancelOrder}
            driftThreshold={driftThreshold}
            maxPositionWeight={maxPositionWeight}
            slippageTolerance={slippageTolerance}
            onDriftThresholdChange={setDriftThreshold}
            onMaxPositionWeightChange={setMaxPositionWeight}
            onSlippageToleranceChange={setSlippageTolerance}
          />
        )}
        {step === RebalanceStep.Results && (
          <ResultsStep
            before={portfolio}
            after={finalPortfolio}
            summary={executionSummary}
            onReset={reset}
            policyFrequency={policyFrequency}
            onPolicyChange={setPolicyFrequency}
            targetAllocations={targetAllocations}
            optimizationMethod={optimizationResult?.method}
            riskLevel={store.riskLevel ?? undefined}
            driftThreshold={driftThreshold / 100}
            accountType={getAccountType()}
          />
        )}
      </StepTransition>
    </AppShell>
  );
}
