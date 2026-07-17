import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission } from '../organisations/organisation.permissions.js';
import {
  encodeSteps,
  mapJourney,
  mapStep,
  readJourneyConfiguration,
  toRuntimeJourney,
} from './journeys.mapper.js';
import type { JourneyRepositoryContract } from './journeys.repository.js';
import type {
  CreateJourneyInput,
  JourneyEnvironment,
  JourneyInput,
  JourneyPersistenceInput,
  JourneyProject,
  JourneyRecord,
  JourneyStepInput,
  JourneyValidationCheck,
  JourneyValidationStatus,
  UpdateJourneyInput,
} from './journeys.types.js';

export class JourneyService {
  constructor(private readonly repository: JourneyRepositoryContract) {}

  async create(context: AuthContext, projectId: string, input: CreateJourneyInput) {
    const scope = await this.scope(context, projectId, true);
    await this.requireUniqueName(projectId, input.name);
    const persistence = await this.prepareInput(projectId, input, scope.project);
    try {
      return mapJourney(await this.repository.create(projectId, persistence));
    } catch (error) {
      if (isUnique(error)) throw nameConflict();
      throw error;
    }
  }

  async list(context: AuthContext, projectId: string) {
    await this.scope(context, projectId, false);
    return (await this.repository.list(projectId)).map(mapJourney);
  }

  async get(context: AuthContext, projectId: string, journeyId: string) {
    await this.scope(context, projectId, false);
    return mapJourney(await this.requireJourney(projectId, journeyId));
  }

  async update(
    context: AuthContext,
    projectId: string,
    journeyId: string,
    patch: UpdateJourneyInput,
  ) {
    const scope = await this.scope(context, projectId, true);
    const current = await this.requireJourney(projectId, journeyId);
    const input = mergeInput(current, patch);
    if (patch.name !== undefined)
      await this.requireUniqueName(projectId, input.name, journeyId);
    const persistence = await this.prepareInput(projectId, input, scope.project);
    try {
      const updated = await this.repository.update(projectId, journeyId, persistence);
      if (!updated) throw journeyNotFound();
      return mapJourney(updated);
    } catch (error) {
      if (isUnique(error)) throw nameConflict();
      throw error;
    }
  }

  async remove(context: AuthContext, projectId: string, journeyId: string) {
    await this.scope(context, projectId, true);
    if (!(await this.repository.archive(projectId, journeyId))) throw journeyNotFound();
  }

  async duplicate(context: AuthContext, projectId: string, journeyId: string) {
    const scope = await this.scope(context, projectId, true);
    const source = await this.requireJourney(projectId, journeyId);
    const input = mergeInput(source, {});
    const name = await this.copyName(projectId, source.name);
    const persistence = await this.prepareInput(
      projectId,
      { ...input, name, state: 'DRAFT' },
      scope.project,
    );
    try {
      return mapJourney(await this.repository.create(projectId, persistence));
    } catch (error) {
      if (isUnique(error)) throw nameConflict();
      throw error;
    }
  }

  async validate(context: AuthContext, projectId: string, journeyId: string) {
    const scope = await this.scope(context, projectId, true);
    const record = await this.requireJourney(projectId, journeyId);
    const configuration = readJourneyConfiguration(record);
    const checks: JourneyValidationCheck[] = [];

    if (!configuration) {
      checks.push({
        key: 'builder-configuration',
        status: 'FAILED',
        message: 'Journey predates the Builder contract and has no Environment configuration.',
      });
      return { status: 'INVALID' as const, checks, journey: mapJourney(record) };
    }

    const environment = await this.repository.findEnvironment(
      projectId,
      configuration.environmentId,
    );
    if (!environment) {
      checks.push({
        key: 'environment',
        status: 'FAILED',
        message: 'The selected Environment does not exist in this project.',
      });
    } else {
      checks.push({
        key: 'environment',
        status: 'PASSED',
        message: 'The selected Environment belongs to this project.',
      });
      checks.push(environmentReadinessCheck(environment));
    }

    checks.push(
      record.steps.length
        ? {
            key: 'steps',
            status: 'PASSED',
            message: `Journey contains ${record.steps.length} executable step(s).`,
          }
        : { key: 'steps', status: 'FAILED', message: 'At least one Journey step is required.' },
    );
    checks.push(orderingCheck(record));

    const input = mergeInput(record, {});
    const stepChecks = validateSteps(input.steps, environment, scope.project, input.startPath);
    checks.push(...stepChecks);
    checks.push(
      input.completionCondition.selector
        ? {
            key: 'completion-condition',
            status: 'PASSED',
            message: 'Completion condition matches the runtime assertion contract.',
          }
        : {
            key: 'completion-condition',
            status: 'FAILED',
            message: 'A completion condition selector is required.',
          },
    );

    const status: JourneyValidationStatus = checks.some((check) => check.status === 'FAILED')
      ? 'INVALID'
      : checks.some((check) => check.status === 'WARNING')
        ? 'DRAFT'
        : 'READY';
    const withStatus: JourneyPersistenceInput = { ...input, validationStatus: status };
    const metadata = encodeSteps(withStatus)[0]?.metadata;
    const updated = metadata
      ? await this.repository.setValidationMetadata(projectId, journeyId, metadata)
      : null;
    return { status, checks, journey: mapJourney(updated ?? record) };
  }

