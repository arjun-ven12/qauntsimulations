import { z } from 'zod';

export const templateCategories = [
  'PROJECT',
  'ENVIRONMENT',
  'PROJECT_SAFETY',
  'JOURNEY',
  'INVARIANT',
  'SCENARIO',
] as const;
export const templateCategorySchema = z.enum(templateCategories);
export type TemplateCategory = z.infer<typeof templateCategorySchema>;

const nullableString = z.string().nullable();
const httpUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS URL');
const labelledUrl = z.object({ label: z.string().trim().min(1), url: httpUrl }).strict();
const httpMethod = z.enum(['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']);
const environmentAction = z.enum([
  'NAVIGATE_APPLICATION',
  'READ_APPLICATION_STATE',
  'SUBMIT_FORMS',
  'PERFORM_CHECKOUT',
  'SUBMIT_MOCK_PAYMENT',
  'CREATE_TEST_ORDER',
  'RESET_TEST_DATA',
  'CHANGE_FEATURE_FLAGS',
  'CAPTURE_SCREENSHOTS',
  'CAPTURE_TRACES',
  'RECORD_NETWORK_TRAFFIC',
]);

const projectPayload = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(1_000).nullable(),
    applicationUrl: httpUrl,
    repositoryUrl: httpUrl.nullable(),
    apiEndpoints: z.array(labelledUrl),
    webhookEndpoints: z.array(labelledUrl),
  })
  .strict();

const environmentPayload = z
  .object({
    name: z.string(),
    description: nullableString,
    type: z.enum(['LOCAL', 'STAGING', 'PREVIEW', 'TEST_MIRROR']),
    baseUrl: z.string(),
    apiBaseUrl: nullableString,
    healthCheckUrl: nullableString,
    isDefault: z.boolean(),
    configuration: z
      .object({
        featureFlagEndpoint: nullableString,
        featureFlagMethod: httpMethod,
        featureFlags: z.array(
          z
            .object({
              key: z.string(),
              type: z.enum(['BOOLEAN', 'STRING', 'NUMBER']),
              value: z.union([z.boolean(), z.string(), z.number()]),
              description: nullableString,
            })
            .strict(),
        ),
        payment: z
          .object({
            mode: z.enum(['MOCK', 'SANDBOX', 'DISABLED']),
            delayMs: z.number(),
            result: z.enum(['SUCCESS', 'DECLINE', 'TIMEOUT', 'INTERMITTENT']),
            retryEnabled: z.boolean(),
            maxRetries: z.number(),
          })
          .strict(),
        reset: z
          .object({
            mode: z.enum(['HTTP_ENDPOINT', 'SCRIPT_REFERENCE', 'MANUAL', 'NONE']),
            endpoint: nullableString,
            method: httpMethod,
            timeoutMs: z.number(),
            expectedStatus: z.number(),
            beforeEachWorld: z.boolean(),
            afterEachWorld: z.boolean(),
            procedure: nullableString,
            scriptReference: nullableString,
          })
          .strict(),
        testData: z
          .object({
            productIdentifier: nullableString,
            initialInventory: z.number(),
            seedProfile: nullableString,
            orderCleanup: nullableString,
            isolation: z.enum([
              'RESET_BEFORE_WORLD',
              'UNIQUE_TEST_DATA_PER_WORLD',
              'SHARED_READ_ONLY',
            ]),
          })
          .strict(),
        allowedActions: z.array(environmentAction),
      })
      .strict(),
    acknowledgement: z.literal(true),
  })
  .strict();

const safetyPayload = z
  .object({
    domainAllowlist: z.array(z.string()),
    prohibitedActions: z.array(z.string()),
    allowedHttpMethods: z.array(httpMethod),
    permitCheckoutSubmission: z.boolean(),
    permitMockPayment: z.boolean(),
    permitTestOrderCreation: z.boolean(),
  })
  .strict();

