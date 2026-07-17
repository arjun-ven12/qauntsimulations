import type { CreateInvestigationInput } from '@taskos/shared-types';
import type { WorkerResult } from '@taskos/execution-contracts';
import type { WorkerExecutionEvent, WorkerExecutionProvider, WorkerProviderMetadata } from '../execution/worker-executor.types.js';
import type { DeterministicExperimentPlan, DeterministicWorldDefinition } from '../experiments/services/deterministic-experiment-plan.service.js';

export type { CreateInvestigationInput };

export interface InvestigationCreationScope {
  organisationId: string;
  scenarioId: string;
  environmentBaseUrl: string;
  invariantIds: string[];
}

export interface InvestigationProgressRecord {
  id: string;
  status: string;
  worlds: Array<{ id: string }>;
  experiments: Array<{ status: string }>;
  events: Array<{ id: string; type: string; occurredAt: Date; data: unknown }>;
  findingsCount: number;
}

export interface PersistedWorldExecution {
  investigationId: string;
  organisationId: string;
  projectId: string;
  environmentBaseUrl: string;
  invariantId: string;
  worldId: string;
  experimentId: string;
  workerId: string;
  attemptId: string;
  world: DeterministicWorldDefinition;
  provider: WorkerExecutionProvider;
}

export interface PersistedArtifactInput {
  type: 'SCREENSHOT' | 'VIDEO' | 'TRACE' | 'CONSOLE_LOG' | 'NETWORK_LOG' | 'WORKER_RESULT' | 'ENVIRONMENT_MANIFEST';
  storageKey: string;
  mimeType: string;
  sizeBytes: bigint;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export interface CompletedExecutionInput {
  execution: PersistedWorldExecution;
  result: WorkerResult;
  exitCode: number;
  artifacts: PersistedArtifactInput[];
  providerMetadata: WorkerProviderMetadata;
  stdoutSummary?: string;
  stderrSummary?: string;
}

export type PersistedExecutionEvent = WorkerExecutionEvent;

export interface InvestigationOrchestrationContext {
  id: string;
  organisationId: string;
  projectId: string;
  journeyId: string;
  scenarioId: string;
  environmentBaseUrl: string;
  planId: string;
  plan: DeterministicExperimentPlan;
}

export interface CreatedWorldRecord {
  id: string;
  experimentId: string;
  definition: DeterministicWorldDefinition;
}
