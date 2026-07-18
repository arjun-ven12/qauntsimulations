import type { DatabaseClient, Prisma } from '@taskos/database';
import type { TemplateCategory } from './templates.schema.js';
import type {
  TemplateCreateRecord,
  TemplateMembership,
  TemplateRecord,
  TemplateUpdateRecord,
} from './templates.types.js';

export interface TemplateRepositoryContract {
  findMembership(userId: string, organisationId: string): Promise<TemplateMembership | null>;
  list(
    organisationId: string,
    ownerUserId: string,
    category?: TemplateCategory,
  ): Promise<TemplateRecord[]>;
  find(organisationId: string, ownerUserId: string, id: string): Promise<TemplateRecord | null>;
  create(input: TemplateCreateRecord): Promise<TemplateRecord>;
  update(
    organisationId: string,
    ownerUserId: string,
    id: string,
    input: TemplateUpdateRecord,
  ): Promise<TemplateRecord | null>;
  remove(organisationId: string, ownerUserId: string, id: string): Promise<boolean>;
}

export class PrismaTemplateRepository implements TemplateRepositoryContract {
  constructor(private readonly database: DatabaseClient) {}

  findMembership(userId: string, organisationId: string) {
    return this.database.organisationMember.findFirst({
      where: {
        userId,
        organisationId,
        user: { deletedAt: null },
        organisation: { deletedAt: null },
      },
      select: { role: true },
    });
  }

  list(organisationId: string, ownerUserId: string, category?: TemplateCategory) {
    return this.database.customTemplate.findMany({
      where: { organisationId, ownerUserId, ...(category ? { category } : {}) },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    }) as Promise<TemplateRecord[]>;
  }

  find(organisationId: string, ownerUserId: string, id: string) {
    return this.database.customTemplate.findFirst({
      where: { id, organisationId, ownerUserId },
    }) as Promise<TemplateRecord | null>;
  }

  create(input: TemplateCreateRecord) {
    return this.database.customTemplate.create({
      data: { ...input, payload: input.payload as Prisma.InputJsonValue },
    }) as Promise<TemplateRecord>;
  }

  async update(
    organisationId: string,
    ownerUserId: string,
    id: string,
    input: TemplateUpdateRecord,
  ) {
    if (!(await this.find(organisationId, ownerUserId, id))) return null;
    const { payload, ...fields } = input;
    return this.database.customTemplate.update({
      where: { id },
      data: {
        ...fields,
        ...(payload === undefined ? {} : { payload: payload as Prisma.InputJsonValue }),
      },
    }) as Promise<TemplateRecord>;
  }

  async remove(organisationId: string, ownerUserId: string, id: string) {
    const result = await this.database.customTemplate.deleteMany({
      where: { id, organisationId, ownerUserId },
    });
    return result.count > 0;
  }
}
