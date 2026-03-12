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

  const handleExecute = async () => {
    const plan = executionPlan ?? createMockPlanFromAllocations(targetAllocations, portfolio);
    if (!executionPlan) setExecutionPlan(plan);

    const allTrades = [
      ...plan.fullCloses.map((t) => ({ action: t.action, instrumentId: t.instrumentId, symbol: t.symbol, amount: t.amount,
        positionId: portfolio?.holdings.find((h) => h.instrumentId === t.instrumentId)?.positions?.[0]?.positionID })),
      ...plan.partialCloses.map((t) => ({ action: t.action, instrumentId: t.instrumentId, symbol: t.symbol, amount: t.amount,
        positionId: portfolio?.holdings.find((h) => h.instrumentId === t.instrumentId)?.positions?.[0]?.positionID })),
      ...plan.opens.map((t) => ({ action: t.action, instrumentId: t.instrumentId, symbol: t.symbol, amount: t.amount })),
    ];

    if (isDemo) {
      const progressList: TradeProgress[] = allTrades.map((t) => ({
        symbol: t.symbol ?? `ID:${t.instrumentId}`,
        instrumentId: t.instrumentId,
        action: t.action as 'full-close' | 'partial-close' | 'buy',
        amount: t.amount ?? 0,
        status: 'pending' as const,
        reason: t.action === 'buy' ? 'Opening position' : 'Closing position',
      }));
      store.setExecutionProgress(progressList);
      await executeRebalance();
      setFinalPortfolio(createMockPortfolio());
      setStep(RebalanceStep.Results);
      return;
    }

    const progressList: TradeProgress[] = allTrades.map((t) => ({
      symbol: t.symbol ?? `ID:${t.instrumentId}`,
      instrumentId: t.instrumentId,
      action: t.action as 'full-close' | 'partial-close' | 'buy',
      amount: t.amount ?? 0,
      status: 'pending' as const,
      reason: t.action === 'buy' ? 'Opening position' : 'Closing position',
    }));
    store.setExecutionProgress(progressList);
    store.setExecutionPhase('closing');

    const storedAccountType = (typeof window !== 'undefined' ? localStorage.getItem('etoro_account_type') : null) as 'real' | 'demo' | null;
    const accountType = storedAccountType ?? 'demo';

    for (let i = 0; i < allTrades.length; i++) {
      const trade = allTrades[i]!;
      progressList[i] = { ...progressList[i]!, status: 'executing' };
      store.setExecutionProgress([...progressList]);
      try {
        const res = await fetch('/api/execute', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trades: [trade], accountType }),
        });
        const data = await res.json();
        const result = data.results?.[0];
        progressList[i] = {
          ...progressList[i]!,
          status: result?.status === 'ok' ? 'success' : 'failed',
          error: result?.error,
          orderId: result?.orderId,
        };
      } catch (e: unknown) {
        progressList[i] = { ...progressList[i]!, status: 'failed', error: e instanceof Error ? e.message : 'Execution failed' };
      }
      store.setExecutionProgress([...progressList]);
    }

    store.setExecutionPhase('complete');
    setFinalPortfolio(createMockPortfolio());
    setStep(RebalanceStep.Results);
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
          />
        )}
      </StepTransition>
    </AppShell>
  );
}
