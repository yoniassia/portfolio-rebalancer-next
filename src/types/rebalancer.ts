// ── Navigation ──────────────────────────────────────────
export enum RebalanceStep {
  Connect = 0,
  Configure = 1,
  Portfolio = 2,
  Optimize = 3,
  Target = 4,
  Backtest = 5,
  Validation = 6,
  Execution = 7,
  Results = 8,
}

// ── Service Configuration ───────────────────────────────
export type ServiceMode = 'auto' | 'semi-auto' | 'manual';
export type ActivationMode = 'trigger' | 'scheduled' | 'manual';
export type AutonomyLevel = 'full-auto' | 'approve' | 'inform';

// ── Trade & Execution Types ────────────────────────────
export type TradeAction = 'full-close' | 'partial-close' | 'buy';
export type TradeStatus = 'pending' | 'executing' | 'success' | 'failed' | 'skipped';
export type ExecutionPhase = 'idle' | 'closing' | 'partial-closing' | 'opening' | 'complete' | 'failed';
export type AutoRebalanceMode = 'trigger' | 'scheduled' | 'manual';

// ── Portfolio Analysis ─────────────────────────────────
export interface Position {
  positionID: number;
  instrumentID: number;
  isBuy: boolean;
  amount: number;
  units: number;
  openRate: number;
  leverage: number;
  stopLossRate: number | null;
  takeProfitRate: number | null;
  isOpen: boolean;
  [key: string]: unknown;
}

export interface PortfolioHolding {
  instrumentId: number;
  symbol: string;
  displayName: string;
  positions: Position[];
  totalUnits: number;
  totalValue: number;
  investedAmount: number;
  weight: number;
  pnl: number;
}

export interface PortfolioAnalysis {
  holdings: PortfolioHolding[];
  totalValue: number;
  investedValue: number;
  availableCash: number;
  cashWeight: number;
  timestamp: string;
}

// ── Target Allocation ──────────────────────────────────
export interface TargetAllocation {
  symbol: string;
  weight: number;
  instrumentId?: number;
  isCash?: boolean;
  displayName?: string;
}

// ── Drift Analysis ─────────────────────────────────────
export interface DriftItem {
  symbol: string;
  instrumentId?: number;
  currentWeight: number;
  targetWeight: number;
  drift: number;
  driftPercent: number;
}

export interface DriftAnalysis {
  drifts: DriftItem[];
  maxAbsDrift: number;
  isWithinBand: (threshold: number) => boolean;
}

// ── Validation ─────────────────────────────────────────
export interface InstrumentValidation {
  symbol: string;
  instrumentId?: number;
  displayName?: string;
  isValid: boolean;
  isOpen: boolean;
  isTradable: boolean;
  isBuyEnabled: boolean;
  error?: string;
  status: 'valid' | 'warning' | 'error';
}

// ── Planning ───────────────────────────────────────────
export interface PlannedTrade {
  symbol: string;
  instrumentId: number;
  action: TradeAction;
  positionId?: number;
  amount: number;
  units?: number;
  reason: string;
}

export interface RebalancePlan {
  fullCloses: PlannedTrade[];
  partialCloses: PlannedTrade[];
  opens: PlannedTrade[];
  estimatedCashFromCloses: number;
  estimatedCashNeeded: number;
  estimatedCashAfter: number;
}

// ── Execution ──────────────────────────────────────────
export interface TradeProgress extends PlannedTrade {
  status: TradeStatus;
  orderId?: number;
  error?: string;
  executedAt?: string;
  actualAmount?: number;
}

export interface ExecutionSummary {
  totalTrades: number;
  successful: number;
  failed: number;
  skipped: number;
  totalFeesEstimate: number;
  startedAt: string;
  completedAt: string;
  trades: TradeProgress[];
}

// ── Optimization ───────────────────────────────────────
export type OptimizationMethod = 'equal-weight' | 'min-variance' | 'risk-parity' | 'mvo';

export interface OptimizationData {
  instrumentIds: number[];
  symbols: string[];
  dailyReturns: number[][];
  meanReturns: number[];
  covarianceMatrix: number[][];
  volatilities: number[];
  correlationMatrix: number[][];
  dataPoints: number;
}

export interface OptimizationResult {
  weights: number[];
  method: OptimizationMethod;
  instrumentIds: number[];
  symbols: string[];
  metrics: {
    expectedReturn: number;
    expectedVolatility: number;
    sharpeRatio: number;
    maxWeight: number;
    diversificationRatio: number;
  };
  riskContributions: number[];
  dataQuality: {
    dataPoints: number;
    missingInstruments: string[];
  };
}

export interface RiskProfile {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  method: OptimizationMethod;
  params: Record<string, number>;
  description: string;
  expectedVolRange: [number, number];
  maxDrawdownGuide: number;
}

// ── Auto-Rebalance Config ──────────────────────────────
export interface AutoRebalanceConfig {
  enabled: boolean;
  mode: AutoRebalanceMode;
  driftThreshold: number;
  cryptoThreshold: number;
  checkIntervalMs: number;
  schedule?: {
    frequency: 'weekly' | 'monthly';
    dayOfWeek?: number;
    dayOfMonth?: number;
    hour: number;
    minute: number;
  };
  cooldownMs: number;
}
