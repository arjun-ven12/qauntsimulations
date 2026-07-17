import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission } from '../organisations/organisation.permissions.js';
import {
  mapInvariant,
  mapPersistedInvariantToRuntimeDefinition,
} from './invariants.mapper.js';
import type { InvariantRepositoryContract } from './invariants.repository.js';
import {
  isPlainLanguage,
  persistedInvariantAssertionSchema,
} from './invariants.schema.js';
import type {
  InvariantInput,
  InvariantRecord,
  InvariantValidationCheck,
  UpdateInvariantInput,
} from './invariants.types.js';

export class InvariantService {
  constructor(private readonly repository: InvariantRepositoryContract) {}

  async create(context: AuthContext, projectId: string, input: InvariantInput) {
    const organisationId = await this.authorize(context, projectId, true);
    await this.requireUniqueName(organisationId, projectId, input.name);
    try {
      return mapInvariant(await this.repository.create(organisationId, projectId, input));
    } catch (error) {
      if (isUnique(error)) throw nameConflict();
      throw error;
    }
  }

  async list(context: AuthContext, projectId: string) {
    const organisationId = await this.authorize(context, projectId, false);
    return (await this.repository.list(organisationId, projectId)).map(mapInvariant);
  }

  async get(context: AuthContext, projectId: string, invariantId: string) {
    const organisationId = await this.authorize(context, projectId, false);
    return mapInvariant(await this.requireInvariant(organisationId, projectId, invariantId));
  }

  async update(
    context: AuthContext,
    projectId: string,
    invariantId: string,
    patch: UpdateInvariantInput,
  ) {
    const organisationId = await this.authorize(context, projectId, true);
    const current = await this.requireInvariant(organisationId, projectId, invariantId);
    const input = mergeInput(current, patch);
    if (patch.name !== undefined)
      await this.requireUniqueName(organisationId, projectId, input.name, invariantId);
    try {
      const updated = await this.repository.update(
        organisationId,
        projectId,
        invariantId,
        input,
      );
      if (!updated) throw invariantNotFound();
      return mapInvariant(updated);
    } catch (error) {
      if (isUnique(error)) throw nameConflict();
      throw error;
    }
  }

  async remove(context: AuthContext, projectId: string, invariantId: string) {
    const organisationId = await this.authorize(context, projectId, true);
    if (!(await this.repository.archive(organisationId, projectId, invariantId)))
      throw invariantNotFound();
  }

  async duplicate(context: AuthContext, projectId: string, invariantId: string) {
    const organisationId = await this.authorize(context, projectId, true);
    const current = await this.requireInvariant(organisationId, projectId, invariantId);
    const input = mergeInput(current, {});
    const name = await this.copyName(organisationId, projectId, current.name);
    try {
      return mapInvariant(
        await this.repository.create(organisationId, projectId, {
          ...input,
          name,
          enabled: false,
        }),
      );
    } catch (error) {
      if (isUnique(error)) throw nameConflict();
      throw error;
    }
  }

  async validate(context: AuthContext, projectId: string, invariantId: string) {
    const organisationId = await this.authorize(context, projectId, true);
    const record = await this.requireInvariant(organisationId, projectId, invariantId);
    const checks = validationChecks(record);
    const status = checks.some((check) => check.status === 'FAILED') ? 'INVALID' : 'READY';
    return { status, checks, invariant: mapInvariant(record) };
  }

  private async authorize(context: AuthContext, projectId: string, mutation: boolean) {
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
        'Your organisation role does not permit this Invariant action',
        403,
      );
    if (!(await this.repository.findProject(context.organisationId, projectId)))
      throw new ApplicationError('PROJECT_NOT_FOUND', 'Project was not found', 404);
    return context.organisationId;
  }

  private async requireInvariant(
    organisationId: string,
    projectId: string,
    invariantId: string,
  ) {
    const invariant = await this.repository.find(organisationId, projectId, invariantId);
    if (!invariant) throw invariantNotFound();
    return invariant;
  }

  private async requireUniqueName(
    organisationId: string,
    projectId: string,
    name: string,
    excludingId?: string,
  ) {
    if (await this.repository.nameExists(organisationId, projectId, name, excludingId))
      throw nameConflict();
  }

  private async copyName(organisationId: string, projectId: string, sourceName: string) {
    const base = `${sourceName} copy`;
    if (!(await this.repository.nameExists(organisationId, projectId, base))) return base;
    for (let number = 2; number < 10_000; number += 1) {
      const candidate = `${base} ${number}`;
      if (!(await this.repository.nameExists(organisationId, projectId, candidate)))
        return candidate;
    }
    throw nameConflict();
  }
}

