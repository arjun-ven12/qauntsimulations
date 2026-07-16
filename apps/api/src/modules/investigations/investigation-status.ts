import type { InvestigationStatus } from '@taskos/shared-types';

type RuntimeInvestigationStatus = InvestigationStatus | 'CANCELLED';
const transitions: Record<RuntimeInvestigationStatus, readonly RuntimeInvestigationStatus[]> = {
  PLANNING: ['QUEUED', 'FAILED', 'CANCELLED'],
  QUEUED: ['RUNNING', 'FAILED', 'CANCELLED'],
  PROVISIONING: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: ['OBSERVING', 'FAILED', 'CANCELLED'],
  OBSERVING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  ADAPTING: ['FAILED', 'CANCELLED'],
  REPRODUCING: ['FAILED', 'CANCELLED'],
  MINIMISING: ['FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionInvestigation(from: RuntimeInvestigationStatus, to: RuntimeInvestigationStatus): boolean {
  return transitions[from].includes(to);
}
