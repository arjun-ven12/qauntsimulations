import { z } from 'zod';
import { invariantSeverities, invariantTypes } from './invariants.types.js';

const safePathPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /^\/[A-Za-z0-9/_-]+$/,
    'Request patterns must be plain URL paths without executable or regular-expression syntax',
  );
const methodsSchema = z.array(z.enum(['POST', 'PUT', 'PATCH'])).min(1).max(3);

export const duplicatePaymentConfigurationSchema = z
  .object({
    requestPatterns: z.array(safePathPatternSchema).min(1).max(20),
    methods: methodsSchema,
  })
  .strict();

export const duplicateOrderConfigurationSchema = duplicatePaymentConfigurationSchema
  .extend({
    orderIdSelector: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => !/[<>]|javascript:|script\b/i.test(value), 'Selector is not safe')
      .optional(),
  })
  .strict();

const inputBase = {
  name: z.string().trim().min(1).max(200),
  description: z
    .string()
    .trim()
    .min(10)
    .max(2_000)
    .superRefine(assertPlainLanguage),
  severity: z.enum(invariantSeverities),
  enabled: z.boolean(),
};

export const createInvariantSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...inputBase,
      type: z.literal('NO_DUPLICATE_PAYMENT'),
      configuration: duplicatePaymentConfigurationSchema,
    })
    .strict(),
  z
    .object({
      ...inputBase,
      type: z.literal('NO_DUPLICATE_ORDER'),
      configuration: duplicateOrderConfigurationSchema,
    })
    .strict(),
]);

export const updateInvariantSchema = z
  .object({
    name: inputBase.name.optional(),
    description: inputBase.description.optional(),
    type: z.enum(invariantTypes).optional(),
    configuration: z
      .union([duplicatePaymentConfigurationSchema, duplicateOrderConfigurationSchema])
      .optional(),
    severity: inputBase.severity.optional(),
    enabled: inputBase.enabled.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const persistedInvariantAssertionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('NO_DUPLICATE_PAYMENT'),
      severity: z.enum(invariantSeverities),
      enabled: z.boolean(),
      config: duplicatePaymentConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('NO_DUPLICATE_ORDER'),
      severity: z.enum(invariantSeverities),
      enabled: z.boolean(),
      config: duplicateOrderConfigurationSchema,
    })
    .strict(),
]);

export function isPlainLanguage(value: string) {
  const result = z.string().superRefine(assertPlainLanguage).safeParse(value);
  return result.success;
}

function assertPlainLanguage(value: string, context: z.RefinementCtx) {
  const executablePatterns = [
    /```/,
    /<script\b/i,
    /javascript:/i,
    /\b(?:bash|powershell|cmd\.exe|node|python)\s+(?:-[a-z]+\s+)?["']/i,
    /\b(?:rm|chmod|chown|curl|wget)\s+-/i,
    /\b(?:select\s+.+\s+from|insert\s+into|drop\s+table|alter\s+table|delete\s+from)\b/i,
    /(?:\.\.\/|file:\/\/|\/etc\/|[A-Za-z]:\\)/,
    /diff --git|\*\*\* Begin Patch/i,
    /\bfunction\s*\(|=>\s*[{(]/,
  ];
  if (executablePatterns.some((pattern) => pattern.test(value)))
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invariant rules must be plain-language descriptions, not executable content',
    });
}
