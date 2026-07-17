import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import {
  hasOrganisationPermission,
  type OrganisationPermission,
} from '../organisations/organisation.permissions.js';
import {
  mapProject,
  mapProjectSummary,
  mapSafety,
  persistSafetyConfiguration,
  tryParseSafetyConfiguration,
} from './projects.mapper.js';
import type { ProjectRepository } from './projects.repository.js';
import type {
  CreateProjectInput,
  ProjectMutationRecord,
  UpdateProjectInput,
  UpdateSafetyInput,
} from './projects.types.js';

export type ProjectPermission = Extract<
  OrganisationPermission,
  'VIEW_PROJECTS' | 'CREATE_PROJECTS' | 'EDIT_PROJECTS' | 'MANAGE_PROJECT_SAFETY'
>;

export const DEFAULT_PROHIBITED_ACTIONS = [
  'Never access production.',
  'Never submit a real payment.',
  'Never modify real customer records.',
  'Never delete customer accounts.',
  'Never send outbound emails or messages.',
  'Never export data outside authorised systems.',
  'Never delete repositories or change repository settings.',
  'Never change infrastructure.',
  'Never access unrelated organisation data.',
];

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async create(context: AuthContext, input: CreateProjectInput) {
    const organisationId = await this.requirePermission(context, 'CREATE_PROJECTS');
    try {
      const record = await this.repository.create(
        mutationRecord(organisationId, undefined, input, undefined),
      );
      return mapProject(record);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApplicationError(
          'PROJECT_NAME_CONFLICT',
          'A project with this name already exists in your organisation',
          409,
        );
      }
      throw error;
    }
  }

  async list(context: AuthContext) {
    const organisationId = await this.requirePermission(context, 'VIEW_PROJECTS');
    return (await this.repository.list(organisationId)).map(mapProjectSummary);
  }

  async get(context: AuthContext, id: string) {
    const organisationId = await this.requirePermission(context, 'VIEW_PROJECTS');
    return mapProject(await this.requireProject(organisationId, id));
  }

  async update(context: AuthContext, id: string, input: UpdateProjectInput) {
    const organisationId = await this.requirePermission(context, 'EDIT_PROJECTS');
    const current = await this.requireProject(organisationId, id);
    const currentConfiguration = tryParseSafetyConfiguration(
      current.safetyPolicies[0]!.configuration,
    );
    if (!currentConfiguration && !input.applicationUrl) {
      throw new ApplicationError(
        'PROJECT_SETUP_REQUIRED',
        'Add an application URL before updating this legacy project',
        422,
      );
    }
    const merged = {
      name: input.name ?? current.name,
      description: input.description === undefined ? current.description : input.description,
      applicationUrl: input.applicationUrl ?? currentConfiguration!.applicationUrl,
      repositoryUrl:
        input.repositoryUrl === undefined ? current.repositoryUrl : input.repositoryUrl,
      credentialReferences: input.credentialReferences ?? [],
      apiEndpoints: input.apiEndpoints ?? currentConfiguration?.apiEndpoints ?? [],
      webhookEndpoints: input.webhookEndpoints ?? currentConfiguration?.webhookEndpoints ?? [],
      prohibitedActions: current.safetyPolicies[0]!.blockedActions,
      acknowledgement: true as const,
    };
    try {
      const mutation = mutationRecord(
        organisationId,
        id,
        merged,
        currentConfiguration ?? undefined,
      );
      if (currentConfiguration) {
        mutation.domainAllowlist = current.safetyPolicies[0]!.domainAllowlist;
      }
      const updated = await this.repository.update(
        input.credentialReferences === undefined ? omitCredentialReferences(mutation) : mutation,
      );
      if (!updated) throw projectNotFound();
      return mapProject(updated);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApplicationError(
          'PROJECT_NAME_CONFLICT',
          'A project with this name already exists in your organisation',
          409,
        );
      }
      throw error;
    }
  }

  async getSafety(context: AuthContext, id: string) {
    const organisationId = await this.requirePermission(context, 'VIEW_PROJECTS');
    const project = await this.requireProject(organisationId, id);
    return mapSafety(project.safetyPolicies[0]!);
  }

  async updateSafety(context: AuthContext, id: string, input: UpdateSafetyInput) {
    const organisationId = await this.requirePermission(context, 'MANAGE_PROJECT_SAFETY');
    const project = await this.requireProject(organisationId, id);
    const current = tryParseSafetyConfiguration(project.safetyPolicies[0]!.configuration);
    if (!current) {
      throw new ApplicationError(
        'PROJECT_SETUP_REQUIRED',
        'Add an application URL in Project Settings before changing safety controls',
        409,
      );
    }
    const configuration = {
      ...current,
      allowedHttpMethods: input.allowedHttpMethods,
      permitCheckoutSubmission: input.permitCheckoutSubmission,
      permitMockPayment: input.permitMockPayment,
      permitTestOrderCreation: input.permitTestOrderCreation,
      acknowledgedAt: new Date().toISOString(),
    };
    const updated = await this.repository.updateSafety({
      organisationId,
      projectId: id,
      configuration: persistSafetyConfiguration(configuration),
      domainAllowlist: input.domainAllowlist,
      blockedActions: normaliseActions(input.prohibitedActions),
    });
    if (!updated) throw projectNotFound();
    return mapSafety(updated.safetyPolicies[0]!);
  }

  private async requirePermission(context: AuthContext, permission: ProjectPermission) {
    if (!context.organisationId) {
      throw new ApplicationError(
        'ORGANISATION_REQUIRED',
        'An organisation context is required',
        403,
      );
    }
    const membership = await this.repository.findMembership(context.userId, context.organisationId);
    if (!membership || !hasOrganisationPermission(membership.role, permission)) {
      throw new ApplicationError(
        'INSUFFICIENT_PERMISSION',
        'Your organisation role does not permit this project action',
        403,
      );
    }
    return context.organisationId;
  }

  private async requireProject(organisationId: string, id: string) {
    const project = await this.repository.find(organisationId, id);
    if (!project) throw projectNotFound();
    if (!project.safetyPolicies[0]) throw new Error('Project safety policy is missing');
    return project;
  }
}

