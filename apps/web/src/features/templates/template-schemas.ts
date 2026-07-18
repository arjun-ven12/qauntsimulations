import { z } from 'zod';

const nullableString = z.string().nullable();
const labelledUrl = z.object({ label: z.string(), url: z.string() });
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

export const projectTemplatePayloadSchema = z.object({
  name: z.string(),
  description: nullableString,
  applicationUrl: z.string(),
  repositoryUrl: nullableString,
  apiEndpoints: z.array(labelledUrl),
  webhookEndpoints: z.array(labelledUrl),
});
export type ProjectTemplatePayload = z.infer<typeof projectTemplatePayloadSchema>;

export const environmentTemplatePayloadSchema = z.object({
  name: z.string(),
  description: nullableString,
  type: z.enum(['LOCAL', 'STAGING', 'PREVIEW', 'TEST_MIRROR']),
  baseUrl: z.string(),
  apiBaseUrl: nullableString,
  healthCheckUrl: nullableString,
  isDefault: z.boolean(),
  configuration: z.object({
    featureFlagEndpoint: nullableString,
    featureFlagMethod: httpMethod,
    featureFlags: z.array(
      z.object({
        key: z.string(),
        type: z.enum(['BOOLEAN', 'STRING', 'NUMBER']),
        value: z.union([z.boolean(), z.string(), z.number()]),
        description: nullableString,
      }),
    ),
    payment: z.object({
      mode: z.enum(['MOCK', 'SANDBOX', 'DISABLED']),
      delayMs: z.number(),
      result: z.enum(['SUCCESS', 'DECLINE', 'TIMEOUT', 'INTERMITTENT']),
      retryEnabled: z.boolean(),
      maxRetries: z.number(),
    }),
    reset: z.object({
      mode: z.enum(['HTTP_ENDPOINT', 'SCRIPT_REFERENCE', 'MANUAL', 'NONE']),
      endpoint: nullableString,
      method: httpMethod,
      timeoutMs: z.number(),
      expectedStatus: z.number(),
      beforeEachWorld: z.boolean(),
      afterEachWorld: z.boolean(),
      procedure: nullableString,
      scriptReference: nullableString,
    }),
    testData: z.object({
      productIdentifier: nullableString,
      initialInventory: z.number(),
      seedProfile: nullableString,
      orderCleanup: nullableString,
      isolation: z.enum(['RESET_BEFORE_WORLD', 'UNIQUE_TEST_DATA_PER_WORLD', 'SHARED_READ_ONLY']),
    }),
    allowedActions: z.array(environmentAction),
  }),
  acknowledgement: z.literal(true),
});
export type EnvironmentTemplatePayload = z.infer<typeof environmentTemplatePayloadSchema>;

export const projectSafetyTemplatePayloadSchema = z.object({
  domainAllowlist: z.array(z.string()),
  prohibitedActions: z.array(z.string()),
  allowedHttpMethods: z.array(httpMethod),
  permitCheckoutSubmission: z.boolean(),
  permitMockPayment: z.boolean(),
  permitTestOrderCreation: z.boolean(),
});
export type ProjectSafetyTemplatePayload = z.infer<typeof projectSafetyTemplatePayloadSchema>;

const journeyStepSchema = z.object({
  order: z.number(),
  action: z.enum(['GOTO', 'CLICK', 'FILL', 'WAIT_FOR', 'ASSERT_VISIBLE']),
  selector: nullableString,
  value: nullableString,
  metadata: z.object({
    name: z.string().optional(),
    timeoutMs: z.number().optional(),
    expectedState: z.literal('VISIBLE').optional(),
    screenshotCheckpoint: z.boolean().optional(),
    screenshotCheckpointName: z.string().optional(),
    continueOnFailure: z.boolean().optional(),
  }),
});

export const journeyTemplatePayloadSchema = z.object({
  name: z.string(),
  description: nullableString,
  startPath: z.string(),
  state: z.enum(['DRAFT', 'ENABLED']),
  completionCondition: z.discriminatedUnion('type', [
    z.object({ type: z.literal('VISIBLE'), selector: z.string() }),
    z.object({ type: z.literal('TEXT'), selector: z.string(), expectedText: z.string() }),
  ]),
  steps: z.array(journeyStepSchema),
});
export type JourneyTemplatePayload = z.infer<typeof journeyTemplatePayloadSchema>;

export const invariantTemplatePayloadSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  enabled: z.boolean(),
  configuration: z.object({
    requestPatterns: z.array(z.string()),
    methods: z.array(z.enum(['POST', 'PUT', 'PATCH'])),
    orderIdSelector: z.string().optional(),
  }),
});
export type InvariantTemplatePayload = z.infer<typeof invariantTemplatePayloadSchema>;

export const scenarioTemplatePayloadSchema = z.object({
  scenario: z.object({
    prompt: z.string(),
    controls: z.object({
      browsers: z.array(z.string()).min(1),
      viewports: z.array(z.string()).min(1),
      networkProfiles: z.array(z.string()).min(1),
      maximumWorlds: z.number().int().min(1).max(100),
      maximumConcurrentWorkers: z.number().int().min(1).max(20),
    }),
  }),
});
export type ScenarioTemplatePayload = z.infer<typeof scenarioTemplatePayloadSchema>;

export const templatePayloadSchemas = {
  PROJECT: projectTemplatePayloadSchema,
  ENVIRONMENT: environmentTemplatePayloadSchema,
  PROJECT_SAFETY: projectSafetyTemplatePayloadSchema,
  JOURNEY: journeyTemplatePayloadSchema,
  INVARIANT: invariantTemplatePayloadSchema,
  SCENARIO: scenarioTemplatePayloadSchema,
} as const;
