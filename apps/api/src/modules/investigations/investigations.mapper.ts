import { findingSchema, investigationProgressSchema, type InvestigationProgress } from '@taskos/shared-types';
import type { InvestigationProgressRecord } from './investigations.types.js';
import { sanitizeRuntimePublicMetadata } from './runtime-public-sanitizer.js';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export type PublicWorldExecutionState = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type PublicBusinessOutcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

interface ExecutionSemanticsRecord {
  status: string;
  experiments: Array<{
    status: string;
    evaluations: Array<{ passed: boolean; executionAttemptId?: string | null }>;
    attempts: Array<{ id?: string; status: string; result: unknown; startedAt?: Date | null; completedAt?: Date | null }>;
  }>;
}

const workerResultStatus = (value: unknown): string | undefined => {
  const status = record(value).status;
  return typeof status === 'string' ? status : undefined;
};

function latestExperiment(record: ExecutionSemanticsRecord) {
  return record.experiments[0];
}

export function deriveWorldExecutionState(world: ExecutionSemanticsRecord): PublicWorldExecutionState {
  const experiment = latestExperiment(world);
  const attempt = experiment?.attempts[0];
  const resultStatus = workerResultStatus(attempt?.result);

  if (world.status === 'CANCELLED' || experiment?.status === 'CANCELLED' || attempt?.status === 'CANCELLED') return 'CANCELLED';
  if (resultStatus === 'PASSED' || resultStatus === 'INVARIANT_VIOLATION') return 'COMPLETED';
  if (resultStatus === 'FAILED' || resultStatus === 'TIMED_OUT' || resultStatus === 'RUNNER_ERROR') return 'FAILED';
  if (attempt?.status === 'ERROR' || experiment?.status === 'ERROR') return 'FAILED';
  if (attempt?.status === 'RUNNING' || experiment?.status === 'RUNNING' || world.status === 'RUNNING') return 'RUNNING';
  if (attempt?.status === 'QUEUED' || experiment?.status === 'QUEUED' || world.status === 'GENERATED' || world.status === 'QUEUED') return 'QUEUED';

  // Legacy records used FAILED for both invariant violations and execution failures.
  // A completed attempt with conclusive evaluations is safe to expose as executed.
  if (attempt?.completedAt && experiment?.evaluations.length) return 'COMPLETED';
  if (world.status === 'COMPLETED' || experiment?.status === 'PASSED') return 'COMPLETED';
  return 'FAILED';
}

export function deriveWorldBusinessOutcome(world: ExecutionSemanticsRecord): PublicBusinessOutcome {
  if (deriveWorldExecutionState(world) !== 'COMPLETED') return 'INCONCLUSIVE';
  const experiment = latestExperiment(world);
  const attemptId = experiment?.attempts[0]?.id;
  const attemptEvaluations = attemptId
    ? experiment?.evaluations.filter((evaluation) => !evaluation.executionAttemptId || evaluation.executionAttemptId === attemptId) ?? []
    : experiment?.evaluations ?? [];
  if (!attemptEvaluations.length) return 'INCONCLUSIVE';
  return attemptEvaluations.some(({ passed }) => !passed) ? 'FAIL' : 'PASS';
}

const publicStatus = (status: string): InvestigationProgress['status'] => {
  if (status === 'PLANNING') return 'PLANNING';
  if (status === 'QUEUED') return 'QUEUED';
  if (status === 'PROVISIONING') return 'PROVISIONING';
  if (status === 'RUNNING') return 'RUNNING';
  if (status === 'OBSERVING') return 'OBSERVING';
  if (status === 'ADAPTING') return 'ADAPTING';
  if (status === 'REPRODUCING') return 'REPRODUCING';
  if (status === 'MINIMISING') return 'MINIMISING';
  if (status === 'COMPLETED') return 'COMPLETED';
  return 'FAILED';
};

