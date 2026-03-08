'use client';
import { useCallback, useRef } from 'react';
import type { EToroTrading } from 'etoro-sdk';
import { useRebalanceStore } from '@/store/rebalance-store';
import { totalTargetWeight, canValidate, canExecute } from '@/store/selectors';
import { RebalanceStep } from '@/types/rebalancer';
import type { TargetAllocation, OptimizationMethod, OptimizationResult } from '@/types/rebalancer';
import { AppShell } from '@/components/layout/AppShell';
import { StepHeader } from '@/components/layout/StepHeader';
import { ConnectStep } from '@/components/step-connect/ConnectStep';
import { ConfigureStep } from '@/components/step-configure/ConfigureStep';
import { PortfolioStep } from '@/components/step-portfolio/PortfolioStep';
import { OptimizeStep } from '@/components/step-optimize/OptimizeStep';
import { TargetStep } from '@/components/step-target/TargetStep';
import { BacktestStep } from '@/components/step-backtest/BacktestStep';
import { ValidationStep } from '@/components/step-validation/ValidationStep';
import { ExecutionStep } from '@/components/step-execution/ExecutionStep';
import { ResultsStep } from '@/components/step-results/ResultsStep';
import { analyzePortfolio, portfolioToTargetAllocations } from '@/engine/portfolio-analyzer';
import { validateInstruments } from '@/engine/instrument-validator';
import { createRebalancePlan } from '@/engine/rebalance-planner';
import { executeRebalance } from '@/engine/rebalance-executor';
import {
  createMockPortfolio,
  portfolioToTargetAllocations as mockPortfolioToTargets,
  createMockValidations,
  createMockPlan,
  createMockExecutionProgress,
  createMockAfterPortfolio,
  createMockSummary,
} from '@/utils/mock-data';
import { optimize, optimizeDemo } from '@/engine/optimizer';

interface CatalogEntry {
  instrumentId: number;
  symbol: string;
  displayName: string;
}

