// ── Navigation ──────────────────────────────────────────
export enum RebalanceStep {
  Connect = 0,
  Portfolio = 1,
  Optimize = 2,
  Execute = 3,
  Results = 4,
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
  effectiveExposure?: number;
  instrumentTypeId?: number;
  isCopy?: boolean;
  isMixed?: boolean;
}

export interface PortfolioAnalysis {
  holdings: PortfolioHolding[];
  directHoldings?: PortfolioHolding[];
  copyHoldings?: PortfolioHolding[];
  totalValue: number;
  investedValue: number;
  availableCash: number;
  totalPnL?: number;
  cashWeight: number;
  timestamp: string;
  directEquity?: number;
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
export type OptimizationMethod = 'equal-weight' | 'min-variance' | 'risk-parity' | 'mvo' | 'market-cap';

export interface OptimizationData {
  instrumentIds: number[];
  symbols: string[];
  dailyReturns: number[][];
  meanReturns: number[];
  covarianceMatrix: number[][];
  volatilities: number[];
  correlationMatrix: number[][];
  tradingDays?: number[];
  dataPoints: number;
}

export interface OptimizationRecommendation {
  instrumentId: number;
  symbol: string;
  displayName?: string;
  targetWeight: number;
  currentWeight?: number;
  reason?: string;
  diversificationScore?: number;
  compositeScore?: number;
  momentumScore?: number;
  oneYearPriceChange?: number;
}

export interface OptimizationConstraints {
  maxWeight: number;
  minWeight: number;
  m: number;
  n: number;
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
  newRecommendations?: OptimizationRecommendation[];
  existingReweighted?: OptimizationRecommendation[];
  constraints?: OptimizationConstraints;
  marketCapCoverage?: {
    confirmed: number;
    estimated: number;
  };
  backtest?: BacktestResult;
  currentBacktest?: BacktestResult;
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

// ── Backtest ───────────────────────────────────────────
export interface BacktestResult {
  equity_curve: [number, number][];
  benchmark_curve: [number, number][];
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
