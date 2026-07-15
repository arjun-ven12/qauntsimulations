import type { LegacyInvestigationStatus } from '@taskos/shared-types';
const transitions: Record<LegacyInvestigationStatus, readonly LegacyInvestigationStatus[]> = {
  DRAFT: ['PLANNING', 'CANCELLED'], PLANNING: ['PLAN_READY', 'FAILED', 'CANCELLED'], PLAN_READY: ['QUEUED', 'CANCELLED'],
  QUEUED: ['PROVISIONING', 'CANCELLED'], PROVISIONING: ['RUNNING', 'FAILED', 'CANCELLED'], RUNNING: ['OBSERVING', 'FAILED', 'CANCELLED'],
  OBSERVING: ['ADAPTING', 'REPRODUCING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'], ADAPTING: ['RUNNING', 'REPRODUCING', 'FAILED', 'CANCELLED'],
  REPRODUCING: ['ADAPTING', 'MINIMISING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'], MINIMISING: ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [], PARTIALLY_COMPLETED: [], FAILED: [], CANCELLED: [],
};
export function canTransitionInvestigation(from: LegacyInvestigationStatus, to: LegacyInvestigationStatus): boolean { return transitions[from].includes(to); }
