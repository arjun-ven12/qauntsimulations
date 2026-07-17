import { z } from 'zod';
import { journeyActions } from './journeys.types.js';

const nullableText = z
  .union([z.string().trim().max(1_000), z.null()])
  .transform((value) => (value === '' ? null : value))
  .default(null);

const selectorSchema = z.string().trim().min(1).max(2_048);

export const journeyStepMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    timeoutMs: z.number().int().positive().max(300_000).optional(),
    expectedState: z.literal('VISIBLE').optional(),
    screenshotCheckpoint: z.boolean().optional(),
    screenshotCheckpointName: z.string().trim().min(1).max(120).optional(),
    continueOnFailure: z.boolean().optional(),
  })
  .strict()
  .default({});

export const journeyStepInputSchema = z
  .object({
    order: z.number().int().nonnegative(),
    action: z.enum(journeyActions),
    selector: z.union([selectorSchema, z.null()]).default(null),
    value: z.union([z.string().max(10_000), z.null()]).default(null),
    metadata: journeyStepMetadataSchema,
  })
  .strict();

export const completionConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('VISIBLE'), selector: selectorSchema }).strict(),
  z
    .object({
      type: z.literal('TEXT'),
      selector: selectorSchema,
      expectedText: z.string().max(10_000),
    })
    .strict(),
]);

const journeyFields = {
  name: z.string().trim().min(1).max(200),
  description: nullableText,
  environmentId: z.string().trim().min(1).max(200),
  startPath: z.string().trim().min(1).max(2_048),
  state: z.enum(['DRAFT', 'ENABLED']).default('DRAFT'),
  completionCondition: completionConditionSchema,
};

export const createJourneySchema = z
  .object({
    ...journeyFields,
    steps: z.array(journeyStepInputSchema).min(1).max(500),
  })
  .strict();

export const updateJourneySchema = z
  .object({
    name: journeyFields.name.optional(),
    description: nullableText.optional(),
    environmentId: journeyFields.environmentId.optional(),
    startPath: journeyFields.startPath.optional(),
    state: z.enum(['DRAFT', 'ENABLED']).optional(),
    completionCondition: completionConditionSchema.optional(),
    steps: z.array(journeyStepInputSchema).min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
