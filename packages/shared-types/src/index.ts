import { z } from 'zod';

export const idSchema = z.string().min(1);
export const dateTimeSchema = z.string().datetime();
export const userRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export type UserRole = z.infer<typeof userRoleSchema>;

const timestampsSchema = z.object({
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const userSchema = timestampsSchema.extend({
  id: idSchema,
  email: z.string().email(),
  displayName: z.string().min(1),
});
export type User = z.infer<typeof userSchema>;

export const organisationSchema = timestampsSchema.extend({
  id: idSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  role: userRoleSchema.optional(),
});
export type Organisation = z.infer<typeof organisationSchema>;

export const projectSchema = timestampsSchema.extend({
  id: idSchema,
  organisationId: idSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  repositoryUrl: z.string().url().nullable(),
});
export type Project = z.infer<typeof projectSchema>;

export const environmentTypeSchema = z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION', 'DEMO']);
export const environmentSchema = timestampsSchema.extend({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  type: environmentTypeSchema,
  baseUrl: z.string().url(),
  manifest: z.record(z.unknown()).default({}),
});
export type Environment = z.infer<typeof environmentSchema>;

export const journeyStepSchema = z.object({
  id: idSchema,
  order: z.number().int().nonnegative(),
  action: z.enum(['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'WAIT', 'ASSERT', 'CUSTOM']),
  selector: z.string().nullable(),
  value: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
});
export type JourneyStep = z.infer<typeof journeyStepSchema>;

export const journeySchema = timestampsSchema.extend({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  steps: z.array(journeyStepSchema),
});
export type Journey = z.infer<typeof journeySchema>;

export const scenarioSchema = timestampsSchema.extend({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  prompt: z.string().min(1),
  controls: z.record(z.unknown()).default({}),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const invariantSchema = timestampsSchema.extend({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  assertion: z.record(z.unknown()),
});
export type Invariant = z.infer<typeof invariantSchema>;

export const browserEngineSchema = z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']);
export const viewportProfileSchema = z.enum(['DESKTOP', 'MOBILE', 'TABLET', 'CUSTOM']);
export const networkProfileSchema = z.enum(['NORMAL', 'SLOW_3G', 'FAST_3G', 'OFFLINE', 'CUSTOM']);
export const userProfileSchema = z.enum(['NORMAL', 'IMPATIENT', 'CONCURRENT', 'CUSTOM']);
export const faultTypeSchema = z.enum([
  'NETWORK_LATENCY',
  'PACKET_LOSS',
  'OFFLINE',
  'DOUBLE_SUBMIT',
  'PAYMENT_DELAY',
  'WEBHOOK_REORDER',
  'INVENTORY_RACE',
  'CUSTOM',
]);

export const injectedFaultSchema = z.object({
  type: faultTypeSchema,
  parameters: z.record(z.unknown()).default({}),
  startAfterMs: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().nullable().default(null),
});

export const worldConfigSchema = z.object({
  worldId: idSchema,
  browser: browserEngineSchema,
  viewport: viewportProfileSchema,
  networkProfile: networkProfileSchema,
  userProfile: userProfileSchema,
  concurrency: z.number().int().min(1).max(100),
  latencyMs: z.number().int().nonnegative(),
  bandwidthKbps: z.number().int().positive().nullable(),
  packetLossPercent: z.number().min(0).max(100),
  offlineDurationMs: z.number().int().nonnegative(),
  inventoryState: z.record(z.number().int()).default({}),
  sessionState: z.record(z.unknown()).default({}),
  paymentDelayMs: z.number().int().nonnegative(),
  retryIntervalMs: z.number().int().nonnegative(),
  doubleSubmit: z.boolean(),
  webhookOrder: z.array(z.string()),
  injectedFaults: z.array(injectedFaultSchema),
  randomSeed: z.number().int(),
  reason: z.string().min(1),
});
export type WorldConfig = z.infer<typeof worldConfigSchema>;

export const safetyConstraintSchema = z.object({
  type: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
});

export const experimentPlanSchema = z.object({
  objective: z.string().min(1),
  journeyId: idSchema,
  scenarioId: idSchema,
  worldPack: z.string().min(1),
  selectedVariables: z.array(z.string()),
  initialWorldCount: z.number().int().positive(),
  maximumWorldCount: z.number().int().positive(),
  maximumConcurrentWorkers: z.number().int().positive(),
  timeoutSeconds: z.number().int().positive(),
  retryCount: z.number().int().nonnegative(),
  safetyConstraints: z.array(safetyConstraintSchema),
  invariants: z.array(invariantSchema),
  worlds: z.array(worldConfigSchema),
  planningExplanation: z.string(),
  aiProvider: z.enum(['OPENAI', 'KIMI', 'MOCK']),
  estimatedComputeUnits: z.number().nonnegative(),
});
export type ExperimentPlan = z.infer<typeof experimentPlanSchema>;

export const investigationStatusSchema = z.enum([
  'DRAFT', 'PLANNING', 'PLAN_READY', 'QUEUED', 'PROVISIONING', 'RUNNING', 'OBSERVING',
  'ADAPTING', 'REPRODUCING', 'MINIMISING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED',
]);
export type InvestigationStatus = z.infer<typeof investigationStatusSchema>;

export const investigationEventTypeSchema = z.enum([
  'plan_created', 'world_generated', 'worker_queued', 'sandbox_provisioning', 'sandbox_ready',
  'experiment_started', 'evidence_captured', 'invariant_violated', 'follow_up_generated',
  'reproduction_started', 'finding_confirmed', 'minimisation_started',
  'investigation_completed', 'investigation_failed',
]);

export const investigationSchema = timestampsSchema.extend({
  id: idSchema,
  projectId: idSchema,
  environmentId: idSchema,
  journeyId: idSchema,
  scenarioId: idSchema,
  name: z.string().min(1),
  status: investigationStatusSchema,
  plan: experimentPlanSchema.nullable(),
  aggregateProgress: z.number().min(0).max(100),
  workerCounts: z.object({ queued: z.number(), running: z.number(), completed: z.number(), failed: z.number() }),
  recentEvents: z.array(z.object({ id: idSchema, type: investigationEventTypeSchema, occurredAt: dateTimeSchema, data: z.record(z.unknown()) })),
  findingsCount: z.number().int().nonnegative(),
  elapsedTimeSeconds: z.number().int().nonnegative(),
});
export type Investigation = z.infer<typeof investigationSchema>;

export const worldSchema = timestampsSchema.extend({ id: idSchema, investigationId: idSchema, status: z.enum(['GENERATED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']), config: worldConfigSchema });
export type World = z.infer<typeof worldSchema>;

export const experimentSchema = timestampsSchema.extend({ id: idSchema, worldId: idSchema, status: z.enum(['QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'CANCELLED']), attemptCount: z.number().int().nonnegative() });
export type Experiment = z.infer<typeof experimentSchema>;

export const workerProgressSchema = z.object({ workerId: idSchema, status: z.enum(['IDLE', 'QUEUED', 'PROVISIONING', 'READY', 'RUNNING', 'COMPLETED', 'FAILED', 'TERMINATED']), progress: z.number().min(0).max(100), message: z.string().optional() });
export type WorkerProgress = z.infer<typeof workerProgressSchema>;

export const evidenceArtifactSchema = timestampsSchema.extend({ id: idSchema, experimentId: idSchema, type: z.enum(['SCREENSHOT', 'VIDEO', 'TRACE', 'CONSOLE_LOG', 'NETWORK_LOG', 'DOM_SNAPSHOT', 'WORKER_RESULT', 'ENVIRONMENT_MANIFEST', 'MINIMAL_REPRODUCTION']), path: z.string(), mimeType: z.string(), sizeBytes: z.number().int().nonnegative(), redacted: z.boolean() });
export type EvidenceArtifact = z.infer<typeof evidenceArtifactSchema>;

export const findingSchema = timestampsSchema.extend({ id: idSchema, investigationId: idSchema, title: z.string(), summary: z.string(), severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), confidence: z.enum(['POSSIBLE', 'PROBABLE', 'CONFIRMED']), reproductionCount: z.number().int().nonnegative(), causalConditions: z.record(z.unknown()) });
export type Finding = z.infer<typeof findingSchema>;

export const minimalReproductionSchema = timestampsSchema.extend({ id: idSchema, findingId: idSchema, steps: z.array(journeyStepSchema), worldConfig: worldConfigSchema, scriptArtifactId: idSchema.nullable() });
export type MinimalReproduction = z.infer<typeof minimalReproductionSchema>;

export const repairVerificationSchema = z.object({ repairId: idSchema, status: z.enum(['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'INCONCLUSIVE']), originalFailureReproduced: z.boolean().nullable(), regressionsDetected: z.boolean().nullable() });
export type RepairVerification = z.infer<typeof repairVerificationSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), hasNextPage: z.boolean() });
export type PaginatedResponse<T> = { items: T[]; page: number; pageSize: number; total: number; hasNextPage: boolean };

export const apiErrorResponseSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional(), requestId: z.string().optional() }) });
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
