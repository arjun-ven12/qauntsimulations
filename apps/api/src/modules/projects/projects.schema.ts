import { z } from 'zod';
import { isIP } from 'node:net';
import { HTTP_METHODS } from './projects.types.js';

const optionalText = z
  .string()
  .trim()
  .max(1_000)
  .transform((value) => value || null)
  .nullable()
  .default(null);

export const httpUrlSchema = z
  .string()
  .trim()
  .url('Enter a valid URL')
  .max(2_048)
  .superRefine((value, context) => {
    let protocol: string;
    try {
      protocol = new URL(value).protocol;
    } catch {
      return;
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      context.addIssue({ code: 'custom', message: 'Only HTTP and HTTPS URLs are supported' });
    }
  })
  .transform(normaliseUrl);

const nullableHttpUrlSchema = z
  .union([httpUrlSchema, z.literal('').transform(() => null), z.null()])
  .default(null);

const endpointReferenceSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    url: httpUrlSchema,
  })
  .strict();

const credentialReferenceSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    reference: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/,
        'Use a credential identifier or vault reference, not a secret value',
      ),
  })
  .strict();

const prohibitedActionsSchema = z
  .array(z.string().trim().min(1, 'Prohibited actions cannot be blank').max(240))
  .max(30)
  .superRefine((actions, context) => {
    const normalised = actions.map(normaliseAction);
    if (new Set(normalised).size !== normalised.length) {
      context.addIssue({ code: 'custom', message: 'Prohibited actions must be unique' });
    }
  });

export const allowedHostSchema = z
  .string()
  .trim()
  .min(1, 'Allowed hosts cannot be blank')
  .max(253)
  .transform((value, context) => normaliseAllowedHost(value, context));

const domainAllowlistSchema = z
  .array(allowedHostSchema)
  .min(1, 'Add at least one allowed host')
  .max(50)
  .superRefine((hosts, context) => {
    const seen = new Set<string>();
    hosts.forEach((host, index) => {
      if (seen.has(host)) {
        context.addIssue({
          code: 'custom',
          message: 'Allowed hosts must be unique',
          path: [index],
        });
      }
      seen.add(host);
    });
  });

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: optionalText,
    applicationUrl: httpUrlSchema,
    repositoryUrl: nullableHttpUrlSchema,
    credentialReferences: z.array(credentialReferenceSchema).max(20).default([]),
    apiEndpoints: z.array(endpointReferenceSchema).max(10).default([]),
    webhookEndpoints: z.array(endpointReferenceSchema).max(10).default([]),
    prohibitedActions: prohibitedActionsSchema.default([]),
    acknowledgement: z.literal(true, {
      errorMap: () => ({ message: 'Authorised-testing acknowledgement is required' }),
    }),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: optionalText.optional(),
    applicationUrl: httpUrlSchema.optional(),
    repositoryUrl: nullableHttpUrlSchema.optional(),
    credentialReferences: z.array(credentialReferenceSchema).max(20).optional(),
    apiEndpoints: z.array(endpointReferenceSchema).max(10).optional(),
    webhookEndpoints: z.array(endpointReferenceSchema).max(10).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, 'At least one project field is required');

export const updateSafetySchema = z
  .object({
    domainAllowlist: domainAllowlistSchema,
    allowedHttpMethods: z.array(z.enum(HTTP_METHODS)).min(1).max(HTTP_METHODS.length),
    permitCheckoutSubmission: z.boolean(),
    permitMockPayment: z.boolean(),
    permitOrderCreation: z.boolean(),
    prohibitedActions: prohibitedActionsSchema,
    acknowledgement: z.literal(true, {
      errorMap: () => ({ message: 'Authorised-testing acknowledgement is required' }),
    }),
  })
  .strict();

function normaliseUrl(value: string): string {
  const url = new URL(value);
  if (url.pathname === '/' && !url.search && !url.hash) url.pathname = '';
  return url.toString().replace(/\/$/, '');
}

function normaliseAction(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!]+$/, '');
}

function normaliseAllowedHost(value: string, context: z.RefinementCtx): string {
  const raw = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      context.addIssue({ code: 'custom', message: 'Enter a valid hostname or HTTP(S) URL' });
      return z.NEVER;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      context.addIssue({ code: 'custom', message: 'Only HTTP and HTTPS URLs are supported' });
      return z.NEVER;
    }
    return parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  }
  if (raw.includes('/') || raw.includes('?') || raw.includes('#')) {
    context.addIssue({
      code: 'custom',
      message: 'Enter a hostname without a path or query string',
    });
    return z.NEVER;
  }
  const unwrapped = raw.replace(/^\[|\]$/g, '');
  if (unwrapped.toLowerCase() === 'localhost' || isIP(unwrapped)) return unwrapped.toLowerCase();
  const hostname = unwrapped.toLowerCase();
  if (
    !hostname.includes('.') ||
    !/^(?=.{1,253}$)(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      hostname,
    )
  ) {
    context.addIssue({ code: 'custom', message: 'Enter a valid hostname' });
    return z.NEVER;
  }
  return hostname;
}
