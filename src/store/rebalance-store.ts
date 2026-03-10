import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  RebalanceStep,
  type PortfolioAnalysis,
  type TargetAllocation,
  type InstrumentValidation,
  type RebalancePlan,
  type TradeProgress,
  type ExecutionPhase,
  type ExecutionSummary,
  type OptimizationMethod,
  type OptimizationResult,
  type ServiceMode,
  type ActivationMode,
  type AutonomyLevel,
} from '../types/rebalancer';

export interface RebalanceState {
  // Navigation
  step: RebalanceStep;

  // Connection (Step 0)
  isConnected: boolean;
  apiKey: string;
  userKey: string;
  mode: 'demo' | 'real' | 'sso';

  // Configuration (Step 1)
  serviceMode: ServiceMode;
  activationMode: ActivationMode;
  autonomyLevel: AutonomyLevel;
  driftThreshold: number;
  cryptoThreshold: number;
  scheduleFrequency: 'weekly' | 'monthly' | 'quarterly';
  scheduleDayOfWeek: number;
  scheduleDayOfMonth: number;
  scheduleHour: number;

  // Portfolio (Step 2)
  portfolio: PortfolioAnalysis | null;
  portfolioSnapshot: PortfolioAnalysis | null;

  // Optimization (Step 2)
  optimizationMethod: OptimizationMethod | null;
  optimizationResult: OptimizationResult | null;
  riskLevel: 1 | 2 | 3 | 4 | 5 | null;
  isOptimizing: boolean;
  optimizationProgress: { phase: string; current: number; total: number } | null;

  // Target (Step 3)
  targetAllocations: TargetAllocation[];
  allocationMode: 'manual' | 'csv';

  // Backtest (Step 4)
  backtestResult: any | null;
  backtestLoading: boolean;
  backtestError: string | null;
  rebalanceFrequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  backtestPeriod: number;
  transactionCost: number;
  advancedOptParams: any;

  // Validation (Step 5)
  validationResults: InstrumentValidation[];
  isValidating: boolean;

  // Execution (Step 5)
  executionPlan: RebalancePlan | null;
  executionProgress: TradeProgress[];
  executionPhase: ExecutionPhase;

  // Results (Step 6)
  finalPortfolio: PortfolioAnalysis | null;
  executionSummary: ExecutionSummary | null;

  // Actions
  setStep: (step: RebalanceStep) => void;
  goBack: () => void;

  setConnection: (apiKey: string, userKey: string, mode: 'demo' | 'real' | 'sso') => void;
  setConnected: (connected: boolean) => void;

  setServiceMode: (mode: ServiceMode) => void;
  setActivationMode: (mode: ActivationMode) => void;
  setAutonomyLevel: (level: AutonomyLevel) => void;
  setDriftThreshold: (threshold: number) => void;
  setCryptoThreshold: (threshold: number) => void;
  setScheduleFrequency: (freq: 'weekly' | 'monthly' | 'quarterly') => void;
  setScheduleDayOfWeek: (day: number) => void;
  setScheduleDayOfMonth: (day: number) => void;
  setScheduleHour: (hour: number) => void;

  setPortfolio: (portfolio: PortfolioAnalysis) => void;
  snapshotPortfolio: () => void;

  setOptimizationMethod: (method: OptimizationMethod | null) => void;
  setOptimizationResult: (result: OptimizationResult | null) => void;
  setRiskLevel: (level: 1 | 2 | 3 | 4 | 5 | null) => void;
  setIsOptimizing: (optimizing: boolean) => void;
  setOptimizationProgress: (progress: { phase: string; current: number; total: number } | null) => void;

  setTargetAllocations: (allocations: TargetAllocation[]) => void;
  updateAllocation: (index: number, weight: number) => void;
  addAllocation: (allocation: TargetAllocation) => void;
  removeAllocation: (index: number) => void;
  setAllocationMode: (mode: 'manual' | 'csv') => void;
  equalizeWeights: () => void;

