import type { CreateInvestigationInput } from '@taskos/shared-types';
import type { WorkerResult } from '@taskos/execution-contracts';
import type { WorkerExecutionEvent, WorkerExecutionProvider, WorkerProviderMetadata } from '../execution/worker-executor.types.js';
import type { FleetEvent } from '../execution/daytona-fleet.types.js';
import type { AdaptiveReproductionPlan, AdaptiveWorldDefinition } from '../experiments/services/adaptive-reproduction-plan.service.js';
import type { ReproductionComparisonResult } from '../experiments/services/reproduction-comparison.service.js';
import type { DeterministicExperimentPlan, DeterministicWorldDefinition } from '../experiments/services/deterministic-experiment-plan.service.js';

export type { CreateInvestigationInput };

export interface InvestigationCreationScope {
  organisationId: string;
  scenarioId: string;
  environmentBaseUrl: string;
  projectName: string;
  environmentName: string;
  journeyName: string;
  invariantIds: string[];
  invariants: Array<{ id: string; name: string; description?: string }>;
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
  attemptNumber: number;
  maximumAttempts: number;
}

export interface PersistedArtifactInput {
  type: 'SCREENSHOT' | 'VIDEO' | 'TRACE' | 'CONSOLE_LOG' | 'NETWORK_LOG' | 'WORKER_RESULT' | 'ENVIRONMENT_MANIFEST' | 'MINIMAL_REPRODUCTION' | 'FINAL_REPORT';
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
  attemptNumber?: number;
  maximumAttempts?: number;
}

export type PersistedExecutionEvent = WorkerExecutionEvent;
export type PersistedFleetEvent = FleetEvent;

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

export interface AdaptiveFindingCandidate {
  id: string;
  fingerprint: string;
  title: string;
  confidence: 'POSSIBLE' | 'PROBABLE' | 'CONFIRMED';
  reproductionCount: number;
  causalConditions: Record<string, unknown>;
  sourceWorldId: string;
  sourceExperimentId: string;
  sourceWorld: DeterministicWorldDefinition;
  invariantEvaluationIds: string[];
  evidenceArtifactIds: string[];
}

export interface AdaptiveWorldResultRecord {
  worldId: string;
  experimentId: string;
  purpose: AdaptiveWorldDefinition['adaptive']['adaptivePurpose'];
  world: DeterministicWorldDefinition;
  status: string;
  invariantEvaluationIds: string[];
  evidenceArtifactIds: string[];
}

export interface AdaptiveFindingUpdateInput {
  findingId: string;
  reproductionRunId: string;
  plan: AdaptiveReproductionPlan;
  comparison: ReproductionComparisonResult;
  previousConfidence: number;
  updatedConfidence: number;
  confidenceLabel: 'POSSIBLE' | 'PROBABLE' | 'CONFIRMED';
  confidenceExplanation: string[];
  reproducedIncrement: number;
}
