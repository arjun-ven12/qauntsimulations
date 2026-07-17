import { z } from 'zod';
import type {
  ProjectListRecord,
  PersistedProjectSafetyConfiguration,
  ProjectRecord,
  ProjectSafetyConfiguration,
} from './projects.types.js';

const persistedSafetyConfigurationSchema = z.object({
  version: z.literal(1),
  applicationUrl: z.string().url(),
  apiEndpoints: z.array(z.object({ label: z.string(), url: z.string().url() })),
  webhookEndpoints: z.array(z.object({ label: z.string(), url: z.string().url() })),
  allowedHttpMethods: z.array(z.enum(['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'])),
  permitCheckoutSubmission: z.boolean(),
  permitMockPayment: z.boolean(),
  permitOrderCreation: z.boolean(),
  restrictions: z.object({
    testEnvironmentsOnly: z.literal(true),
    productionAccess: z.literal(false),
    realPayments: z.literal(false),
    destructiveAccountActions: z.literal(false),
    externalDataExport: z.literal(false),
    realCustomerChanges: z.literal(false),
    externalMessaging: z.literal(false),
    repositoryDeletion: z.literal(false),
    infrastructureChanges: z.literal(false),
    crossOrganisationAccess: z.literal(false),
    unknownDomains: z.literal(false),
  }),
  acknowledgedAt: z.string().datetime(),
});

export function mapProjectSummary(record: ProjectListRecord) {
  const safety = record.safetyPolicies[0];
  const configuration = safety ? tryParseSafetyConfiguration(safety.configuration) : null;
  return {
    id: record.id,
    organisationId: record.organisationId,
    name: record.name,
    description: record.description,
    applicationUrl: configuration?.applicationUrl ?? null,
    repositoryUrl: record.repositoryUrl,
    organisation: record.organisation,
    safety: {
      configured: Boolean(safety),
      authorisedHostCount: safety?.domainAllowlist.length ?? 0,
      prohibitedActionCount: safety?.blockedActions.length ?? 0,
    },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapProject(record: ProjectRecord) {
  const summary = mapProjectSummary(record);
  const safety = record.safetyPolicies[0];
  if (!safety) throw new Error('Project safety policy is missing');
  const configuration = tryParseSafetyConfiguration(safety.configuration);
  return {
    ...summary,
    credentialReferences: record.secrets
      .filter((secret) => secret.externalReference !== null)
      .map((secret) => ({
        id: secret.id,
        label: secret.name,
        provider: secret.provider,
        reference: secret.externalReference,
      })),
    apiEndpoints: configuration?.apiEndpoints ?? [],
    webhookEndpoints: configuration?.webhookEndpoints ?? [],
    safety: mapSafety(safety, configuration),
  };
}

export function mapSafety(
  safety: ProjectRecord['safetyPolicies'][number],
  configuration = tryParseSafetyConfiguration(safety.configuration),
) {
  return {
    id: safety.id,
    domainAllowlist: safety.domainAllowlist,
    prohibitedActions: safety.blockedActions,
    allowedHttpMethods: configuration?.allowedHttpMethods ?? ['GET'],
    permitCheckoutSubmission: configuration?.permitCheckoutSubmission ?? false,
    permitMockPayment: configuration?.permitMockPayment ?? false,
    permitTestOrderCreation: configuration?.permitTestOrderCreation ?? false,
    restrictions: configuration?.restrictions ?? safeRestrictions(),
    acknowledgedAt: configuration?.acknowledgedAt ?? safety.updatedAt.toISOString(),
    updatedAt: safety.updatedAt.toISOString(),
  };
}

export function parseSafetyConfiguration(value: unknown): ProjectSafetyConfiguration {
  const { permitOrderCreation, ...configuration } = persistedSafetyConfigurationSchema.parse(value);
  return { ...configuration, permitTestOrderCreation: permitOrderCreation };
}

export function tryParseSafetyConfiguration(value: unknown): ProjectSafetyConfiguration | null {
  const result = persistedSafetyConfigurationSchema.safeParse(value);
  if (!result.success) return null;
  const { permitOrderCreation, ...configuration } = result.data;
  return { ...configuration, permitTestOrderCreation: permitOrderCreation };
}

export function persistSafetyConfiguration(
  value: ProjectSafetyConfiguration,
): PersistedProjectSafetyConfiguration {
  const { permitTestOrderCreation, ...configuration } = value;
  return { ...configuration, permitOrderCreation: permitTestOrderCreation };
}

function safeRestrictions() {
  return {
    testEnvironmentsOnly: true,
    productionAccess: false,
    realPayments: false,
    destructiveAccountActions: false,
    externalDataExport: false,
    realCustomerChanges: false,
    externalMessaging: false,
    repositoryDeletion: false,
    infrastructureChanges: false,
    crossOrganisationAccess: false,
    unknownDomains: false,
  } as const;
}