export default function Home() {
  const store = useRebalanceStore();
  const etoroRef = useRef<EToroTrading | null>(null);
  const catalogRef = useRef<CatalogEntry[]>([]);

  const isDemo = store.mode === 'demo';

  // Use getState() inside callbacks to avoid infinite re-render loops.
  // Zustand's useStore() returns a new object ref each render — putting `store`
  // in useCallback deps causes: new store → new callback → child re-render → repeat.
  const getStore = useCallback(() => useRebalanceStore.getState(), []);

  // ── Connection ──────────────────────────────────────────
  const handleConnect = useCallback(async (apiKey: string, userKey: string, mode: 'demo' | 'sso', accountType?: 'real' | 'demo') => {
    console.log('[DEBUG handleConnect] mode:', mode, 'account:', accountType);
    const s = getStore();

    s.setConnection(apiKey, userKey, mode);

    if (mode === 'demo') {
      s.setConnected(true);
      const mockPortfolio = createMockPortfolio();
      s.setPortfolio(mockPortfolio);
      s.setTargetAllocations(mockPortfolioToTargets(mockPortfolio));
      s.setStep(RebalanceStep.Configure);
      return;
    }

    // SSO mode - use Bearer token
    if (mode === 'sso') {
      // Fetch portfolio from our API route (which uses Bearer auth)
      const acct = accountType || 'demo';
      const portfolioRes = await fetch(`/api/portfolio?account=${acct}`);
      if (!portfolioRes.ok) {
        throw new Error(`Failed to load portfolio: ${portfolioRes.status}`);
      }
      const portfolioData = await portfolioRes.json();
      
      // Use real portfolio data from Express API (already transformed to app format)
      s.setPortfolio(portfolioData);
      s.setTargetAllocations(mockPortfolioToTargets(portfolioData));
      s.setConnected(true);
      s.setStep(RebalanceStep.Configure);
      return;
    }
  }, [getStore]);

  // ── Search ──────────────────────────────────────────────
  const handleSearch = useCallback(async (query: string) => {
    if (isDemo) {
      return [
        { symbol: 'AAPL', displayName: 'Apple Inc.', instrumentId: 1001 },
        { symbol: 'MSFT', displayName: 'Microsoft Corporation', instrumentId: 1002 },
        { symbol: 'GOOGL', displayName: 'Alphabet Inc.', instrumentId: 1003 },
      ].filter((item) =>
        item.symbol.toLowerCase().includes(query.toLowerCase()) ||
        item.displayName.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (!etoroRef.current) return [];
    const searchResp = await etoroRef.current.rest.marketData.searchInstruments({ fields: 'all', searchText: query, pageSize: 10 });
    return (searchResp.items ?? []).map((item: any) => ({
      symbol: item.symbolFull,
      displayName: item.instrumentDisplayName,
      instrumentId: item.instrumentId,
    }));
  }, [isDemo]);

  // ── Optimization ────────────────────────────────────────
  const handleOptimize = useCallback(async (method: OptimizationMethod, params: Record<string, number>): Promise<OptimizationResult> => {
    const s = getStore();
    s.setIsOptimizing(true);
    s.setOptimizationMethod(method);
    s.setOptimizationProgress({ phase: 'Preparing...', current: 0, total: 1 });

    try {
      const holdings = s.portfolio?.holdings ?? [];
      const instrumentIds = holdings.map((h) => h.instrumentId);
      const symbols = holdings.map((h) => h.symbol);

      if (isDemo) {
        await new Promise((r) => setTimeout(r, 800));
        s.setOptimizationProgress({ phase: 'Computing weights...', current: 1, total: 2 });
        await new Promise((r) => setTimeout(r, 600));
        const result = optimizeDemo(instrumentIds, symbols, method, params);
        s.setOptimizationProgress({ phase: 'Done', current: 2, total: 2 });
        s.setOptimizationResult(result);
        return result;
      }

      const etoro = etoroRef.current;
      if (!etoro) throw new Error('Not connected');

      const result = await optimize(etoro, instrumentIds, symbols, method, params, (phase, current, total) => {
        s.setOptimizationProgress({ phase, current, total });
      });

      s.setOptimizationResult(result);
      return result;
    } finally {
      s.setIsOptimizing(false);
    }
  }, [isDemo, getStore]);

  const handleApplyOptimization = useCallback((result: OptimizationResult) => {
    const s = getStore();
    const allocations: TargetAllocation[] = result.symbols.map((sym, i) => ({
      symbol: sym,
      weight: result.weights[i]!,
      instrumentId: result.instrumentIds[i],
      isCash: sym === 'CASH',
    }));
    s.setTargetAllocations(allocations);
    s.setStep(RebalanceStep.Target);
  }, [getStore]);

  // ── Validation ──────────────────────────────────────────
  const handleValidate = useCallback(async () => {
    const s = getStore();
    if (isDemo) {
      s.setValidationResults(createMockValidations());
      const plan = createMockPlan();
      s.setExecutionPlan(plan);
      s.setIsValidating(false);
      return;
    }

    if (!etoroRef.current || !s.portfolio) return;
    s.setIsValidating(true);

    const validations = await validateInstruments(etoroRef.current, s.targetAllocations);
    s.setValidationResults(validations);

    if (validations.every((v) => v.isValid)) {
      const plan = createRebalancePlan({
        analysis: s.portfolio,
        targets: s.targetAllocations,
        validations,
      });
      s.setExecutionPlan(plan);
    }

    s.setIsValidating(false);
  }, [isDemo, getStore]);

  // ── Execution ───────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    const s = getStore();
    if (isDemo) {
      s.snapshotPortfolio();
      s.setExecutionProgress(createMockExecutionProgress());
      s.setStep(RebalanceStep.Execution);

      setTimeout(() => {
        const st = getStore();
        st.setExecutionPhase('complete');
        st.setFinalPortfolio(createMockAfterPortfolio());
        st.setExecutionSummary(createMockSummary());
      }, 3000);
      return;
    }

    if (!etoroRef.current || !s.executionPlan) return;
    s.snapshotPortfolio();
    s.setStep(RebalanceStep.Execution);

    const summary = await executeRebalance(
      etoroRef.current,
      s.executionPlan,
      (trade, phase, index) => {
        const st = getStore();
        st.updateTradeProgress(trade, index);
        st.setExecutionPhase(phase);
      }
    );

    const st = getStore();
    st.setExecutionSummary(summary);
    st.setExecutionPhase(summary.failed > 0 && summary.successful === 0 ? 'failed' : 'complete');

    // Reload final portfolio
    const finalResp = await etoroRef.current.getPortfolio();
    const finalPositions = finalResp.clientPortfolio.positions ?? [];
    const finalHoldings = finalPositions.map((p: any) => {
      const catalogEntry = catalogRef.current.find((c) => c.instrumentId === p.instrumentID);
      return {
        symbol: catalogEntry?.symbol ?? `ID:${p.instrumentID}`,
        name: catalogEntry?.displayName ?? `Unknown ${p.instrumentID}`,
        quantity: p.units ?? 0,
        currentPrice: p.amount && p.units ? p.amount / p.units : 0,
        marketValue: p.amount ?? 0,
        allocation: 0,
      };
    });

    const finalTotal = finalHoldings.reduce((sum, h) => sum + h.marketValue, 0);
    finalHoldings.forEach((h) => {
      h.allocation = finalTotal > 0 ? (h.marketValue / finalTotal) * 100 : 0;
    });

    const finalCash = finalResp.clientPortfolio.credit ?? 0;
    const finalPortfolio = {
      holdings: finalHoldings.map(h => ({
        instrumentId: 0,
        symbol: h.symbol,
        displayName: h.name,
        positions: [],
        totalUnits: h.quantity,
        totalValue: h.marketValue,
        investedAmount: h.marketValue,
        weight: h.allocation / 100,
        pnl: 0,
      })),
      totalValue: finalTotal + finalCash,
      investedValue: finalTotal,
      availableCash: finalCash,
      cashWeight: (finalTotal + finalCash) > 0 ? finalCash / (finalTotal + finalCash) : 0,
      timestamp: new Date().toISOString(),
    };

    st.setFinalPortfolio(finalPortfolio);
  }, [isDemo, getStore]);

  // ── Navigation helpers ──────────────────────────────────
  const goToStep = (step: RebalanceStep) => store.setStep(step);

  // ── Render ──────────────────────────────────────────────
  const renderStep = () => {
    switch (store.step) {
      case RebalanceStep.Connect:
        return <ConnectStep onConnect={handleConnect} />;

      case RebalanceStep.Configure:
        return (
          <ConfigureStep
            serviceMode={store.serviceMode}
            activationMode={store.activationMode}
            autonomyLevel={store.autonomyLevel}
            driftThreshold={store.driftThreshold}
            cryptoThreshold={store.cryptoThreshold}
            scheduleFrequency={store.scheduleFrequency}
            scheduleDayOfWeek={store.scheduleDayOfWeek}
            scheduleDayOfMonth={store.scheduleDayOfMonth}
            scheduleHour={store.scheduleHour}
            onUpdate={(config) => {
              if (config.serviceMode) store.setServiceMode(config.serviceMode);
              if (config.activationMode) store.setActivationMode(config.activationMode);
              if (config.autonomyLevel) store.setAutonomyLevel(config.autonomyLevel);
              if (config.driftThreshold !== undefined) store.setDriftThreshold(config.driftThreshold);
              if (config.cryptoThreshold !== undefined) store.setCryptoThreshold(config.cryptoThreshold);
              if (config.scheduleFrequency) store.setScheduleFrequency(config.scheduleFrequency);
              if (config.scheduleDayOfWeek !== undefined) store.setScheduleDayOfWeek(config.scheduleDayOfWeek);
              if (config.scheduleDayOfMonth !== undefined) store.setScheduleDayOfMonth(config.scheduleDayOfMonth);
              if (config.scheduleHour !== undefined) store.setScheduleHour(config.scheduleHour);
            }}
            onContinue={() => goToStep(RebalanceStep.Portfolio)}
          />
        );

      case RebalanceStep.Portfolio:
        return store.portfolio ? (
          <PortfolioStep
            portfolio={store.portfolio}
            onNext={() => goToStep(RebalanceStep.Optimize)}
            isDemo={isDemo}
          />
        ) : null;

      case RebalanceStep.Optimize:
        return (
          <OptimizeStep
            onOptimize={handleOptimize}
            onApplyResult={handleApplyOptimization}
            onSkip={() => goToStep(RebalanceStep.Target)}
            isOptimizing={store.isOptimizing}
            progress={store.optimizationProgress}
            result={store.optimizationResult}
            holdingCount={store.portfolio?.holdings.length ?? 0}
          />
        );

      case RebalanceStep.Target:
        return (
          <TargetStep
            allocations={store.targetAllocations}
            onUpdateWeight={store.updateAllocation}
            onRemove={store.removeAllocation}
            onAdd={store.addAllocation}
            onImportCsv={store.setTargetAllocations}
            onEqualize={store.equalizeWeights}
            onNext={() => goToStep(RebalanceStep.Backtest)}
            onSearch={handleSearch}
            totalWeight={totalTargetWeight(store)}
            canProceed={canValidate(store)}
          />
        );

      case RebalanceStep.Backtest:
        return (
          <BacktestStep
            onNext={() => {
              store.setStep(RebalanceStep.Validation);
              handleValidate();
            }}
            onSkip={() => {
              store.setStep(RebalanceStep.Validation);
              handleValidate();
            }}
          />
        );

      case RebalanceStep.Validation:
        return (
          <ValidationStep
            validations={store.validationResults}
            isValidating={store.isValidating}
            plan={store.executionPlan}
            canExecute={canExecute(store)}
            onValidate={handleValidate}
            onExecute={handleExecute}
          />
        );

      case RebalanceStep.Execution:
        return (
          <ExecutionStep
            trades={store.executionProgress}
            phase={store.executionPhase}
            onViewResults={() => goToStep(RebalanceStep.Results)}
            onExecute={() => store.executeRebalance()}
          />
        );

      case RebalanceStep.Results:
        return (
          <ResultsStep
            before={store.portfolioSnapshot}
            after={store.finalPortfolio}
            summary={store.executionSummary}
            onReset={store.reset}
          />
        );

      default:
        return null;
    }
  };

  return (
    <AppShell>
      <StepHeader
        currentStep={store.step}
        onBack={store.goBack}
        showBack={store.step > RebalanceStep.Connect}
      />
      {renderStep()}
    </AppShell>
  );
}