  async runtimeContract(context: AuthContext, projectId: string, journeyId: string) {
    await this.scope(context, projectId, false);
    return toRuntimeJourney(await this.requireJourney(projectId, journeyId));
  }

  private async scope(context: AuthContext, projectId: string, mutation: boolean) {
    if (!context.organisationId)
      throw new ApplicationError(
        'ORGANISATION_REQUIRED',
        'An organisation context is required',
        403,
      );
    const membership = await this.repository.findMembership(
      context.userId,
      context.organisationId,
    );
    const permitted = membership
      ? hasOrganisationPermission(
          membership.role,
          mutation ? 'EDIT_PROJECTS' : 'VIEW_PROJECTS',
        )
      : false;
    if (!permitted || (mutation && !['OWNER', 'ADMIN'].includes(membership!.role)))
      throw new ApplicationError(
        'INSUFFICIENT_PERMISSION',
        'Your organisation role does not permit this Journey action',
        403,
      );
    const project = await this.repository.findProject(context.organisationId, projectId);
    if (!project) throw new ApplicationError('PROJECT_NOT_FOUND', 'Project was not found', 404);
    if (!project.safetyPolicies[0])
      throw new ApplicationError(
        'PROJECT_SETUP_REQUIRED',
        'Project Safety must be configured before Journeys',
        409,
      );
    return { project };
  }

  private async prepareInput(
    projectId: string,
    input: JourneyInput,
    project: JourneyProject,
  ): Promise<JourneyPersistenceInput> {
    const environment = await this.repository.findEnvironment(projectId, input.environmentId);
    if (!environment)
      throw new ApplicationError(
        'ENVIRONMENT_NOT_FOUND',
        'Environment was not found in this project',
        404,
      );
    const steps = compileAndNormaliseSteps(input.steps);
    const checks = validateSteps(steps, environment, project, input.startPath);
    const failure = checks.find((check) => check.status === 'FAILED');
    if (failure) {
      const safety = failure.key.startsWith('safety-');
      throw new ApplicationError(
        safety ? 'JOURNEY_SAFETY_CONFLICT' : 'JOURNEY_VALIDATION_FAILED',
        failure.message,
        safety ? 403 : 422,
        { checks },
      );
    }
    return { ...input, steps, validationStatus: 'DRAFT' };
  }

  private async requireJourney(projectId: string, journeyId: string) {
    const journey = await this.repository.find(projectId, journeyId);
    if (!journey) throw journeyNotFound();
    return journey;
  }

  private async requireUniqueName(projectId: string, name: string, excludingId?: string) {
    if (await this.repository.nameExists(projectId, name, excludingId)) throw nameConflict();
  }

  private async copyName(projectId: string, sourceName: string) {
    const base = `${sourceName} copy`;
    if (!(await this.repository.nameExists(projectId, base))) return base;
    for (let number = 2; number < 10_000; number += 1) {
      const candidate = `${base} ${number}`;
      if (!(await this.repository.nameExists(projectId, candidate))) return candidate;
    }
    throw new ApplicationError('JOURNEY_NAME_CONFLICT', 'Unable to derive a unique copy name', 409);
  }
}

