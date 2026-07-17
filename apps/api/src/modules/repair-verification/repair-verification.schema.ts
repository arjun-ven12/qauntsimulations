import { z } from 'zod';

export const repairVerificationTargetInputSchema = z.object({
  environmentId: z.string().trim().min(1).max(191),
  deploymentVersion: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2_000).optional(),
  acknowledgement: z.literal(true, {
    errorMap: () => ({ message: 'Authorised-testing acknowledgement is required' }),
  }),
}).strict();

export const repairVerificationIdempotencyKeySchema = z.string().trim().min(1).max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Idempotency-Key contains unsupported characters');

export const repairVerificationCancellationInputSchema = z.object({
  reason: z.string().trim().min(1).max(1_000).optional(),
}).strict().default({});

export const repairVerificationTargetsResponseSchema = z.object({
  findingId: z.string().min(1),
  environments: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), type: z.string().nullable(), status: z.string().min(1),
    selectable: z.boolean(), disabledReason: z.string().nullable(),
  })),
});

export const repairVerificationExecutionStatusSchema = z.enum([
  'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED',
]);
export const repairVerificationResultSchema = z.enum([
  'FIX_CONFIRMED', 'DEFECT_STILL_PRESENT', 'REGRESSION_DETECTED', 'INCONCLUSIVE',
]);
export const repairVerificationBusinessOutcomeSchema = z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']);

export const repairVerificationWorldPurposeSchema = z.enum([
  'REPAIR_MINIMAL_REPRODUCTION',
  'REPAIR_PASSING_CONTROL',
  'REPAIR_BOUNDARY_REGRESSION',
]);

export const repairVerificationPlanWorldSchema = z.object({
  key: z.string().min(1),
  purpose: repairVerificationWorldPurposeSchema,
  sourceWorldId: z.string().min(1).optional(),
  reason: z.string().min(1),
  configuration: z.record(z.unknown()),
});

export const repairVerificationPlanPreviewSchema = z.object({
  version: z.literal(1),
  originalInvestigationId: z.string().min(1),
  environmentId: z.string().min(1),
  journey: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  invariants: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    severity: z.string().min(1),
  })).min(1),
  maximumWorldCount: z.literal(6),
  worlds: z.array(repairVerificationPlanWorldSchema).min(2).max(6),
});

export const repairVerificationEligibilityIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  category: z.enum(['BLOCKING', 'DATA_GAP']),
});

export const repairVerificationEligibilityWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const repairVerificationEligibilitySummarySchema = z.object({
  findingId: z.string().min(1),
  status: z.enum(['ELIGIBLE', 'INELIGIBLE', 'UNKNOWN']),
  issues: z.array(repairVerificationEligibilityIssueSchema),
  warnings: z.array(repairVerificationEligibilityWarningSchema),
  original: z.object({
    investigationId: z.string().min(1),
    businessOutcome: z.enum(['FAIL', 'INCONCLUSIVE']),
    journey: z.object({ id: z.string().min(1), name: z.string().min(1) }).nullable(),
    invariants: z.array(z.object({ id: z.string(), type: z.string(), severity: z.string() })),
  }),
  target: z.object({
    environmentId: z.string().min(1),
    environmentName: z.string().min(1),
    environmentType: z.string().min(1),
  }).nullable(),
  planPreview: repairVerificationPlanPreviewSchema.nullable(),
});

export const repairVerificationCreateResponseSchema = z.object({
  repairVerificationId: z.string().min(1),
  verificationInvestigationId: z.string().min(1),
  executionStatus: repairVerificationExecutionStatusSchema,
  verificationResult: repairVerificationResultSchema.nullable(),
});

export const repairVerificationComparisonSchema = z.object({
  originalBusinessOutcome: repairVerificationBusinessOutcomeSchema,
  repairedBusinessOutcome: repairVerificationBusinessOutcomeSchema.nullable(),
  regressionControlOutcome: repairVerificationBusinessOutcomeSchema.nullable(),
  verificationResult: repairVerificationResultSchema.nullable(),
  reason: z.string().nullable(),
});

export const repairVerificationListItemSchema = repairVerificationCreateResponseSchema.extend({
  findingId: z.string().min(1),
  environmentId: z.string().min(1),
  deploymentVersion: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export const repairVerificationDetailSchema = repairVerificationListItemSchema.extend({
  organisationId: z.string().min(1),
  projectId: z.string().min(1),
  originalInvestigationId: z.string().min(1),
  notes: z.string().nullable(),
  planSnapshot: z.record(z.unknown()),
  comparison: repairVerificationComparisonSchema.nullable(),
  failure: z.object({ code: z.string(), message: z.string() }).nullable(),
  cancellation: z.object({ reason: z.string().nullable(), cancelledAt: z.string().datetime() }).nullable(),
});

export type RepairVerificationTargetInput = z.infer<typeof repairVerificationTargetInputSchema>;
export type RepairVerificationExecutionStatus = z.infer<typeof repairVerificationExecutionStatusSchema>;
export type RepairVerificationResult = z.infer<typeof repairVerificationResultSchema>;
export type RepairVerificationBusinessOutcome = z.infer<typeof repairVerificationBusinessOutcomeSchema>;
export type RepairVerificationWorldPurpose = z.infer<typeof repairVerificationWorldPurposeSchema>;
export type RepairVerificationPlanPreview = z.infer<typeof repairVerificationPlanPreviewSchema>;
export type RepairVerificationEligibilitySummary = z.infer<typeof repairVerificationEligibilitySummarySchema>;
export type RepairVerificationComparison = z.infer<typeof repairVerificationComparisonSchema>;
