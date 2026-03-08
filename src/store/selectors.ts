import type { RebalanceState } from './rebalance-store';
import { STEPS } from '../constants/steps';

export function totalTargetWeight(state: RebalanceState): number {
  return state.targetAllocations.reduce((sum, a) => sum + a.weight, 0);
}

export function canValidate(state: RebalanceState): boolean {
  const nonCash = state.targetAllocations.filter((a) => !a.isCash);
  if (nonCash.length === 0) return false;
  const total = totalTargetWeight(state);
  return Math.abs(total - 1) < 0.005;
}

export function validationCounts(state: RebalanceState) {
  const results = state.validationResults;
  return {
    valid: results.filter((r) => r.status === 'valid').length,
    warning: results.filter((r) => r.status === 'warning').length,
    error: results.filter((r) => r.status === 'error').length,
  };
}

export function canExecute(state: RebalanceState): boolean {
  return state.validationResults.every((r) => r.status !== 'error');
}

export function isExecutionComplete(state: RebalanceState): boolean {
  return state.executionPhase === 'complete' || state.executionPhase === 'failed';
}

export function currentStepInfo(state: RebalanceState) {
  return STEPS[state.step] ?? STEPS[0]!;
}
