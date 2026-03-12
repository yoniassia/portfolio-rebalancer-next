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
  type BacktestResult,
} from '../types/rebalancer';

export interface RebalanceState {
  // Navigation
  step: RebalanceStep;

  // Connection (Step 0)
  isConnected: boolean;
  apiKey: string;
  userKey: string;
  mode: 'demo' | 'real' | 'sso';

  // Portfolio (Step 1)
  portfolio: PortfolioAnalysis | null;
  portfolioSnapshot: PortfolioAnalysis | null;

  // Optimization (Step 2)
  optimizationMethod: OptimizationMethod | null;
  optimizationResult: OptimizationResult | null;
  riskLevel: 1 | 2 | 3 | 4 | 5 | null;
  isOptimizing: boolean;
  optimizationProgress: { phase: string; current: number; total: number } | null;
  addNewInstruments: boolean;
  newInstrumentCount: number;

  // Target allocations (from optimization)
  targetAllocations: TargetAllocation[];

  // Backtest (inline in optimize step)
  backtestResult: BacktestResult | null;
  currentBacktest: BacktestResult | null;

  // Validation
  validationResults: InstrumentValidation[];
  isValidating: boolean;

  // Execution (Step 3)
  executionPlan: RebalancePlan | null;
  executionProgress: TradeProgress[];
  executionPhase: ExecutionPhase;
  driftThreshold: number;
  maxPositionWeight: number;
  slippageTolerance: number;

  // Results (Step 4)
  finalPortfolio: PortfolioAnalysis | null;
  executionSummary: ExecutionSummary | null;

  // Policy (in results step)
  policyFrequency: 'monthly' | 'quarterly' | 'notify' | 'manual';

  // Actions
  setStep: (step: RebalanceStep) => void;
  goBack: () => void;

  setConnection: (apiKey: string, userKey: string, mode: 'demo' | 'real' | 'sso') => void;
  setConnected: (connected: boolean) => void;

  setPortfolio: (portfolio: PortfolioAnalysis) => void;
  snapshotPortfolio: () => void;

  setOptimizationMethod: (method: OptimizationMethod | null) => void;
  setOptimizationResult: (result: OptimizationResult | null) => void;
  setRiskLevel: (level: 1 | 2 | 3 | 4 | 5 | null) => void;
  setIsOptimizing: (optimizing: boolean) => void;
  setOptimizationProgress: (progress: { phase: string; current: number; total: number } | null) => void;
  setAddNewInstruments: (add: boolean) => void;
  setNewInstrumentCount: (count: number) => void;

  setTargetAllocations: (allocations: TargetAllocation[]) => void;
  setBacktestResult: (result: BacktestResult | null) => void;
  setCurrentBacktest: (result: BacktestResult | null) => void;

  setValidationResults: (results: InstrumentValidation[]) => void;
  setIsValidating: (validating: boolean) => void;

  setExecutionPlan: (plan: RebalancePlan) => void;
  updateTradeProgress: (trade: TradeProgress, index: number) => void;
  setExecutionPhase: (phase: ExecutionPhase) => void;
  setExecutionProgress: (progress: TradeProgress[]) => void;
  setDriftThreshold: (threshold: number) => void;
  setMaxPositionWeight: (weight: number) => void;
  setSlippageTolerance: (tolerance: number) => void;

  executeRebalance: () => Promise<void>;

  setFinalPortfolio: (portfolio: PortfolioAnalysis) => void;
  setExecutionSummary: (summary: ExecutionSummary) => void;
  setPolicyFrequency: (freq: 'monthly' | 'quarterly' | 'notify' | 'manual') => void;

  reset: () => void;
  resetOptimization: () => void;
}

const initialState = {
  step: RebalanceStep.Connect,
  isConnected: false,
  apiKey: '',
  userKey: '',
  mode: 'sso' as 'demo' | 'real' | 'sso',
  portfolio: null,
  portfolioSnapshot: null,
  optimizationMethod: null,
  optimizationResult: null,
  riskLevel: null,
  isOptimizing: false,
  optimizationProgress: null,
  addNewInstruments: true,
  newInstrumentCount: 3,
  targetAllocations: [] as TargetAllocation[],
  backtestResult: null,
  currentBacktest: null,
  validationResults: [] as InstrumentValidation[],
  isValidating: false,
  executionPlan: null,
  executionProgress: [] as TradeProgress[],
  executionPhase: 'idle' as ExecutionPhase,
  driftThreshold: 5,
  maxPositionWeight: 25,
  slippageTolerance: 0.5,
  finalPortfolio: null,
  executionSummary: null,
  policyFrequency: 'monthly' as const,
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

      setPortfolio: (portfolio) => set({ portfolio }),
      snapshotPortfolio: () => set({ portfolioSnapshot: get().portfolio }),

      setOptimizationMethod: (optimizationMethod) => set({ optimizationMethod }),
      setOptimizationResult: (optimizationResult) => set({ optimizationResult }),
      setRiskLevel: (riskLevel) => set({ riskLevel }),
      setIsOptimizing: (isOptimizing) => set({ isOptimizing }),
      setOptimizationProgress: (optimizationProgress) => set({ optimizationProgress }),
      setAddNewInstruments: (addNewInstruments) => set({ addNewInstruments }),
      setNewInstrumentCount: (newInstrumentCount) => set({ newInstrumentCount }),

      setTargetAllocations: (targetAllocations) => set({ targetAllocations }),
      setBacktestResult: (backtestResult) => set({ backtestResult }),
      setCurrentBacktest: (currentBacktest) => set({ currentBacktest }),

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
      setDriftThreshold: (driftThreshold) => set({ driftThreshold }),
      setMaxPositionWeight: (maxPositionWeight) => set({ maxPositionWeight }),
      setSlippageTolerance: (slippageTolerance) => set({ slippageTolerance }),

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
      setPolicyFrequency: (policyFrequency) => set({ policyFrequency }),

      reset: () => set(initialState),
      resetOptimization: () =>
        set({
          optimizationResult: null,
          backtestResult: null,
          currentBacktest: null,
          targetAllocations: [],
          validationResults: [],
          executionPlan: null,
          executionProgress: [],
          executionPhase: 'idle',
          finalPortfolio: null,
          executionSummary: null,
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
        riskLevel: state.riskLevel,
        optimizationMethod: state.optimizationMethod,
        addNewInstruments: state.addNewInstruments,
        newInstrumentCount: state.newInstrumentCount,
        driftThreshold: state.driftThreshold,
        maxPositionWeight: state.maxPositionWeight,
        slippageTolerance: state.slippageTolerance,
        policyFrequency: state.policyFrequency,
      }),
      skipHydration: true,
    },
  ),
);
