import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission } from '../organisations/organisation.permissions.js';
import { tryParseSafetyConfiguration } from '../projects/projects.mapper.js';
import type { ProjectSafetyConfiguration } from '../projects/projects.types.js';
import { mapEnvironment } from './environments.mapper.js';
import type { EnvironmentRepository } from './environments.repository.js';
import type { EnvironmentInput, EnvironmentRecord } from './environments.types.js';

export class EnvironmentService {
  constructor(private readonly repository: EnvironmentRepository) {}
  private async project(context: AuthContext, projectId: string, edit = false) {
    if (!context.organisationId)
      throw new ApplicationError(
        'ORGANISATION_REQUIRED',
        'An organisation context is required',
        403,
      );
    const member = await this.repository.findMembership(context.userId, context.organisationId);
    if (
      !member ||
      !hasOrganisationPermission(member.role, edit ? 'EDIT_PROJECTS' : 'VIEW_PROJECTS')
    )
      throw new ApplicationError(
        'INSUFFICIENT_PERMISSION',
        'Your organisation role does not permit this environment action',
        403,
      );
    const project = await this.repository.findProject(context.organisationId, projectId);
    if (!project) throw new ApplicationError('PROJECT_NOT_FOUND', 'Project was not found', 404);
    const safety = tryParseSafetyConfiguration(project.safetyPolicies[0]?.configuration);
    if (!safety)
      throw new ApplicationError(
        'PROJECT_SETUP_REQUIRED',
        'Project Safety must be configured before environments',
        409,
      );
    return { project, safety };
  }
  async list(context: AuthContext, projectId: string) {
    await this.project(context, projectId);
    return (await this.repository.list(projectId)).map(mapEnvironment);
  }
  async get(context: AuthContext, projectId: string, id: string) {
    await this.project(context, projectId);
    const found = await this.repository.find(projectId, id);
    if (!found)
      throw new ApplicationError('ENVIRONMENT_NOT_FOUND', 'Environment was not found', 404);
    return mapEnvironment(found);
  }
  async create(context: AuthContext, projectId: string, input: EnvironmentInput) {
    const scope = await this.project(context, projectId, true);
    assertCompatible(input, scope.safety, scope.project.safetyPolicies[0]!.domainAllowlist);
    try {
      return mapEnvironment(await this.repository.create(projectId, input));
    } catch (e) {
      if (isUnique(e))
        throw new ApplicationError(
          'ENVIRONMENT_NAME_CONFLICT',
          'An environment with this name already exists in this project',
          409,
        );
      throw e;
    }
  }
  async update(
    context: AuthContext,
    projectId: string,
    id: string,
    input: Partial<EnvironmentInput>,
  ) {
    const scope = await this.project(context, projectId, true);
    const current = await this.repository.find(projectId, id);
    if (!current)
      throw new ApplicationError('ENVIRONMENT_NOT_FOUND', 'Environment was not found', 404);
    const merged = { ...mapInput(current), ...input } as EnvironmentInput;
    assertCompatible(merged, scope.safety, scope.project.safetyPolicies[0]!.domainAllowlist);
    try {
      const updated = await this.repository.update(projectId, id, input);
      if (!updated)
        throw new ApplicationError('ENVIRONMENT_NOT_FOUND', 'Environment was not found', 404);
      return mapEnvironment(updated);
    } catch (e) {
      if (isUnique(e))
        throw new ApplicationError(
          'ENVIRONMENT_NAME_CONFLICT',
          'An environment with this name already exists in this project',
          409,
        );
      throw e;
    }
  }
  async setDefault(context: AuthContext, projectId: string, id: string) {
    await this.project(context, projectId, true);
    const updated = await this.repository.setDefault(projectId, id);
    if (!updated)
      throw new ApplicationError('ENVIRONMENT_NOT_FOUND', 'Environment was not found', 404);
    return mapEnvironment(updated);
  }
  async validate(context: AuthContext, projectId: string, id: string) {
    const scope = await this.project(context, projectId, true);
    const item = await this.repository.find(projectId, id);
    if (!item)
      throw new ApplicationError('ENVIRONMENT_NOT_FOUND', 'Environment was not found', 404);
    const input = mapInput(item);
    const results: Array<{
      key: string;
      label: string;
      status: 'PASS' | 'WARNING' | 'FAIL';
      message: string;
    }> = [];
    try {
      assertCompatible(input, scope.safety, scope.project.safetyPolicies[0]!.domainAllowlist);
      results.push({
        key: 'safety',
        label: 'Project Safety compatibility',
        status: 'PASS',
        message: 'Environment configuration is within the Project Safety boundary.',
      });
    } catch (error) {
      results.push({
        key: 'safety',
        label: 'Project Safety compatibility',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Safety validation failed',
      });
    }
    results.push({
      key: 'base-url',
      label: 'Base URL',
      status: 'PASS',
      message: 'Base URL is valid.',
    });
    if (['localhost', '127.0.0.1'].includes(new URL(input.baseUrl).hostname))
      results.push({
        key: 'remote',
        label: 'Remote accessibility',
        status: 'WARNING',
        message:
          'Local-only: available from this machine, but not remotely reachable by Daytona workers.',
      });
    const status = results.some((x) => x.status === 'FAIL')
      ? 'VALIDATION_FAILED'
      : results.some((x) => x.status === 'WARNING')
        ? 'READY'
        : 'READY';
    return mapEnvironment((await this.repository.saveValidation(projectId, id, status, results))!);
  }
}
function mapInput(r: EnvironmentRecord): EnvironmentInput {
  return {
    name: r.name,
    description: r.description,
    type: r.type as EnvironmentInput['type'],
    baseUrl: r.baseUrl,
    apiBaseUrl: r.apiBaseUrl,
    healthCheckUrl: r.healthCheckUrl,
    isDefault: r.isDefault,
    configuration: (r.configuration ?? {}) as EnvironmentInput['configuration'],
    acknowledgement: true,
  };
}
function assertCompatible(input: EnvironmentInput, safety: ProjectSafetyConfiguration, allowlist: string[]) {
  const hosts = new Set(allowlist);
  const urlHosts = [
    input.baseUrl,
    input.apiBaseUrl,
    input.healthCheckUrl,
    input.configuration.featureFlagEndpoint,
    input.configuration.reset.endpoint,
  ]
    .filter(Boolean)
    .map((x) => new URL(x!).hostname.toLowerCase());
  for (const host of urlHosts)
    if (!hosts.has(host))
      throw new ApplicationError(
        'ENVIRONMENT_SAFETY_CONFLICT',
        `The host ${host} is not allowed by Project Safety`,
        403,
      );
  const methods = [input.configuration.featureFlagMethod, input.configuration.reset.method];
  for (const method of methods)
    if (!safety.allowedHttpMethods.includes(method))
      throw new ApplicationError(
        'ENVIRONMENT_SAFETY_CONFLICT',
        `${method} is not allowed by Project Safety`,
        403,
      );
  const actions = input.configuration.allowedActions;
  if (actions.includes('PERFORM_CHECKOUT') && !safety.permitCheckoutSubmission)
    throw new ApplicationError(
      'ENVIRONMENT_SAFETY_CONFLICT',
      'Checkout is not permitted by Project Safety',
      403,
    );
  if (
    (actions.includes('SUBMIT_MOCK_PAYMENT') || input.configuration.payment.mode === 'MOCK') &&
    !safety.permitMockPayment
  )
    throw new ApplicationError(
      'ENVIRONMENT_SAFETY_CONFLICT',
      'Mock payments are not permitted by Project Safety',
      403,
    );
  if (actions.includes('CREATE_TEST_ORDER') && !safety.permitOrderCreation)
    throw new ApplicationError(
      'ENVIRONMENT_SAFETY_CONFLICT',
      'Test-order creation is not permitted by Project Safety',
      403,
    );
}
function isUnique(e: unknown) {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002';
}
