import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission } from '../organisations/organisation.permissions.js';
import type { TemplateRepositoryContract } from './templates.repository.js';
import {
  parseTemplatePayload,
  type CreateTemplateInput,
  type TemplateCategory,
  type UpdateTemplateInput,
} from './templates.schema.js';
import type { TemplateRecord, TemplateUpdateRecord } from './templates.types.js';

export class TemplateService {
  constructor(private readonly repository: TemplateRepositoryContract) {}

  async list(context: AuthContext, category?: TemplateCategory) {
    const organisationId = await this.requirePermission(context, false);
    return (await this.repository.list(organisationId, context.userId, category)).map(
      publicTemplate,
    );
  }

  async get(context: AuthContext, id: string) {
    const organisationId = await this.requirePermission(context, false);
    return publicTemplate(await this.requireTemplate(organisationId, context.userId, id));
  }

  async create(context: AuthContext, input: CreateTemplateInput) {
    const organisationId = await this.requirePermission(context, true);
    const payload = safePayload(input.category, input.payload);
    try {
      return publicTemplate(
        await this.repository.create({
          organisationId,
          ownerUserId: context.userId,
          category: input.category,
          name: input.name,
          normalizedName: normaliseName(input.name),
          description: input.description ?? null,
          schemaVersion: 1,
          payload,
        }),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) throw templateNameConflict();
      throw error;
    }
  }

  async update(context: AuthContext, id: string, input: UpdateTemplateInput) {
    const organisationId = await this.requirePermission(context, true);
    const current = await this.requireTemplate(organisationId, context.userId, id);
    const update: TemplateUpdateRecord = {
      ...(input.name === undefined
        ? {}
        : { name: input.name, normalizedName: normaliseName(input.name) }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.schemaVersion === undefined ? {} : { schemaVersion: input.schemaVersion }),
      ...(input.payload === undefined
        ? {}
        : { payload: safePayload(current.category, input.payload) }),
    };
    try {
      const updated = await this.repository.update(organisationId, context.userId, id, update);
      if (!updated) throw templateNotFound();
      return publicTemplate(updated);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw templateNameConflict();
      throw error;
    }
  }

  async remove(context: AuthContext, id: string) {
    const organisationId = await this.requirePermission(context, true);
    if (!(await this.repository.remove(organisationId, context.userId, id))) {
      throw templateNotFound();
    }
  }

  private async requirePermission(context: AuthContext, mutation: boolean) {
    if (!context.organisationId) {
      throw new ApplicationError(
        'ORGANISATION_REQUIRED',
        'An organisation context is required',
        403,
      );
    }
    const membership = await this.repository.findMembership(context.userId, context.organisationId);
    const permission = mutation ? 'EDIT_PROJECTS' : 'VIEW_PROJECTS';
    if (!membership || !hasOrganisationPermission(membership.role, permission)) {
      throw new ApplicationError(
        'INSUFFICIENT_PERMISSION',
        'Your organisation role does not permit this template action',
        403,
      );
    }
    return context.organisationId;
  }

  private async requireTemplate(organisationId: string, ownerUserId: string, id: string) {
    const template = await this.repository.find(organisationId, ownerUserId, id);
    if (!template) throw templateNotFound();
    return template;
  }
}

function publicTemplate(record: TemplateRecord) {
  return {
    id: record.id,
    category: record.category,
    source: 'CUSTOM' as const,
    name: record.name,
    ...(record.description ? { description: record.description } : {}),
    schemaVersion: 1 as const,
    payload: record.payload,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function safePayload(category: TemplateCategory, payload: unknown) {
  try {
    return parseTemplatePayload(category, payload);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cannot be saved')) {
      throw new ApplicationError('TEMPLATE_PAYLOAD_UNSAFE', error.message, 422);
    }
    throw error;
  }
}

function normaliseName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function templateNotFound() {
  return new ApplicationError('TEMPLATE_NOT_FOUND', 'Template not found', 404);
}

function templateNameConflict() {
  return new ApplicationError(
    'TEMPLATE_NAME_CONFLICT',
    'A template with this name already exists in this category',
    409,
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