export function mapProgress(record: InvestigationProgressRecord): InvestigationProgress {
  const counters = { queued: 0, running: 0, passed: 0, failed: 0 };
  for (const world of record.worlds) {
    const state = deriveWorldExecutionState(world);
    if (state === 'QUEUED') counters.queued++;
    else if (state === 'RUNNING') counters.running++;
    else if (state === 'COMPLETED') counters.passed++;
    else if (state === 'FAILED') counters.failed++;
  }
  return investigationProgressSchema.parse({
    id: record.id,
    status: publicStatus(record.status),
    // `passed` and `failed` are legacy counter names. They now mean technically
    // completed and technically failed. Cancelled worlds are neither.
    progress: { totalWorlds: Math.max(record.worlds.length, record.experiments.length), ...counters, flaky: 0 },
    recentEvents: record.events.map((event) => {
      const data = event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data as Record<string, unknown> : {};
      const { message, worldId, ...metadata } = data;
      return {
        id: event.id,
        investigationId: record.id,
        type: event.type,
        message: typeof message === 'string' ? message : event.type.replaceAll('_', ' '),
        createdAt: event.occurredAt.toISOString(),
        ...(typeof worldId === 'string' ? { worldId } : {}),
        ...(Object.keys(metadata).length ? { metadata: sanitizeRuntimePublicMetadata(metadata) } : {}),
      };
    }),
    findingsCount: record.findingsCount,
  });
}

interface WorldListRecord {
  id: string; investigationId: string; status: string; reason: string; configuration: unknown; createdAt: Date; updatedAt: Date;
  experiments: Array<{ id: string; status: string; evaluations: Array<{ passed: boolean; executionAttemptId: string | null }>; attempts: Array<{ id: string; status: string; result: unknown; workerId: string | null; startedAt: Date | null; completedAt: Date | null }> }>;
}
export function mapWorldList(records: WorldListRecord[]) {
  return records.map((world) => {
    const experiment = world.experiments[0]; const attempt = experiment?.attempts[0];
    const configuration = world.configuration && typeof world.configuration === 'object' && !Array.isArray(world.configuration) ? sanitizeRuntimePublicMetadata(world.configuration) as Record<string, unknown> : {};
    return { id: world.id, investigationId: world.investigationId, name: typeof configuration.name === 'string' ? configuration.name : 'World', status: world.status, executionState: deriveWorldExecutionState(world), businessOutcome: deriveWorldBusinessOutcome(world), reason: world.reason, configuration, ...(experiment ? { experimentId: experiment.id } : {}), ...(attempt?.workerId ? { workerId: attempt.workerId } : {}), createdAt: world.createdAt.toISOString(), ...(attempt?.startedAt ? { startedAt: attempt.startedAt.toISOString() } : {}), ...(attempt?.completedAt ? { completedAt: attempt.completedAt.toISOString() } : {}) };
  });
}

