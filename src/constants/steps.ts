import { RebalanceStep } from '../types/rebalancer';

export interface StepInfo {
  step: RebalanceStep;
  label: string;
  shortLabel: string;
  description: string;
}

export const STEPS: StepInfo[] = [
  { step: RebalanceStep.Connect, label: 'Connect to eToro', shortLabel: 'Connect', description: 'Enter your API credentials to connect' },
  { step: RebalanceStep.Configure, label: 'Configure Service', shortLabel: 'Configure', description: 'Set service mode and automation preferences' },
  { step: RebalanceStep.Portfolio, label: 'Current Portfolio', shortLabel: 'Portfolio', description: 'Review your current holdings and allocation' },
  { step: RebalanceStep.Optimize, label: 'Optimize Portfolio', shortLabel: 'Optimize', description: 'Choose an optimization strategy' },
  { step: RebalanceStep.Target, label: 'Target Allocation', shortLabel: 'Target', description: 'Review and adjust target weights' },
  { step: RebalanceStep.Backtest, label: 'Backtest Strategy', shortLabel: 'Backtest', description: 'Test your allocation with historical data' },
  { step: RebalanceStep.Validation, label: 'Validate Instruments', shortLabel: 'Validate', description: 'Check availability and tradability' },
  { step: RebalanceStep.Execution, label: 'Execute Rebalance', shortLabel: 'Execute', description: 'Close, adjust, and open positions' },
  { step: RebalanceStep.Results, label: 'Results', shortLabel: 'Results', description: 'Review the rebalance outcome' },
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
