import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseClient, Prisma } from '@taskos/database';
import type { EvidenceAnalysisResult } from './evidence-intelligence.types.js';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

export interface EvidenceIntelligenceCandidate {
  findingId: string;
  investigationId: string;
  worldId: string;
  experimentId: string;
  invariantType: string;
  expectedBehavior: string;
  observedOutcome: 'FAIL' | 'INCONCLUSIVE';
  worldDimensions: Record<string, string | number | boolean>;
  screenshots: Array<{ evidenceId: string; role: 'BEFORE' | 'AFTER' | 'FAILURE'; storageKey: string; mimeType: string; sizeBytes: bigint }>;
}

export interface PersistSupplementalEvidenceInput {
  investigationId: string;
  findingId: string;
  experimentId: string;
  sourceWorldId: string;
  storageKey: string;
  sizeBytes: bigint;
  checksum: string;
  result: EvidenceAnalysisResult;
}

export class EvidenceIntelligenceRepository {
  constructor(private readonly database: DatabaseClient) {}

  async candidates(investigationId: string, maxScreenshots: number): Promise<EvidenceIntelligenceCandidate[]> {
    const findings = await this.database.finding.findMany({
      where: { investigationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { evidence: { include: { artifact: true } } },
    });

    const candidates: EvidenceIntelligenceCandidate[] = [];
    for (const finding of findings) {
      if (finding.evidence.some(({ artifact }) => isNosanaSupplement(artifact.metadata))) continue;
      const conditions = record(finding.causalConditions);
      const worldId = string(conditions.sourceWorldId) ?? string(conditions.worldId);
      if (!worldId) continue;
      const screenshots = finding.evidence
        .map(({ artifact }) => artifact)
        .filter((artifact) => artifact.type === 'SCREENSHOT' && artifactWorldId(artifact.metadata) === worldId)
        .slice(0, maxScreenshots)
        .map((artifact, index) => ({ evidenceId: artifact.id, role: index === 0 ? 'BEFORE' as const : 'FAILURE' as const, storageKey: artifact.storageKey, mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes }));
      if (!screenshots.length) continue;
      const experimentId = screenshots[0]?.evidenceId
        ? finding.evidence.find(({ artifact }) => artifact.id === screenshots[0]!.evidenceId)?.artifact.experimentId
        : undefined;
      if (!experimentId) continue;
      candidates.push({
        findingId: finding.id,
        investigationId,
        worldId,
        experimentId,
        invariantType: firstString(conditions.failedInvariantIds) ?? 'UNKNOWN_INVARIANT',
        expectedBehavior: string(conditions.businessImpact) ?? finding.summary,
        observedOutcome: 'FAIL',
        worldDimensions: dimensions(record(conditions.minimalConditions)),
        screenshots,
      });
    }
    return candidates;
  }

  async persistSupplementalEvidence(input: PersistSupplementalEvidenceInput): Promise<string> {
    const artifactId = `evidence_nosana_${randomUUID()}`;
    await this.database.$transaction(async (transaction) => {
      await transaction.evidenceArtifact.create({
        data: {
          id: artifactId,
          experimentId: input.experimentId,
          type: 'WORKER_RESULT',
          storageProvider: 'nosana',
          storageKey: input.storageKey,
          mimeType: 'application/json',
          sizeBytes: input.sizeBytes,
          checksum: input.checksum,
          redacted: true,
          metadata: json({
            provider: 'NOSANA',
            role: 'SUPPLEMENTAL',
            authoritative: false,
            providerJobId: input.result.providerJobId,
            model: input.result.model,
            gpuName: input.result.gpuName ?? null,
            confidence: input.result.confidence,
            sourceWorldId: input.sourceWorldId,
            sourceEvidenceIds: input.result.sourceEvidenceIds,
            durationMs: input.result.durationMs,
            analysisStatus: input.result.status,
            summary: input.result.summary,
            visualChanges: input.result.visualChanges,
            likelyFailureMechanism: input.result.likelyFailureMechanism,
          }),
        },
      });
      await transaction.findingEvidence.create({ data: { findingId: input.findingId, artifactId } });
      await transaction.investigationEvent.create({
        data: {
          investigationId: input.investigationId,
          type: 'evidence_captured',
          data: json({
            message: 'Nosana GPU supplemental evidence analysis attached.',
            findingId: input.findingId,
            evidenceId: artifactId,
            provider: 'NOSANA',
            authoritative: false,
          }),
        },
      });
    });
    return artifactId;
  }
}

export function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isNosanaSupplement(metadata: unknown): boolean {
  const value = record(metadata);
  return value.provider === 'NOSANA' && value.role === 'SUPPLEMENTAL';
}

function artifactWorldId(metadata: unknown): string | undefined {
  const value = record(metadata);
  return string(value.worldId);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) ? value.find((item): item is string => typeof item === 'string' && item.trim().length > 0) : undefined;
}

function dimensions(value: Record<string, unknown>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean] => ['string', 'number', 'boolean'].includes(typeof entry[1])));
}