export function compileAndNormaliseSteps(steps: JourneyStepInput[]): JourneyStepInput[] {
  const sorted = steps
    .map((step, index) => ({ step, index }))
    .sort((left, right) => left.step.order - right.step.order || left.index - right.index);
  const executable: JourneyStepInput[] = [];
  for (const { step } of sorted) {
    if (step.action !== 'SCREENSHOT') {
      executable.push({
        ...step,
        order: executable.length,
        metadata: { ...step.metadata },
      });
      continue;
    }
    const previous = executable.at(-1);
    const checkpointName = step.metadata.screenshotCheckpointName ?? step.metadata.name;
    if (!previous)
      throw validationError('A SCREENSHOT checkpoint must follow an executable step.');
    if (!checkpointName)
      throw validationError('A SCREENSHOT checkpoint name is required.');
    if (previous.metadata.screenshotCheckpoint)
      throw validationError('Only one SCREENSHOT checkpoint may follow a Journey step.');
    previous.metadata = {
      ...previous.metadata,
      name: checkpointName,
      screenshotCheckpoint: true,
      screenshotCheckpointName: checkpointName,
    };
  }
  if (!executable.length) throw validationError('At least one executable Journey step is required.');
  return executable.map((step, order) => ({ ...step, order }));
}

function validateSteps(
  steps: JourneyStepInput[],
  environment: JourneyEnvironment | null,
  project: JourneyProject,
  startPath: string,
): JourneyValidationCheck[] {
  const checks: JourneyValidationCheck[] = [];
  const navigationFailure = navigationError(startPath, environment, project);
  checks.push({
    key: 'start-path',
    status: navigationFailure ? 'FAILED' : 'PASSED',
    message: navigationFailure ?? 'Start path is a safe authorised navigation target.',
  });
  for (const step of steps) {
    const prefix = `step-${step.order}`;
    const fail = (key: string, message: string) =>
      checks.push({ key: `${prefix}-${key}`, status: 'FAILED', message, stepOrder: step.order });
    if (step.action === 'GOTO') {
      if (step.value === null || step.value.length === 0) fail('value', 'GOTO requires a path or URL.');
      else {
        const error = navigationError(step.value, environment, project);
        if (error) fail('navigation', error);
      }
    } else if (step.action === 'CLICK' || step.action === 'ASSERT_VISIBLE') {
      if (!step.selector) fail('selector', `${step.action} requires a selector.`);
    } else if (step.action === 'FILL') {
      if (!step.selector) fail('selector', 'FILL requires a selector.');
      if (step.value === null) fail('value', 'FILL requires a value.');
    } else if (step.action === 'WAIT_FOR') {
      if (!step.selector) fail('selector', 'WAIT_FOR requires a selector.');
      if (step.metadata.expectedState !== 'VISIBLE')
        fail('expected-state', 'WAIT_FOR supports only the VISIBLE expected state.');
      if (!step.metadata.timeoutMs || step.metadata.timeoutMs <= 0)
        fail('timeout', 'WAIT_FOR requires a positive timeoutMs.');
    } else if (step.action === 'SCREENSHOT') {
      fail('action', 'SCREENSHOT must be compiled into checkpoint metadata.');
    } else {
      fail('action', `Unsupported Journey action: ${String(step.action)}`);
    }
    const safetyFailure = safetyError(step, project);
    if (safetyFailure)
      checks.push({
        key: `safety-${prefix}`,
        status: 'FAILED',
        message: safetyFailure,
        stepOrder: step.order,
      });
  }
  if (!checks.some((check) => check.status === 'FAILED'))
    checks.push({
      key: 'step-contract',
      status: 'PASSED',
      message: 'All steps map to supported runtime actions.',
    });
  return checks;
}