function mergeInput(record: InvariantRecord, patch: UpdateInvariantInput): InvariantInput {
  const assertion = persistedInvariantAssertionSchema.safeParse(record.assertion);
  if (!assertion.success)
    throw new ApplicationError(
      'INVARIANT_CONFIGURATION_UNSUPPORTED',
      'This legacy Invariant must be recreated with a supported evaluator configuration',
      409,
    );
  const input = {
    name: patch.name ?? record.name,
    description: patch.description ?? record.description,
    type: patch.type ?? assertion.data.type,
    configuration: patch.configuration ?? assertion.data.config,
    severity: patch.severity ?? assertion.data.severity,
    enabled: patch.enabled ?? assertion.data.enabled,
  };
  const parsed = persistedInvariantAssertionSchema.safeParse({
    type: input.type,
    severity: input.severity,
    enabled: input.enabled,
    config: input.configuration,
  });
  if (!parsed.success)
    throw new ApplicationError(
      'INVARIANT_CONFIGURATION_INVALID',
      'Configuration does not match the selected evaluator',
      422,
      parsed.error.flatten(),
    );
  return input;
}

function validationChecks(record: InvariantRecord): InvariantValidationCheck[] {
  const checks: InvariantValidationCheck[] = [
    {
      key: 'name',
      status: record.name.trim() ? 'PASSED' : 'FAILED',
      message: record.name.trim() ? 'Invariant name is present.' : 'Invariant name is required.',
    },
    {
      key: 'description',
      status:
        record.description.trim() && isPlainLanguage(record.description) ? 'PASSED' : 'FAILED',
      message:
        record.description.trim() && isPlainLanguage(record.description)
          ? 'Rule is a non-executable plain-language description.'
          : 'Rule must be a non-executable plain-language description.',
    },
  ];
  const assertion = persistedInvariantAssertionSchema.safeParse(record.assertion);
  if (!assertion.success) {
    checks.push({
      key: 'runtime-definition',
      status: 'FAILED',
      message: 'Evaluator, severity, enabled state, or configuration is unsupported.',
    });
    return checks;
  }
  checks.push(
    {
      key: 'evaluator',
      status: 'PASSED',
      message: `${assertion.data.type} has a registered Playwright evaluator.`,
    },
    {
      key: 'severity',
      status: 'PASSED',
      message: `${assertion.data.severity} is a supported runtime severity.`,
    },
    {
      key: 'configuration',
      status: 'PASSED',
      message: 'Structured configuration matches the evaluator schema.',
    },
    {
      key: 'enabled-state',
      status: 'PASSED',
      message: `Invariant is ${assertion.data.enabled ? 'enabled' : 'disabled'}.`,
    },
  );
  try {
    if (assertion.data.enabled) mapPersistedInvariantToRuntimeDefinition(record);
    checks.push({
      key: 'runtime-mapper',
      status: 'PASSED',
      message: assertion.data.enabled
        ? 'Invariant maps directly to the runtime definition.'
        : 'Disabled Invariant is valid and intentionally excluded from runtime mapping.',
    });
  } catch (error) {
    checks.push({
      key: 'runtime-mapper',
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Runtime mapping failed.',
    });
  }
  return checks;
}

function invariantNotFound() {
  return new ApplicationError('INVARIANT_NOT_FOUND', 'Invariant was not found', 404);
}

function nameConflict() {
  return new ApplicationError(
    'INVARIANT_NAME_CONFLICT',
    'An Invariant with this name already exists in this project',
    409,
  );
}

function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
