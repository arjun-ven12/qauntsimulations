import type { DatabaseClient, Prisma } from '@taskos/database';
import { mapInvariantInputToAssertion } from './invariants.mapper.js';
import type {
  InvariantInput,
  InvariantMembership,
  InvariantProject,
  InvariantRecord,
} from './invariants.types.js';

export interface InvariantRepositoryContract {
  findMembership(userId: string, organisationId: string): Promise<InvariantMembership | null>;
  findProject(organisationId: string, projectId: string): Promise<InvariantProject | null>;
  create(
    organisationId: string,
    projectId: string,
    input: InvariantInput,
  ): Promise<InvariantRecord>;
  list(organisationId: string, projectId: string): Promise<InvariantRecord[]>;
  find(
    organisationId: string,
    projectId: string,
    invariantId: string,
  ): Promise<InvariantRecord | null>;
  update(
    organisationId: string,
    projectId: string,
    invariantId: string,
    input: InvariantInput,
  ): Promise<InvariantRecord | null>;
  archive(organisationId: string, projectId: string, invariantId: string): Promise<boolean>;
  nameExists(
    organisationId: string,
    projectId: string,
    name: string,
    excludingId?: string,
  ): Promise<boolean>;
}

export class InvariantRepository implements InvariantRepositoryContract {
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

  findProject(organisationId: string, projectId: string): Promise<InvariantProject | null> {
    return this.database.project.findFirst({
      where: { id: projectId, organisationId, deletedAt: null },
      select: { id: true, organisationId: true },
    });
  }

  create(organisationId: string, projectId: string, input: InvariantInput) {
    return this.database.invariant.create({
      data: {
        organisationId,
        projectId,
        name: input.name,
        description: input.description,
        assertion: mapInvariantInputToAssertion(input) as unknown as Prisma.InputJsonValue,
      },
    }) as Promise<InvariantRecord>;
  }

  list(organisationId: string, projectId: string) {
    return this.database.invariant.findMany({
      where: { organisationId, projectId, deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    }) as Promise<InvariantRecord[]>;
  }

  find(organisationId: string, projectId: string, invariantId: string) {
    return this.database.invariant.findFirst({
      where: { id: invariantId, organisationId, projectId, deletedAt: null },
    }) as Promise<InvariantRecord | null>;
  }

  async update(
    organisationId: string,
    projectId: string,
    invariantId: string,
    input: InvariantInput,
  ) {
    const updated = await this.database.$transaction(async (transaction) => {
      const current = await transaction.invariant.findFirst({
        where: { id: invariantId, organisationId, projectId, deletedAt: null },
        select: { id: true },
      });
      if (!current) return false;
      await transaction.invariant.update({
        where: { id: invariantId },
        data: {
          name: input.name,
          description: input.description,
          assertion: mapInvariantInputToAssertion(input) as unknown as Prisma.InputJsonValue,
        },
      });
      return true;
    });
    return updated ? this.find(organisationId, projectId, invariantId) : null;
  }

  async archive(organisationId: string, projectId: string, invariantId: string) {
    const result = await this.database.invariant.updateMany({
      where: { id: invariantId, organisationId, projectId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count === 1;
  }

  async nameExists(
    organisationId: string,
    projectId: string,
    name: string,
    excludingId?: string,
  ) {
    return Boolean(
      await this.database.invariant.findFirst({
        where: {
          organisationId,
          projectId,
          name,
          deletedAt: null,
          ...(excludingId ? { id: { not: excludingId } } : {}),
        },
        select: { id: true },
      }),
    );
  }
}