interface ExperimentListRecord { id: string; investigationId: string; worldId: string; status: string; kind: string; createdAt: Date; updatedAt: Date; world?: { status: string }; evaluations: Array<{ passed: boolean; executionAttemptId: string | null }>; _count: { attempts: number }; attempts: Array<{ id: string; status: string; result: unknown; startedAt: Date | null; completedAt: Date | null; exitCode: number | null; durationMs: number | null }> }
export function mapExperimentList(records: ExperimentListRecord[]) { return records.map((record) => {
  const latest = record.attempts[0];
  const semanticRecord = { status: record.world?.status ?? record.status, experiments: [{ status: record.status, evaluations: record.evaluations, attempts: record.attempts }] };
  return {
    id: record.id,
    investigationId: record.investigationId,
    worldId: record.worldId,
    status: record.status,
    executionState: deriveWorldExecutionState(semanticRecord),
    businessOutcome: deriveWorldBusinessOutcome(semanticRecord),
    kind: record.kind,
    attemptCount: record._count.attempts,
    latestAttempt: latest ? {
      id: latest.id,
      startedAt: latest.startedAt?.toISOString(),
      completedAt: latest.completedAt?.toISOString(),
      exitCode: latest.exitCode,
      durationMs: latest.durationMs,
    } : undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}); }

interface WorkerListRecord { id: string; status: string; providerId: string | null; createdAt: Date; updatedAt: Date; attempts: Array<{ id: string; status: string; startedAt: Date | null; completedAt: Date | null; exitCode: number | null; durationMs: number | null; experiment: { worldId: string; investigationId: string } }> }
export function mapWorkerList(records: WorkerListRecord[]) { return records.map((worker) => ({
  id: worker.id,
  provider: worker.providerId ?? 'LOCAL',
  status: worker.status,
  attempts: worker.attempts.map((attempt) => ({
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt?.toISOString(),
    completedAt: attempt.completedAt?.toISOString(),
    exitCode: attempt.exitCode,
    durationMs: attempt.durationMs,
    experiment: {
      worldId: attempt.experiment.worldId,
      investigationId: attempt.experiment.investigationId,
    },
  })),
  createdAt: worker.createdAt.toISOString(),
  updatedAt: worker.updatedAt.toISOString(),
})); }

interface EvidenceListRecord { id: string; experimentId: string; type: string; storageKey: string; mimeType: string; sizeBytes: bigint; checksum: string | null; redacted: boolean; createdAt: Date; metadata: unknown }
export function mapEvidenceList(records: EvidenceListRecord[]) { return records.map((artifact) => ({ id: artifact.id, experimentId: artifact.experimentId, type: artifact.type, path: artifact.storageKey, mimeType: artifact.mimeType, sizeBytes: Number(artifact.sizeBytes), checksum: artifact.checksum, redacted: artifact.redacted, metadata: sanitizeRuntimePublicMetadata(artifact.metadata), createdAt: artifact.createdAt.toISOString() })); }

interface FindingListRecord { id: string; investigationId: string; title: string; summary: string; severity: string; confidence: string; reproductionCount: number; causalConditions: unknown; createdAt: Date; updatedAt: Date }
export function mapFindingList(records: FindingListRecord[]) { return records.map((finding) => findingSchema.parse({ ...finding, causalConditions: finding.causalConditions, createdAt: finding.createdAt.toISOString(), updatedAt: finding.updatedAt.toISOString() })); }

interface FindingDetailRecord extends FindingListRecord {
  evidence: Array<{ artifact: EvidenceListRecord }>;
  reproductions: Array<{ id: string; experimentId: string; reproduced: boolean; createdAt: Date }>;
  minimisationRuns: Array<{
    id: string;
    status: string;
    completedTrials: number;
    currentRetainedConditions: unknown;
    removedConditions: unknown;
    inconclusiveConditions: unknown;
    knownPassingDelayMs: number | null;
    knownFailingDelayMs: number | null;
    finalReportEvidenceId: string | null;
  }>;
  minimalReproduction: { id: string; journeySteps: unknown; worldConfiguration: unknown; scriptArtifactId: string | null; createdAt: Date; updatedAt: Date } | null;
}
export function mapFindingDetail(finding: FindingDetailRecord) {
  const latestMinimisationRun = finding.minimisationRuns[0];
  const causalConditions = record(finding.causalConditions);
  const minimisation = record(causalConditions.minimisation);
  const enrichedConditions = latestMinimisationRun
    ? {
        ...causalConditions,
        minimisationRun: sanitizeRuntimePublicMetadata({
          id: latestMinimisationRun.id,
          status: latestMinimisationRun.status,
          completedTrials: latestMinimisationRun.completedTrials,
          retainedConditions: latestMinimisationRun.currentRetainedConditions,
          removedConditions: latestMinimisationRun.removedConditions,
          inconclusiveConditions: latestMinimisationRun.inconclusiveConditions,
          knownPassingDelayMs: latestMinimisationRun.knownPassingDelayMs,
          knownFailingDelayMs: latestMinimisationRun.knownFailingDelayMs,
          finalReportEvidenceId: latestMinimisationRun.finalReportEvidenceId,
        }),
        minimisation: {
          ...minimisation,
          retainedConditions: minimisation.retainedConditions ?? latestMinimisationRun.currentRetainedConditions,
          removedConditions: minimisation.removedConditions ?? latestMinimisationRun.removedConditions,
          inconclusiveConditions: minimisation.inconclusiveConditions ?? latestMinimisationRun.inconclusiveConditions,
          boundedRange: minimisation.boundedRange ?? {
            ...(latestMinimisationRun.knownPassingDelayMs !== null ? { lowerPassingBoundMs: latestMinimisationRun.knownPassingDelayMs } : {}),
            ...(latestMinimisationRun.knownFailingDelayMs !== null ? { upperFailingBoundMs: latestMinimisationRun.knownFailingDelayMs } : {}),
          },
        },
      }
    : causalConditions;
  const summary = findingSchema.parse({ ...finding, causalConditions: enrichedConditions, createdAt: finding.createdAt.toISOString(), updatedAt: finding.updatedAt.toISOString() });
  return {
    ...summary,
    evidence: mapEvidenceList(finding.evidence.map(({ artifact }) => artifact)),
    reproductions: finding.reproductions.map((run) => ({ ...run, createdAt: run.createdAt.toISOString() })),
    minimalReproduction: finding.minimalReproduction
      ? {
          ...finding.minimalReproduction,
          journeySteps: sanitizeRuntimePublicMetadata(finding.minimalReproduction.journeySteps),
          worldConfiguration: sanitizeRuntimePublicMetadata(finding.minimalReproduction.worldConfiguration),
          createdAt: finding.minimalReproduction.createdAt.toISOString(),
          updatedAt: finding.minimalReproduction.updatedAt.toISOString(),
        }
      : null,
  };
}