  setRebalanceFrequency: (freq: 'monthly' | 'quarterly' | 'semi-annual' | 'annual') => void;
  setBacktestPeriod: (period: number) => void;
  setTransactionCost: (cost: number) => void;
  setAdvancedOptParams: (params: any) => void;
  runBacktest: () => Promise<void>;
  setBacktestResult: (result: any) => void;
  setBacktestLoading: (loading: boolean) => void;
  setBacktestError: (error: string | null) => void;

  setValidationResults: (results: InstrumentValidation[]) => void;
  setIsValidating: (validating: boolean) => void;

  setExecutionPlan: (plan: RebalancePlan) => void;
  updateTradeProgress: (trade: TradeProgress, index: number) => void;
  setExecutionPhase: (phase: ExecutionPhase) => void;
  setExecutionProgress: (progress: TradeProgress[]) => void;

  executeRebalance: () => Promise<void>;

  setFinalPortfolio: (portfolio: PortfolioAnalysis) => void;
  setExecutionSummary: (summary: ExecutionSummary) => void;

  reset: () => void;
  resetFromTarget: () => void;
}

const initialState = {
  step: RebalanceStep.Connect,
  isConnected: false,
  apiKey: '',
  userKey: '',
  mode: 'demo' as const,
  serviceMode: 'auto' as ServiceMode,
  activationMode: 'trigger' as ActivationMode,
  autonomyLevel: 'approve' as AutonomyLevel,
  driftThreshold: 4,
  cryptoThreshold: 8,
  scheduleFrequency: 'monthly' as const,
  scheduleDayOfWeek: 1,
  scheduleDayOfMonth: 1,
  scheduleHour: 10,
  portfolio: null,
  portfolioSnapshot: null,
  optimizationMethod: null,
  optimizationResult: null,
  riskLevel: null,
  isOptimizing: false,
  optimizationProgress: null,
  targetAllocations: [] as TargetAllocation[],
  allocationMode: 'manual' as const,
  backtestResult: null,
  backtestLoading: false,
  backtestError: null,
  rebalanceFrequency: 'quarterly' as const,
  backtestPeriod: 3,
  transactionCost: 0.1,
  advancedOptParams: {},
  validationResults: [] as InstrumentValidation[],
  isValidating: false,
  executionPlan: null,
  executionProgress: [] as TradeProgress[],
  executionPhase: 'idle' as ExecutionPhase,
  finalPortfolio: null,
  executionSummary: null,
};