const journeyPayload = z
  .object({
    name: z.string(),
    description: nullableString,
    startPath: z.string(),
    state: z.enum(['DRAFT', 'ENABLED']),
    completionCondition: z.discriminatedUnion('type', [
      z.object({ type: z.literal('VISIBLE'), selector: z.string() }).strict(),
      z
        .object({ type: z.literal('TEXT'), selector: z.string(), expectedText: z.string() })
        .strict(),
    ]),
    steps: z.array(
      z
        .object({
          order: z.number(),
          action: z.enum(['GOTO', 'CLICK', 'FILL', 'WAIT_FOR', 'ASSERT_VISIBLE']),
          selector: nullableString,
          value: nullableString,
          metadata: z
            .object({
              name: z.string().optional(),
              timeoutMs: z.number().optional(),
              expectedState: z.literal('VISIBLE').optional(),
              screenshotCheckpoint: z.boolean().optional(),
              screenshotCheckpointName: z.string().optional(),
              continueOnFailure: z.boolean().optional(),
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict();

const invariantPayload = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(10).max(2_000),
    type: z.enum(['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER']),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    enabled: z.boolean(),
    configuration: z
      .object({
        requestPatterns: z
          .array(
            z
              .string()
              .trim()
              .regex(/^\/[A-Za-z0-9/_-]+$/)
              .max(200),
          )
          .min(1)
          .max(20),
        methods: z.array(z.enum(['POST', 'PUT', 'PATCH'])).min(1),
        orderIdSelector: z.string().optional(),
      })
      .strict(),
  })
  .strict();

const scenarioPayload = z
  .object({
    scenario: z
      .object({
        prompt: z.string(),
        controls: z
          .object({
            browsers: z.array(z.string()).min(1),
            viewports: z.array(z.string()).min(1),
            networkProfiles: z.array(z.string()).min(1),
            maximumWorlds: z.number().int().min(1).max(100),
            maximumConcurrentWorkers: z.number().int().min(1).max(20),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const payloadSchemas = {
  PROJECT: projectPayload,
  ENVIRONMENT: environmentPayload,
  PROJECT_SAFETY: safetyPayload,
  JOURNEY: journeyPayload,
  INVARIANT: invariantPayload,
  SCENARIO: scenarioPayload,
} as const;

const templateFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  schemaVersion: z.literal(1),
};

const maximumPayloadBytes = 64 * 1024;

function payloadWithinLimit(payload: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8') <= maximumPayloadBytes;
  } catch {
    return false;
  }
}

export const createTemplateSchema = z
  .object({
    ...templateFields,
    category: templateCategorySchema,
    payload: z.unknown(),
  })
  .strict()
  .refine((value) => payloadWithinLimit(value.payload), {
    message: 'Template payload must be 64 KB or smaller',
    path: ['payload'],
  });

export const updateTemplateSchema = z
  .object({
    name: templateFields.name.optional(),
    description: templateFields.description,
    schemaVersion: z.literal(1).optional(),
    payload: z.unknown().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .refine((value) => value.payload === undefined || payloadWithinLimit(value.payload), {
    message: 'Template payload must be 64 KB or smaller',
    path: ['payload'],
  });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export function parseTemplatePayload(category: TemplateCategory, payload: unknown) {
  const parsed = payloadSchemas[category].parse(payload);
  if (containsSensitiveValue(parsed)) {
    throw new Error('Passwords, tokens, cookies, credentials, and secrets cannot be saved.');
  }
  return parsed;
}

function containsSensitiveValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSensitiveValue);
  const record = value as Record<string, unknown>;
  if (
    record.action === 'FILL' &&
    typeof record.value === 'string' &&
    record.value.length > 0 &&
    /(?:password|passwd|token|cookie|credential|secret|api[-_]?key)/i.test(
      `${String(record.selector ?? '')} ${String(record.name ?? '')}`,
    )
  ) {
    return true;
  }
  return Object.entries(record).some(
    ([key, entry]) =>
      (/(?:password|passwd|token|cookie|credential|secret|api[-_]?key)/i.test(key) &&
        entry !== null &&
        entry !== '' &&
        entry !== false) ||
      containsSensitiveValue(entry),
  );
}
