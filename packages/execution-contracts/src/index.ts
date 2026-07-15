import { z } from 'zod';

const journeyStepMetadataSchema = z.object({
  name: z.string().min(1).optional(),
  screenshotCheckpoint: z.boolean().optional(),
  continueOnFailure: z.boolean().optional(),
});

export const journeyStepSchema = z.discriminatedUnion('type', [
  journeyStepMetadataSchema.extend({ type: z.literal('goto'), path: z.string().min(1) }),
  journeyStepMetadataSchema.extend({ type: z.literal('click'), selector: z.string().min(1) }),
  journeyStepMetadataSchema.extend({ type: z.literal('doubleClick'), selector: z.string().min(1) }),
  journeyStepMetadataSchema.extend({ type: z.literal('fill'), selector: z.string().min(1), value: z.string() }),
  journeyStepMetadataSchema.extend({ type: z.literal('waitFor'), selector: z.string().min(1), timeoutMs: z.number().int().positive().optional() }),
  journeyStepMetadataSchema.extend({ type: z.literal('wait'), durationMs: z.number().int().nonnegative() }),
  journeyStepMetadataSchema.extend({ type: z.literal('reload') }),
  journeyStepMetadataSchema.extend({ type: z.literal('assertVisible'), selector: z.string().min(1) }),
  journeyStepMetadataSchema.extend({ type: z.literal('assertText'), selector: z.string().min(1), expectedText: z.string() }),
]);
export type JourneyStep = z.infer<typeof journeyStepSchema>;

export const journeyAssertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visible'), selector: z.string().min(1) }),
  z.object({ type: z.literal('text'), selector: z.string().min(1), expectedText: z.string() }),
]);
export type JourneyAssertion = z.infer<typeof journeyAssertionSchema>;

export const viewportSchema = z.union([
  z.enum(['desktop', 'mobile']),
  z.object({ width: z.number().int().min(240).max(7680), height: z.number().int().min(240).max(4320) }),
]);

export const requestFailureRuleSchema = z.object({
  urlPatterns: z.array(z.string().min(1)).min(1),
  resourceTypes: z.array(z.string().min(1)).optional(),
  failureCode: z.enum(['failed', 'aborted', 'accessdenied', 'addressunreachable', 'connectionaborted', 'connectionclosed', 'connectionfailed', 'connectionrefused', 'connectionreset', 'internetdisconnected', 'namenotresolved', 'timedout']).default('failed'),
  maxFailures: z.number().int().positive().default(1),
});

export const workerJobSchema = z.object({
  workerId: z.string().min(1),
  experimentId: z.string().min(1),
  worldId: z.string().min(1),
  target: z.object({ baseUrl: z.string().url(), journeyPath: z.string().optional() }),
  browser: z.object({
    engine: z.enum(['chromium', 'webkit', 'firefox']),
    viewport: viewportSchema,
    headless: z.boolean(),
  }),
  journey: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    steps: z.array(journeyStepSchema).min(1),
    successCondition: journeyAssertionSchema,
  }),
  world: z.object({
    userProfile: z.enum(['normal', 'impatient']),
    networkProfile: z.enum(['normal', 'high-latency', 'low-bandwidth', 'offline-interruption']),
    latencyMs: z.number().int().nonnegative(),
    bandwidthKbps: z.number().int().positive().optional(),
    offlineDurationMs: z.number().int().nonnegative().optional(),
    offlineAtStep: z.number().int().nonnegative().optional(),
    paymentDelayMs: z.number().int().nonnegative().optional(),
    retryIntervalMs: z.number().int().nonnegative().optional(),
    doubleSubmit: z.boolean(),
    clearStorageBeforeRun: z.boolean().optional(),
    expireSessionAtStep: z.number().int().nonnegative().optional(),
    submitSelector: z.string().min(1).optional(),
    paymentUrlPatterns: z.array(z.string().min(1)).optional(),
    orderUrlPatterns: z.array(z.string().min(1)).optional(),
    requestFailures: z.array(requestFailureRuleSchema).optional(),
    randomSeed: z.number().int(),
    reason: z.string().min(1),
  }),
  invariants: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER']),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    config: z.record(z.unknown()).optional(),
  })),
  evidence: z.object({
    outputDirectory: z.string().min(1), screenshots: z.boolean(), trace: z.boolean(),
    console: z.boolean(), network: z.boolean(), video: z.boolean(),
  }),
  limits: z.object({ timeoutMs: z.number().int().positive().max(3_600_000) }),
});
export type WorkerJob = z.infer<typeof workerJobSchema>;