export const useRebalanceStore = create<RebalanceState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => set({ step }),
      goBack: () => {
        const { step } = get();
        if (step > RebalanceStep.Connect) {
          set({ step: step - 1 });
        }
      },

      setConnection: (apiKey, userKey, mode) => set({ apiKey, userKey, mode }),
      setConnected: (isConnected) => set({ isConnected }),

      setServiceMode: (serviceMode) => set({ serviceMode }),
      setActivationMode: (activationMode) => set({ activationMode }),
      setAutonomyLevel: (autonomyLevel) => set({ autonomyLevel }),
      setDriftThreshold: (driftThreshold) => set({ driftThreshold }),
      setCryptoThreshold: (cryptoThreshold) => set({ cryptoThreshold }),
      setScheduleFrequency: (scheduleFrequency) => set({ scheduleFrequency }),
      setScheduleDayOfWeek: (scheduleDayOfWeek) => set({ scheduleDayOfWeek }),
      setScheduleDayOfMonth: (scheduleDayOfMonth) => set({ scheduleDayOfMonth }),
      setScheduleHour: (scheduleHour) => set({ scheduleHour }),

      setPortfolio: (portfolio) => set({ portfolio }),
      snapshotPortfolio: () => set({ portfolioSnapshot: get().portfolio }),

      setOptimizationMethod: (optimizationMethod) => set({ optimizationMethod }),
      setOptimizationResult: (optimizationResult) => set({ optimizationResult }),
      setRiskLevel: (riskLevel) => set({ riskLevel }),
      setIsOptimizing: (isOptimizing) => set({ isOptimizing }),
      setOptimizationProgress: (optimizationProgress) => set({ optimizationProgress }),

      setTargetAllocations: (targetAllocations) => set({ targetAllocations }),
      updateAllocation: (index, weight) => {
        const { targetAllocations } = get();
        const updated = [...targetAllocations];
        const item = updated[index];
        if (item) {
          updated[index] = { ...item, weight };
          set({ targetAllocations: updated });
        }
      },
      addAllocation: (allocation) => {
        set({ targetAllocations: [...get().targetAllocations, allocation] });
      },
      removeAllocation: (index) => {
        const allocs = get().targetAllocations;
        if (allocs[index]?.isCash) return;
        set({ targetAllocations: allocs.filter((_, i) => i !== index) });
      },
      setAllocationMode: (allocationMode) => set({ allocationMode }),
      equalizeWeights: () => {
        const { targetAllocations } = get();
        const cashAlloc = targetAllocations.find((a) => a.isCash);
        const nonCash = targetAllocations.filter((a) => !a.isCash);
        const cashWeight = cashAlloc?.weight ?? 0;
        const perAsset = nonCash.length > 0 ? (1 - cashWeight) / nonCash.length : 0;
        set({
          targetAllocations: targetAllocations.map((a) =>
            a.isCash ? a : { ...a, weight: perAsset },
          ),
        });
      },

      setRebalanceFrequency: (rebalanceFrequency) => set({ rebalanceFrequency }),
      setBacktestPeriod: (backtestPeriod) => set({ backtestPeriod }),
      setTransactionCost: (transactionCost) => set({ transactionCost }),
      setAdvancedOptParams: (advancedOptParams) => set({ advancedOptParams }),
      setBacktestResult: (backtestResult) => set({ backtestResult }),
      setBacktestLoading: (backtestLoading) => set({ backtestLoading }),
      setBacktestError: (backtestError) => set({ backtestError }),
      runBacktest: async () => {
        const state = get();
        set({ backtestLoading: true, backtestError: null });
        
        try {
          // Build universe from portfolio holdings (API expects { universe: ["AAPL","GOOG",...] })
          const universe = (state.portfolio?.holdings || [])
            .map((h) => h.symbol)
            .filter((s) => s && s !== 'CASH' && s !== 'USD');

          // Map optimization method to goal
          const goalMap: Record<string, string> = {
            'equal-weight': 'balanced',
            'min-variance': 'preserve',
            'risk-parity': 'balanced',
            'mvo': 'maximum',
          };
          const goal = goalMap[state.optimizationMethod || 'risk-parity'] || 'balanced';

          const payload = {
            universe,
            goal,
            rebalanceFreq: state.rebalanceFrequency === 'semi-annual' ? 'monthly' : state.rebalanceFrequency,
            period: `${state.backtestPeriod}y`,
            cash: state.portfolio?.totalValue || 100000,
            stopLoss: 8,
            takeProfit: 16,
            maxPositionPct: 25,
            spread: 0.15,
          };

          const response = await fetch('http://localhost:3047/api/backtest/run', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const result = await response.json();
          set({ backtestResult: result, backtestLoading: false });
        } catch (error: any) {
          console.error('[Backtest] Error:', error);
          set({ backtestError: error.message || 'Failed to run backtest', backtestLoading: false });
        }
      },

      setValidationResults: (validationResults) => set({ validationResults }),
      setIsValidating: (isValidating) => set({ isValidating }),

      setExecutionPlan: (executionPlan) => set({ executionPlan }),
      updateTradeProgress: (trade, index) => {
        const progress = [...get().executionProgress];
        progress[index] = trade;
        set({ executionProgress: progress });
      },
      setExecutionPhase: (executionPhase) => set({ executionPhase }),
      setExecutionProgress: (executionProgress) => set({ executionProgress }),

      executeRebalance: async () => {
        const state = get();
        const trades = state.executionProgress;
        if (trades.length === 0) return;

        const startedAt = new Date().toISOString();
        const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // Phase 1: closing
        const closes = trades.filter((t) => t.action === 'full-close');
        if (closes.length > 0) {
          set({ executionPhase: 'closing' });
          for (let i = 0; i < trades.length; i++) {
            if (trades[i].action !== 'full-close') continue;
            const updated = [...get().executionProgress];
            updated[i] = { ...updated[i], status: 'executing' };
            set({ executionProgress: updated });
            await delay(2000);
            const price = 50 + Math.random() * 200;
            updated[i] = {
              ...updated[i],
              status: 'success',
              actualAmount: updated[i].amount * (0.98 + Math.random() * 0.04),
              executedAt: new Date().toISOString(),
            };
            set({ executionProgress: [...updated] });
          }
        }

        // Phase 2: partial-closing
        const partials = trades.filter((t) => t.action === 'partial-close');
        if (partials.length > 0) {
          set({ executionPhase: 'partial-closing' });
          for (let i = 0; i < trades.length; i++) {
            if (trades[i].action !== 'partial-close') continue;
            const updated = [...get().executionProgress];
            updated[i] = { ...updated[i], status: 'executing' };
            set({ executionProgress: updated });
            await delay(2000);
            updated[i] = {
              ...updated[i],
              status: 'success',
              actualAmount: updated[i].amount * (0.98 + Math.random() * 0.04),
              executedAt: new Date().toISOString(),
            };
            set({ executionProgress: [...updated] });
          }
        }

        // Phase 3: opening
        const buys = trades.filter((t) => t.action === 'buy');
        if (buys.length > 0) {
          set({ executionPhase: 'opening' });
          for (let i = 0; i < trades.length; i++) {
            if (trades[i].action !== 'buy') continue;
            const updated = [...get().executionProgress];
            updated[i] = { ...updated[i], status: 'executing' };
            set({ executionProgress: updated });
            await delay(2000);
            updated[i] = {
              ...updated[i],
              status: 'success',
              actualAmount: updated[i].amount * (0.98 + Math.random() * 0.04),
              executedAt: new Date().toISOString(),
            };
            set({ executionProgress: [...updated] });
          }
        }

        // Complete
        const finalTrades = get().executionProgress;
        const successCount = finalTrades.filter((t) => t.status === 'success').length;
        const failCount = finalTrades.filter((t) => t.status === 'failed').length;
        const skippedCount = finalTrades.filter((t) => t.status === 'skipped').length;

        set({
          executionPhase: failCount > successCount ? 'failed' : 'complete',
          executionSummary: {
            totalTrades: finalTrades.length,
            successful: successCount,
            failed: failCount,
            skipped: skippedCount,
            totalFeesEstimate: finalTrades.reduce((s, t) => s + (t.actualAmount || t.amount) * 0.0015, 0),
            startedAt,
            completedAt: new Date().toISOString(),
            trades: finalTrades,
          },
        });
      },

      setFinalPortfolio: (finalPortfolio) => set({ finalPortfolio }),
      setExecutionSummary: (executionSummary) => set({ executionSummary }),

      reset: () => set(initialState),
      resetFromTarget: () =>
        set({
          targetAllocations: [],
          validationResults: [],
          executionPlan: null,
          executionProgress: [],
          executionPhase: 'idle',
          finalPortfolio: null,
          executionSummary: null,
          optimizationMethod: null,
          optimizationResult: null,
          riskLevel: null,
        }),
    }),
    {
      name: 'rebalancer-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        step: state.step,
        apiKey: state.apiKey,
        userKey: state.userKey,
        mode: state.mode,
        isConnected: state.isConnected,
        serviceMode: state.serviceMode,
        activationMode: state.activationMode,
        autonomyLevel: state.autonomyLevel,
        driftThreshold: state.driftThreshold,
        cryptoThreshold: state.cryptoThreshold,
        scheduleFrequency: state.scheduleFrequency,
        scheduleDayOfWeek: state.scheduleDayOfWeek,
        scheduleDayOfMonth: state.scheduleDayOfMonth,
        scheduleHour: state.scheduleHour,
        targetAllocations: state.targetAllocations,
        allocationMode: state.allocationMode,
        riskLevel: state.riskLevel,
        optimizationMethod: state.optimizationMethod,
      }),
      skipHydration: true,
    },
  ),
);
