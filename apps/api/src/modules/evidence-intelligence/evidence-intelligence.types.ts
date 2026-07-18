import { z } from 'zod';

const safeText = z.string().trim().min(1).max(2_000);
const optionalSafeText = z.string().trim().max(2_000).nullable();
const id = z.string().trim().min(1).max(200).refine((value) => !containsSecretOrPath(value), 'IDs must not contain host paths or secrets');
const safeReference = z.string().trim().min(1).max(2_000).refine((value) => !containsSecretOrPath(value), 'Evidence references must not contain host paths or secrets');

const dimensionValue = z.union([z.string().max(500), z.number().finite(), z.boolean()]);

export const evidenceAnalysisRequestSchema = z.object({
  investigationId: id,
  worldId: id,
  findingId: id.optional(),
  invariantType: safeText,
  expectedBehavior: safeText,
  observedOutcome: z.enum(['FAIL', 'INCONCLUSIVE']),
  screenshots: z.array(z.object({
    evidenceId: id,
    role: z.enum(['BEFORE', 'AFTER', 'FAILURE']),
    safeInputReference: safeReference,
  }).strict()).min(1).max(3),
  consoleSummary: z.array(z.string().max(500).refine((value) => !containsSecretOrPath(value), 'Console summaries must be sanitized')).max(20).optional(),
  accessibilitySummary: z.string().max(2_000).refine((value) => !containsSecretOrPath(value), 'Accessibility summaries must be sanitized').optional(),
  worldDimensions: z.record(dimensionValue).refine((value) => !containsSecretOrPath(JSON.stringify(value)), 'World dimensions must be sanitized'),
}).strict();

export type EvidenceAnalysisRequest = z.infer<typeof evidenceAnalysisRequestSchema>;

export const evidenceAnalysisResultSchema = z.object({
  provider: z.literal('NOSANA'),
  providerJobId: id,
  status: z.enum(['COMPLETED', 'FAILED', 'TIMED_OUT']),
  summary: optionalSafeText,
  visualChanges: z.array(z.object({
    region: z.string().trim().min(1).max(200),
    observation: z.string().trim().min(1).max(1_000).refine((value) => !containsSecretOrPath(value), 'Visual observations must be sanitized'),
    confidence: z.number().min(0).max(1),
  }).strict()).max(10),
  likelyFailureMechanism: optionalSafeText,
  sourceEvidenceIds: z.array(id).min(1).max(3),
  confidence: z.number().min(0).max(1).nullable(),
  model: z.string().trim().min(1).max(200).nullable(),
  gpuName: z.string().trim().min(1).max(200).nullable().optional(),
  durationMs: z.number().int().min(0).max(3_600_000).nullable(),
  errorCategory: z.enum([
    'CONFIGURATION_ERROR',
    'DEPLOYMENT_UNAVAILABLE',
    'REQUEST_TIMEOUT',
    'INVALID_RESPONSE',
    'INVALID_IMAGE',
    'IMAGE_TOO_LARGE',
    'PERSISTENCE_FAILED',
    'UNKNOWN_PROVIDER_ERROR',
  ]).nullable(),
}).strict().refine((value) => value.status === 'COMPLETED' || value.errorCategory, 'Failed analyses require a safe error category');

export type EvidenceAnalysisResult = z.infer<typeof evidenceAnalysisResultSchema>;

export interface EvidenceIntelligenceProvider {
  analyze(request: EvidenceAnalysisRequest, images: EvidenceAnalysisImage[]): Promise<EvidenceAnalysisResult>;
}

export interface EvidenceAnalysisImage {
  evidenceId: string;
  role: 'BEFORE' | 'AFTER' | 'FAILURE';
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: Uint8Array;
}

export function containsSecretOrPath(value: string): boolean {
  return /\/Users\/|\/private\/|\/var\/folders\/|\/home\/daytona\/|[A-Za-z]:[\\/]|authorization|bearer\s+|cookie|api[_-]?key|secret|seed phrase/i.test(value);
}
