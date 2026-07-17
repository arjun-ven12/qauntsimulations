import { z } from 'zod';
import { httpUrlSchema } from '../projects/projects.schema.js';
import { HTTP_METHODS } from '../projects/projects.types.js';
import { environmentActions, environmentTypes } from './environments.types.js';

const url = z.union([httpUrlSchema, z.literal('').transform(() => null), z.null()]).default(null);
const reference = z
  .string()
  .trim()
  .min(3)
  .max(300)
  .regex(
    /^(env|1password|vault|secret-manager):\/\//,
    'Use a credential reference, never a secret value',
  );
const optionalReference = z
  .union([reference, z.literal('').transform(() => null), z.null()])
  .default(null);
const flag = z
  .object({
    key: z.string().trim().min(1).max(100),
    type: z.enum(['BOOLEAN', 'STRING', 'NUMBER']),
    value: z.union([z.boolean(), z.string().max(500), z.number().finite()]),
    description: z.string().trim().max(300).nullable().default(null),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.type === 'BOOLEAN' && typeof v.value !== 'boolean')
      c.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Boolean flags need a true or false value',
      });
    if (v.type === 'STRING' && typeof v.value !== 'string')
      c.addIssue({ code: 'custom', path: ['value'], message: 'String flags need text' });
    if (v.type === 'NUMBER' && typeof v.value !== 'number')
      c.addIssue({ code: 'custom', path: ['value'], message: 'Number flags need a numeric value' });
  });
const configuration = z
  .object({
    featureFlagEndpoint: url,
    featureFlagMethod: z.enum(HTTP_METHODS).default('POST'),
    featureFlags: z
      .array(flag)
      .max(50)
      .default([])
      .superRefine((v, c) => {
        const keys = v.map((x) => x.key);
        if (new Set(keys).size !== keys.length)
          c.addIssue({ code: 'custom', message: 'Feature flag keys must be unique' });
      }),
    payment: z
      .object({
        mode: z.enum(['MOCK', 'SANDBOX', 'DISABLED']),
        delayMs: z.number().int().min(0).max(120000),
        result: z.enum(['SUCCESS', 'DECLINE', 'TIMEOUT', 'INTERMITTENT']),
        retryEnabled: z.boolean(),
        maxRetries: z.number().int().min(0).max(20),
      })
      .strict(),
    reset: z
      .object({
        mode: z.enum(['HTTP_ENDPOINT', 'SCRIPT_REFERENCE', 'MANUAL', 'NONE']),
        endpoint: url,
        method: z.enum(HTTP_METHODS).default('POST'),
        credentialReference: optionalReference,
        timeoutMs: z.number().int().min(1).max(120000),
        expectedStatus: z.number().int().min(100).max(599),
        beforeEachWorld: z.boolean(),
        afterEachWorld: z.boolean(),
        procedure: z.string().trim().max(2000).nullable().default(null),
        scriptReference: optionalReference,
      })
      .strict(),
    testData: z
      .object({
        customerCredentialReference: optionalReference,
        productIdentifier: z.string().trim().max(200).nullable().default(null),
        initialInventory: z.number().int().min(0).max(1000000),
        seedProfile: z.string().trim().max(200).nullable().default(null),
        orderCleanup: z.string().trim().max(200).nullable().default(null),
        isolation: z.enum(['RESET_BEFORE_WORLD', 'UNIQUE_TEST_DATA_PER_WORLD', 'SHARED_READ_ONLY']),
      })
      .strict(),
    credentialReferences: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            reference,
            purpose: z.string().trim().max(500).nullable().default(null),
          })
          .strict(),
      )
      .max(30)
      .default([])
      .superRefine((v, c) => {
        if (new Set(v.map((x) => x.reference)).size !== v.length)
          c.addIssue({ code: 'custom', message: 'Credential references must be unique' });
      }),
    allowedActions: z
      .array(z.enum(environmentActions))
      .max(environmentActions.length)
      .default([])
      .superRefine((v, c) => {
        if (new Set(v).size !== v.length)
          c.addIssue({ code: 'custom', message: 'Allowed actions must be unique' });
      }),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.reset.mode === 'HTTP_ENDPOINT' && !v.reset.endpoint)
      c.addIssue({
        code: 'custom',
        path: ['reset', 'endpoint'],
        message: 'A reset endpoint is required',
      });
    if (v.reset.mode === 'SCRIPT_REFERENCE' && !v.reset.scriptReference)
      c.addIssue({
        code: 'custom',
        path: ['reset', 'scriptReference'],
        message: 'A script reference is required',
      });
    if (v.reset.mode === 'MANUAL' && !v.reset.procedure)
      c.addIssue({
        code: 'custom',
        path: ['reset', 'procedure'],
        message: 'A manual procedure is required',
      });
    if (v.testData.isolation === 'RESET_BEFORE_WORLD' && v.reset.mode === 'NONE')
      c.addIssue({
        code: 'custom',
        path: ['testData', 'isolation'],
        message: 'Reset-before-world requires a reset procedure',
      });
    if (
      v.testData.isolation === 'SHARED_READ_ONLY' &&
      v.allowedActions.some((a) =>
        [
          'PERFORM_CHECKOUT',
          'SUBMIT_MOCK_PAYMENT',
          'CREATE_TEST_ORDER',
          'RESET_TEST_DATA',
          'CHANGE_FEATURE_FLAGS',
        ].includes(a),
      )
    )
      c.addIssue({
        code: 'custom',
        path: ['allowedActions'],
        message: 'Shared read-only data cannot use mutating actions',
      });
  });
export const environmentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z
      .union([z.string().trim().max(2000), z.literal('').transform(() => null), z.null()])
      .default(null),
    type: z.enum(environmentTypes),
    baseUrl: httpUrlSchema,
    apiBaseUrl: url,
    healthCheckUrl: url,
    isDefault: z.boolean().default(false),
    configuration,
    acknowledgement: z.literal(true, {
      errorMap: () => ({ message: 'Authorised-testing acknowledgement is required' }),
    }),
  })
  .strict();
export const createEnvironmentSchema = environmentInputSchema;
export const updateEnvironmentSchema = environmentInputSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one environment field is required');