export const networkEventSchema = z.object({
  id: z.string(), url: z.string(), method: z.string(), requestTimestamp: z.string().datetime(),
  responseTimestamp: z.string().datetime().optional(), durationMs: z.number().nonnegative().optional(),
  statusCode: z.number().int().optional(), failureReason: z.string().optional(), resourceType: z.string(),
  isPaymentRequest: z.boolean(), isOrderRequest: z.boolean(),
});
export type NetworkEvent = z.infer<typeof networkEventSchema>;

export const journeyActionSchema = z.object({
  stepIndex: z.number().int().nonnegative(), type: z.string(), name: z.string().optional(), selector: z.string().optional(),
  startedAt: z.string().datetime(), completedAt: z.string().datetime().optional(), status: z.enum(['COMPLETED', 'FAILED', 'CONTINUED']),
  error: z.string().optional(), interactionTimestamps: z.array(z.string().datetime()).optional(), interactionIntervalMs: z.number().nonnegative().optional(),
});
export type JourneyAction = z.infer<typeof journeyActionSchema>;

export const invariantEvaluationResultSchema = z.object({
  invariantId: z.string(), type: z.string(), passed: z.boolean(), expected: z.unknown(), observed: z.unknown(),
  confidence: z.number().min(0).max(1), evidenceReferences: z.array(z.string()), explanation: z.string(),
});
export type InvariantEvaluationResult = z.infer<typeof invariantEvaluationResultSchema>;

export const appliedFaultSchema = z.object({ type: z.string(), parameters: z.record(z.unknown()), appliedAt: z.string().datetime() });
export type AppliedFault = z.infer<typeof appliedFaultSchema>;

export const workerResultSchema = z.object({
  workerId: z.string(), experimentId: z.string(), worldId: z.string(),
  status: z.enum(['PASSED', 'FAILED', 'INVARIANT_VIOLATION', 'TIMED_OUT', 'RUNNER_ERROR']),
  startedAt: z.string().datetime(), completedAt: z.string().datetime(), durationMs: z.number().nonnegative(),
  journey: z.object({
    completed: z.boolean(), completedSteps: z.number().int().nonnegative(), totalSteps: z.number().int().nonnegative(),
    failedStep: z.object({ index: z.number().int().nonnegative(), name: z.string().optional(), type: z.string(), selector: z.string().optional(), error: z.string() }).optional(),
  }),
  invariantEvaluations: z.array(invariantEvaluationResultSchema),
  metrics: z.object({ requestCount: z.number().int().nonnegative(), failedRequestCount: z.number().int().nonnegative(), paymentRequestCount: z.number().int().nonnegative(), orderRequestCount: z.number().int().nonnegative(), consoleErrorCount: z.number().int().nonnegative() }),
  firstDivergence: z.object({ category: z.enum(['JOURNEY', 'NETWORK', 'CONSOLE', 'INVARIANT']), timestamp: z.string().datetime(), summary: z.string(), evidenceReferences: z.array(z.string()) }).optional(),
  evidence: z.object({ manifestPath: z.string(), tracePath: z.string().optional(), videoPath: z.string().optional(), screenshotPaths: z.array(z.string()), consoleLogPath: z.string().optional(), networkLogPath: z.string().optional() }),
  appliedFaults: z.array(appliedFaultSchema),
  error: z.object({ code: z.string(), message: z.string(), stack: z.string().optional() }).optional(),
});
export type WorkerResult = z.infer<typeof workerResultSchema>;

export const evidenceManifestSchema = z.object({
  workerId: z.string(), worldId: z.string(), experimentId: z.string(), startedAt: z.string().datetime(), completedAt: z.string().datetime(),
  browser: z.object({ playwrightVersion: z.string(), engine: z.enum(['chromium', 'webkit', 'firefox']), version: z.string(), viewport: z.object({ width: z.number(), height: z.number() }), headless: z.boolean() }),
  world: workerJobSchema.shape.world, randomSeed: z.number().int(), appliedFaults: z.array(appliedFaultSchema),
  journeyStepsAttempted: z.array(journeyActionSchema), artifacts: z.array(z.object({ type: z.string(), path: z.string(), mimeType: z.string().optional(), sizeBytes: z.number().int().nonnegative().optional() })),
  outcome: workerResultSchema.shape.status, errorSummary: z.string().optional(), evidenceErrors: z.array(z.string()).default([]),
});
export type EvidenceManifest = z.infer<typeof evidenceManifestSchema>;
