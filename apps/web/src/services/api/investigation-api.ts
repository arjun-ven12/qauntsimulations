import type {
  CreateInvestigationInput,
  Finding,
  InvestigationProgress,
  Project,
} from '@taskos/shared-types';
import { z } from 'zod';

export const apiErrorKindSchema = z.enum([
  'NOT_FOUND',
  'NETWORK',
  'INVALID_JSON',
  'SCHEMA_MISMATCH',
  'TIMEOUT',
  'CONTENT_TOO_LARGE',
  'UNSUPPORTED_CONTENT',
  'HTTP',
]);
export type ApiErrorKind = z.infer<typeof apiErrorKindSchema>;

export class InvestigationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: ApiErrorKind,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'InvestigationApiError';
  }
}

const jsonRecordSchema = z.record(z.unknown());
export const publicWorldExecutionStateSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export const publicBusinessOutcomeSchema = z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']);
export type PublicWorldExecutionState = z.infer<typeof publicWorldExecutionStateSchema>;
export type PublicBusinessOutcome = z.infer<typeof publicBusinessOutcomeSchema>;

export const investigationWorldSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  name: z.string(),
  status: z.string(),
  executionState: publicWorldExecutionStateSchema.optional(),
  businessOutcome: publicBusinessOutcomeSchema.optional(),
  reason: z.string(),
  configuration: z.unknown(),
  experimentId: z.string().optional(),
  workerId: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});
export type InvestigationWorld = z.infer<typeof investigationWorldSchema>;

export interface ExperimentPlanWorldResponse {
  reason?: string | undefined;
  [key: string]: unknown;
}

export interface ExperimentPlanResponse {
  objective: string;
  journeyId: string;
  scenarioId: string;
  worldPack: string;
  selectedVariables: string[];
  initialWorldCount: number;
  maximumWorldCount: number;
  maximumConcurrentWorkers: number;
  timeoutSeconds: number;
  retryCount: number;
  safetyConstraints: unknown[];
  invariants: unknown[];
  worlds: ExperimentPlanWorldResponse[];
  planningExplanation?: string | undefined;
  aiProvider?: string | undefined;
  estimatedComputeUnits?: number | undefined;
  plannerStatus?: string | undefined;
  plannerMetadata?: Record<string, unknown> | undefined;
}

export const experimentPlanResponseSchema: z.ZodType<ExperimentPlanResponse, z.ZodTypeDef, unknown> = z.object({
  objective: z.string(),
  journeyId: z.string(),
  scenarioId: z.string(),
  worldPack: z.string(),
  selectedVariables: z.array(z.string()),
  initialWorldCount: z.number().int().nonnegative(),
  maximumWorldCount: z.number().int().nonnegative(),
  maximumConcurrentWorkers: z.number().int().nonnegative(),
  timeoutSeconds: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  safetyConstraints: z.array(z.unknown()).optional().transform((value) => value ?? []),
  invariants: z.array(z.unknown()).optional().transform((value) => value ?? []),
  worlds: z.array(z.object({ reason: z.string().optional() }).passthrough()).optional().transform((value) => value ?? []),
  planningExplanation: z.string().optional(),
  aiProvider: z.string().optional(),
  estimatedComputeUnits: z.number().optional(),
  plannerStatus: z.string().optional(),
  plannerMetadata: jsonRecordSchema.optional(),
});

export const investigationExperimentSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  worldId: z.string(),
  status: z.string(),
  executionState: publicWorldExecutionStateSchema.optional(),
  businessOutcome: publicBusinessOutcomeSchema.optional(),
  kind: z.string(),
  attemptCount: z.number().int().nonnegative(),
  latestAttempt: z
    .object({
      id: z.string(),
      startedAt: z.string().nullable().optional(),
      completedAt: z.string().nullable().optional(),
      exitCode: z.number().nullable().optional(),
      durationMs: z.number().nullable().optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InvestigationExperiment = z.infer<typeof investigationExperimentSchema>;

export const investigationWorkerSchema = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.string(),
  attempts: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      startedAt: z.string().nullable().optional(),
      completedAt: z.string().nullable().optional(),
      exitCode: z.number().nullable().optional(),
      durationMs: z.number().nullable().optional(),
      experiment: z.object({ worldId: z.string(), investigationId: z.string() }),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InvestigationWorker = z.infer<typeof investigationWorkerSchema>;

const safeStoragePathSchema = z.string().refine(
  (path) => !path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path) && !path.includes('/Users/'),
  'Evidence paths must be relative storage keys',
);

export const evidenceArtifactResponseSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  type: z.string(),
  path: safeStoragePathSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().nullable().optional(),
  redacted: z.boolean(),
  metadata: jsonRecordSchema.optional(),
  createdAt: z.string(),
});
export type EvidenceArtifactResponse = z.infer<typeof evidenceArtifactResponseSchema>;

export const evidenceTextContentResponseSchema = z.object({
  evidenceId: z.string(),
  investigationId: z.string(),
  type: z.literal('FINAL_REPORT'),
  format: z.enum(['MARKDOWN', 'JSON', 'TEXT']),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().optional(),
  content: z.string(),
}).refine((response) => !JSON.stringify(response).includes('/Users/') && !/C:\\Users\\/i.test(JSON.stringify(response)), 'Report content response must not expose local filesystem paths');
export type EvidenceTextContentResponse = z.infer<typeof evidenceTextContentResponseSchema>;

export const findingDetailSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  title: z.string(),
  summary: z.string(),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  confidence: z.enum(['POSSIBLE', 'PROBABLE', 'CONFIRMED']),
  reproductionCount: z.number().int().nonnegative(),
  causalConditions: jsonRecordSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  evidence: z.array(evidenceArtifactResponseSchema),
  reproductions: z.array(
    z.object({
      id: z.string(),
      findingId: z.string().optional(),
      experimentId: z.string(),
      reproduced: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  minimalReproduction: z.unknown().nullable(),
});
export type FindingDetail = z.infer<typeof findingDetailSchema>;

export interface InvestigationApi {
  createInvestigation(input: CreateInvestigationInput): Promise<InvestigationProgress>;
  getInvestigation(investigationId: string): Promise<InvestigationProgress>;
  getExperimentPlan(investigationId: string): Promise<ExperimentPlanResponse | null>;
  getWorlds(investigationId: string): Promise<InvestigationWorld[]>;
  getExperiments(investigationId: string): Promise<InvestigationExperiment[]>;
  getWorkers(investigationId: string): Promise<InvestigationWorker[]>;
  getEvidence(investigationId: string): Promise<EvidenceArtifactResponse[]>;
  getEvidenceTextContent(investigationId: string, evidenceId: string): Promise<EvidenceTextContentResponse>;
  listProjects(): Promise<Project[]>;
  createProject(input: {
    name: string;
    description: string | null;
    repositoryUrl: string | null;
  }): Promise<Project>;
  listFindings(investigationId: string): Promise<Finding[]>;
  getFindingDetail(investigationId: string, findingId: string): Promise<FindingDetail>;
}

export type { CreateInvestigationInput };
