import type { DatabaseClient, Prisma } from '@taskos/database';
import type {
  EnvironmentInput,
  EnvironmentProject,
  EnvironmentRecord,
} from './environments.types.js';

export class EnvironmentRepository {
  constructor(private readonly database: DatabaseClient) {}
  findMembership(userId: string, organisationId: string) {
    return this.database.organisationMember.findFirst({
      where: { userId, organisationId },
      select: { role: true },
    });
  }
  findProject(organisationId: string, projectId: string): Promise<EnvironmentProject | null> {
    return this.database.project.findFirst({
      where: { id: projectId, organisationId, deletedAt: null },
      select: {
        id: true,
        organisationId: true,
        safetyPolicies: { select: { domainAllowlist: true, configuration: true }, take: 1 },
      },
    });
  }
  list(projectId: string) {
    return this.database.environment.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }) as Promise<EnvironmentRecord[]>;
  }
  find(projectId: string, id: string) {
    return this.database.environment.findFirst({
      where: { id, projectId, deletedAt: null },
    }) as Promise<EnvironmentRecord | null>;
  }
  async create(projectId: string, input: EnvironmentInput) {
    return this.database.$transaction(async (tx) => {
      if (
        input.isDefault ||
        !(await tx.environment.findFirst({
          where: { projectId, deletedAt: null, isDefault: true },
          select: { id: true },
        }))
      )
        await tx.environment.updateMany({
          where: { projectId, isDefault: true },
          data: { isDefault: false },
        });
      return tx.environment.create({
        data: {
          projectId,
          name: input.name,
          description: input.description,
          type: input.type,
          baseUrl: input.baseUrl,
          apiBaseUrl: input.apiBaseUrl,
          healthCheckUrl: input.healthCheckUrl,
          isDefault:
            input.isDefault ||
            !(await tx.environment.findFirst({
              where: { projectId, deletedAt: null, isDefault: true },
              select: { id: true },
            })),
          configuration: input.configuration as unknown as Prisma.InputJsonValue,
        },
      });
    }) as Promise<EnvironmentRecord>;
  }
  async update(projectId: string, id: string, input: Partial<EnvironmentInput>) {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.environment.findFirst({
        where: { id, projectId, deletedAt: null },
      });
      if (!existing) return null;
      if (input.isDefault)
        await tx.environment.updateMany({
          where: { projectId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      const { acknowledgement: _acknowledgement, configuration, ...fields } = input;
      return tx.environment.update({
        where: { id },
        data: {
          ...fields,
          ...(configuration === undefined ? {} : { configuration: configuration as unknown as Prisma.InputJsonValue }),
          validationStatus: 'NOT_VALIDATED',
          lastValidatedAt: null,
        },
      });
    }) as Promise<EnvironmentRecord | null>;
  }
  async setDefault(projectId: string, id: string) {
    return this.database.$transaction(async (tx) => {
      const found = await tx.environment.findFirst({
        where: { id, projectId, deletedAt: null },
        select: { id: true },
      });
      if (!found) return null;
      await tx.environment.updateMany({
        where: { projectId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.environment.update({ where: { id }, data: { isDefault: true } });
    }) as Promise<EnvironmentRecord | null>;
  }
  async saveValidation(
    projectId: string,
    id: string,
    status: 'INCOMPLETE' | 'READY' | 'VALIDATION_FAILED',
    results: unknown,
  ) {
    const item = await this.database.environment.findFirst({
      where: { id, projectId, deletedAt: null },
      select: { configuration: true },
    });
    if (!item) return null;
    const config = { ...(item.configuration as object), validationResults: results };
    return this.database.environment.update({
      where: { id },
      data: {
        configuration: config as Prisma.InputJsonValue,
        validationStatus: status,
        lastValidatedAt: new Date(),
      },
    }) as Promise<EnvironmentRecord>;
  }

  async saveEnvironmentIntelligence(projectId: string, id: string, intelligence: unknown) {
    const item = await this.database.environment.findFirst({
      where: { id, projectId, deletedAt: null },
      select: { configuration: true },
    });
    if (!item) return null;
    const config = { ...(item.configuration as object), environmentIntelligence: intelligence };
    return this.database.environment.update({
      where: { id },
      data: { configuration: config as Prisma.InputJsonValue },
    }) as Promise<EnvironmentRecord>;
  }
}
