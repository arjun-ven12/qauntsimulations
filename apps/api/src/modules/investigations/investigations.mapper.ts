import { findingSchema, investigationProgressSchema, type InvestigationProgress } from '@taskos/shared-types';
import type { InvestigationProgressRecord } from './investigations.types.js';

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
  for (const experiment of record.experiments) {
    if (experiment.status === 'QUEUED') counters.queued++;
    else if (experiment.status === 'RUNNING') counters.running++;
    else if (experiment.status === 'PASSED') counters.passed++;
    else counters.failed++;
  }
  return investigationProgressSchema.parse({
    id: record.id,
    status: publicStatus(record.status),
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
        ...(Object.keys(metadata).length ? { metadata } : {}),
      };
    }),
    findingsCount: record.findingsCount,
  });
}

interface WorldListRecord {
  id: string; investigationId: string; status: string; reason: string; configuration: unknown; createdAt: Date; updatedAt: Date;
  experiments: Array<{ id: string; attempts: Array<{ workerId: string | null; startedAt: Date | null; completedAt: Date | null }> }>;
}
export function mapWorldList(records: WorldListRecord[]) {
  return records.map((world) => {
    const experiment = world.experiments[0]; const attempt = experiment?.attempts[0];
    const configuration = world.configuration && typeof world.configuration === 'object' && !Array.isArray(world.configuration) ? world.configuration as Record<string, unknown> : {};
    return { id: world.id, investigationId: world.investigationId, name: typeof configuration.name === 'string' ? configuration.name : 'World', status: world.status, reason: world.reason, configuration, ...(experiment ? { experimentId: experiment.id } : {}), ...(attempt?.workerId ? { workerId: attempt.workerId } : {}), createdAt: world.createdAt.toISOString(), ...(attempt?.startedAt ? { startedAt: attempt.startedAt.toISOString() } : {}), ...(attempt?.completedAt ? { completedAt: attempt.completedAt.toISOString() } : {}) };
  });
}

interface ExperimentListRecord { id: string; investigationId: string; worldId: string; status: string; kind: string; createdAt: Date; updatedAt: Date; _count: { attempts: number }; attempts: Array<{ id: string; startedAt: Date | null; completedAt: Date | null; exitCode: number | null; durationMs: number | null }> }
export function mapExperimentList(records: ExperimentListRecord[]) { return records.map((record) => ({ id: record.id, investigationId: record.investigationId, worldId: record.worldId, status: record.status, kind: record.kind, attemptCount: record._count.attempts, latestAttempt: record.attempts[0] ? { ...record.attempts[0], startedAt: record.attempts[0].startedAt?.toISOString(), completedAt: record.attempts[0].completedAt?.toISOString() } : undefined, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() })); }

interface WorkerListRecord { id: string; status: string; providerId: string | null; createdAt: Date; updatedAt: Date; attempts: Array<{ id: string; status: string; startedAt: Date | null; completedAt: Date | null; exitCode: number | null; durationMs: number | null; experiment: { worldId: string; investigationId: string } }> }
export function mapWorkerList(records: WorkerListRecord[]) { return records.map((worker) => ({ id: worker.id, provider: worker.providerId ?? 'LOCAL', status: worker.status, attempts: worker.attempts.map((attempt) => ({ ...attempt, startedAt: attempt.startedAt?.toISOString(), completedAt: attempt.completedAt?.toISOString() })), createdAt: worker.createdAt.toISOString(), updatedAt: worker.updatedAt.toISOString() })); }

interface EvidenceListRecord { id: string; experimentId: string; type: string; storageKey: string; mimeType: string; sizeBytes: bigint; checksum: string | null; redacted: boolean; createdAt: Date; metadata: unknown }
export function mapEvidenceList(records: EvidenceListRecord[]) { return records.map((artifact) => ({ id: artifact.id, experimentId: artifact.experimentId, type: artifact.type, path: artifact.storageKey, mimeType: artifact.mimeType, sizeBytes: Number(artifact.sizeBytes), checksum: artifact.checksum, redacted: artifact.redacted, metadata: artifact.metadata, createdAt: artifact.createdAt.toISOString() })); }

interface FindingListRecord { id: string; investigationId: string; title: string; summary: string; severity: string; confidence: string; reproductionCount: number; causalConditions: unknown; createdAt: Date; updatedAt: Date }
export function mapFindingList(records: FindingListRecord[]) { return records.map((finding) => findingSchema.parse({ ...finding, causalConditions: finding.causalConditions, createdAt: finding.createdAt.toISOString(), updatedAt: finding.updatedAt.toISOString() })); }