function navigationError(
  target: string,
  environment: JourneyEnvironment | null,
  project: JourneyProject,
) {
  if (/^(javascript|file|data|ftp):/i.test(target))
    return 'Only safe paths and authorised HTTP/HTTPS URLs are supported.';
  if (target.startsWith('//') || target.includes('\\')) return 'Protocol-relative and backslash paths are not supported.';
  let url: URL;
  try {
    if (target.startsWith('/')) {
      if (!environment) return 'The selected Environment is required for relative navigation.';
      url = new URL(target, environment.baseUrl);
    } else {
      url = new URL(target);
    }
  } catch {
    return 'Navigation target must be an absolute path or HTTP/HTTPS URL.';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return 'Only HTTP and HTTPS navigation is supported.';
  const allowlist = new Set(project.safetyPolicies[0]?.domainAllowlist.map((host) => host.toLowerCase()));
  if (!allowlist.has(url.hostname.toLowerCase()))
    return `Navigation host ${url.hostname.toLowerCase()} is not authorised by Project Safety.`;
  return null;
}

function safetyError(step: JourneyStepInput, project: JourneyProject) {
  const policy = project.safetyPolicies[0]!;
  const configuration = isRecord(policy.configuration) ? policy.configuration : {};
  const signal = `${step.action} ${step.selector ?? ''} ${step.value ?? ''} ${step.metadata.name ?? ''}`.toLowerCase();
  const checkout = /checkout-button|pay-button|\/checkout\b/.test(signal);
  const payment = /pay-button|payment/.test(signal);
  const order = /pay-button|create[^a-z]*order|order-confirmation|order-id/.test(signal);
  if (checkout && configuration.permitCheckoutSubmission !== true)
    return 'Checkout submission is disabled by Project Safety.';
  if (payment && configuration.permitMockPayment !== true)
    return 'Mock-payment actions are disabled by Project Safety.';
  if (order && configuration.permitTestOrderCreation !== true)
    return 'Test-order creation is disabled by Project Safety.';
  for (const prohibited of policy.blockedActions) {
    const blocked = prohibited.toLowerCase();
    if (
      (blocked.includes('checkout') && checkout) ||
      (blocked.includes('payment') && !blocked.includes('real payment') && payment) ||
      (blocked.includes('order') && order)
    )
      return `Journey step conflicts with prohibited action: ${prohibited}`;
  }
  return null;
}

function mergeInput(record: JourneyRecord, patch: UpdateJourneyInput): JourneyInput {
  const configuration = readJourneyConfiguration(record);
  if (!configuration)
    throw new ApplicationError(
      'JOURNEY_BUILDER_CONFIGURATION_REQUIRED',
      'This legacy Journey must be recreated with an Environment before it can be changed.',
      409,
    );
  const steps = record.steps.map((step) => {
    const mapped = mapStep(step);
    return {
      order: mapped.order,
      action: mapped.action as JourneyStepInput['action'],
      selector: mapped.selector,
      value: mapped.value,
      metadata: mapped.metadata,
    };
  });
  return {
    name: patch.name ?? record.name,
    description: patch.description === undefined ? record.description : patch.description,
    environmentId: patch.environmentId ?? configuration.environmentId,
    startPath: patch.startPath ?? configuration.startPath,
    state: patch.state ?? configuration.state,
    completionCondition: patch.completionCondition ?? configuration.completionCondition,
    steps: patch.steps ?? steps,
  };
}

function environmentReadinessCheck(environment: JourneyEnvironment): JourneyValidationCheck {
  if (environment.validationStatus === 'READY')
    return {
      key: 'environment-readiness',
      status: 'PASSED',
      message: 'The selected Environment is ready.',
    };
  if (environment.validationStatus === 'VALIDATION_FAILED')
    return {
      key: 'environment-readiness',
      status: 'FAILED',
      message: 'The selected Environment failed validation.',
    };
  return {
    key: 'environment-readiness',
    status: 'WARNING',
    message: `The selected Environment status is ${environment.validationStatus}.`,
  };
}

function orderingCheck(record: JourneyRecord): JourneyValidationCheck {
  const contiguous = record.steps.every((step, index) => step.order === index);
  return {
    key: 'step-ordering',
    status: contiguous ? 'PASSED' : 'FAILED',
    message: contiguous
      ? 'Step positions are unique and contiguous.'
      : 'Step positions must be unique and contiguous from zero.',
  };
}

function validationError(message: string) {
  return new ApplicationError('JOURNEY_VALIDATION_FAILED', message, 422);
}

function journeyNotFound() {
  return new ApplicationError('JOURNEY_NOT_FOUND', 'Journey was not found', 404);
}

function nameConflict() {
  return new ApplicationError(
    'JOURNEY_NAME_CONFLICT',
    'A Journey with this name already exists in this project',
    409,
  );
}

function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
