import { RebalanceStep } from '../types/rebalancer';

export interface StepInfo {
  step: RebalanceStep;
  label: string;
  shortLabel: string;
  description: string;
}

export const STEPS: StepInfo[] = [
  { step: RebalanceStep.Connect,   label: 'Connect to eToro',     shortLabel: 'Connect',   description: 'Sign in with your eToro account' },
  { step: RebalanceStep.Portfolio, label: 'Portfolio Health',      shortLabel: 'Portfolio', description: 'Review holdings, health score and insights' },
  { step: RebalanceStep.Optimize,  label: 'Optimize Portfolio',    shortLabel: 'Optimize',  description: 'Configure risk, optimize and preview backtest' },
  { step: RebalanceStep.Execute,   label: 'Execute Trades',        shortLabel: 'Execute',   description: 'Review and execute portfolio changes' },
  { step: RebalanceStep.Results,   label: 'Results',               shortLabel: 'Results',   description: 'Review outcome and set auto-rebalance' },
];

export const EXECUTION_PHASES = [
  { id: 'closing', title: 'Closing Positions', description: 'Closing positions not in target portfolio' },
  { id: 'partial-closing', title: 'Reducing Positions', description: 'Partially closing overweight positions' },
  { id: 'opening', title: 'Opening Positions', description: 'Buying underweight and new instruments' },
];

export const PIE_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4',
  '#E91E63', '#3F51B5', '#FF5722', '#009688', '#FFC107',
  '#795548', '#607D8B', '#8BC34A', '#CDDC39', '#F44336',
  '#673AB7', '#03A9F4', '#FF6F00', '#1B5E20', '#880E4F',
];

export const CASH_COLOR = '#9E9E9E';