function mutationRecord(
  organisationId: string,
  projectId: string | undefined,
  input: CreateProjectInput,
  existing?: NonNullable<ReturnType<typeof tryParseSafetyConfiguration>>,
): ProjectMutationRecord {
  const configuration = {
    version: 1 as const,
    applicationUrl: input.applicationUrl,
    apiEndpoints: input.apiEndpoints,
    webhookEndpoints: input.webhookEndpoints,
    allowedHttpMethods: existing?.allowedHttpMethods ?? (['GET'] as const),
    permitCheckoutSubmission: existing?.permitCheckoutSubmission ?? false,
    permitMockPayment: existing?.permitMockPayment ?? false,
    permitTestOrderCreation: existing?.permitTestOrderCreation ?? false,
    restrictions: existing?.restrictions ?? safeRestrictions(),
    acknowledgedAt: existing?.acknowledgedAt ?? new Date().toISOString(),
  };
  return {
    organisationId,
    projectId: projectId ?? '',
    name: input.name,
    description: input.description,
    repositoryUrl: input.repositoryUrl,
    configuration: persistSafetyConfiguration(configuration),
    domainAllowlist: domainsFor(configuration),
    blockedActions: normaliseActions(
      input.prohibitedActions.length ? input.prohibitedActions : DEFAULT_PROHIBITED_ACTIONS,
    ),
    credentialReferences: input.credentialReferences,
  };
}

function safeRestrictions() {
  return {
    testEnvironmentsOnly: true as const,
    productionAccess: false as const,
    realPayments: false as const,
    destructiveAccountActions: false as const,
    externalDataExport: false as const,
    realCustomerChanges: false as const,
    externalMessaging: false as const,
    repositoryDeletion: false as const,
    infrastructureChanges: false as const,
    crossOrganisationAccess: false as const,
    unknownDomains: false as const,
  };
}

function domainsFor(configuration: {
  applicationUrl: string;
  apiEndpoints: Array<{ url: string }>;
  webhookEndpoints: Array<{ url: string }>;
}): string[] {
  return [
    ...new Set(
      [
        configuration.applicationUrl,
        ...configuration.apiEndpoints.map((endpoint) => endpoint.url),
        ...configuration.webhookEndpoints.map((endpoint) => endpoint.url),
      ].map((url) => new URL(url).hostname.toLowerCase()),
    ),
  ].sort();
}

function normaliseActions(actions: string[]): string[] {
  return actions.map((action) => {
    const trimmed = action.trim().replace(/\s+/g, ' ');
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  });
}

function projectNotFound() {
  return new ApplicationError('PROJECT_NOT_FOUND', 'Project was not found', 404);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function omitCredentialReferences(input: ProjectMutationRecord): ProjectMutationRecord {
  const { credentialReferences: _credentialReferences, ...rest } = input;
  return rest;
}
