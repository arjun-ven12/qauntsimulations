import { z } from 'zod';
import { browserEngineSchema, injectedFaultSchema, journeyStepSchema, worldConfigSchema } from '@taskos/shared-types';

export const browserExecutionConfigSchema = z.object({
  engine: browserEngineSchema,
  headless: z.boolean().default(true),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  locale: z.string().default('en-US'),
  timezoneId: z.string().default('UTC'),
});
export type BrowserExecutionConfig = z.infer<typeof browserExecutionConfigSchema>;

export const journeyExecutionPlanSchema = z.object({ baseUrl: z.string().url(), steps: z.array(journeyStepSchema).min(1) });
export type JourneyExecutionPlan = z.infer<typeof journeyExecutionPlanSchema>;

export const faultInjectionConfigSchema = z.object({ faults: z.array(injectedFaultSchema) });
export type FaultInjectionConfig = z.infer<typeof faultInjectionConfigSchema>;

export const invariantEvaluationResultSchema = z.object({ invariantId: z.string(), name: z.string(), passed: z.boolean(), expected: z.unknown(), observed: z.unknown(), explanation: z.string().optional() });
export type InvariantEvaluationResult = z.infer<typeof invariantEvaluationResultSchema>;

export const evidenceManifestSchema = z.object({
  outputDirectory: z.string(),
  artifacts: z.array(z.object({ type: z.enum(['SCREENSHOT', 'VIDEO', 'TRACE', 'CONSOLE_LOG', 'NETWORK_LOG', 'DOM_SNAPSHOT', 'WORKER_RESULT', 'ENVIRONMENT_MANIFEST', 'MINIMAL_REPRODUCTION']), path: z.string(), mimeType: z.string(), sizeBytes: z.number().int().nonnegative().default(0) })),
});
export type EvidenceManifest = z.infer<typeof evidenceManifestSchema>;

export const workerJobSchema = z.object({
  jobVersion: z.literal('1'), workerId: z.string(), experimentId: z.string(), world: worldConfigSchema,
  browser: browserExecutionConfigSchema, journey: journeyExecutionPlanSchema, faults: faultInjectionConfigSchema,
  invariants: z.array(z.object({ id: z.string(), name: z.string(), assertion: z.record(z.unknown()) })),
  evidenceDirectory: z.string(), timeoutSeconds: z.number().int().positive(),
});
export type WorkerJob = z.infer<typeof workerJobSchema>;

export const workerResultSchema = z.object({
  workerId: z.string(), worldId: z.string(), experimentId: z.string(),
  status: z.enum(['PASSED', 'FAILED', 'ERROR', 'CANCELLED']),
  startedAt: z.string().datetime(), completedAt: z.string().datetime(),
  invariantViolations: z.array(invariantEvaluationResultSchema), evidence: evidenceManifestSchema,
  metrics: z.record(z.number()), firstDivergence: z.object({ stepId: z.string(), occurredAt: z.string().datetime(), description: z.string() }).nullable(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).nullable(),
});
export type WorkerResult = z.infer<typeof workerResultSchema>;
