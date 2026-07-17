import type { DatabaseClient, Prisma } from '@taskos/database';
import { tryParseSafetyConfiguration } from '../projects/projects.mapper.js';
import { encodeSteps } from './journeys.mapper.js';
import type {
  JourneyEnvironment,
  JourneyMembership,
  JourneyPersistenceInput,
  JourneyProject,
  JourneyRecord,
} from './journeys.types.js';

export interface JourneyRepositoryContract {
  findMembership(userId: string, organisationId: string): Promise<JourneyMembership | null>;
  findProject(organisationId: string, projectId: string): Promise<JourneyProject | null>;
  findEnvironment(projectId: string, environmentId: string): Promise<JourneyEnvironment | null>;
  create(projectId: string, input: JourneyPersistenceInput): Promise<JourneyRecord>;
  list(projectId: string): Promise<JourneyRecord[]>;
  find(projectId: string, journeyId: string): Promise<JourneyRecord | null>;
  update(
    projectId: string,
    journeyId: string,
    input: JourneyPersistenceInput,
  ): Promise<JourneyRecord | null>;
  archive(projectId: string, journeyId: string): Promise<boolean>;
  nameExists(projectId: string, name: string, excludingId?: string): Promise<boolean>;
  setValidationMetadata(
    projectId: string,
    journeyId: string,
    metadata: Record<string, unknown>,
  ): Promise<JourneyRecord | null>;
}

const journeyInclude = { steps: { orderBy: { order: 'asc' as const } } };

export class JourneyRepository implements JourneyRepositoryContract {
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

  async findProject(organisationId: string, projectId: string): Promise<JourneyProject | null> {
    const project = await this.database.project.findFirst({
      where: { id: projectId, organisationId, deletedAt: null },
      select: {
        id: true,
        organisationId: true,
        safetyPolicies: {
          select: { domainAllowlist: true, blockedActions: true, configuration: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    if (!project) return null;
    return {
      ...project,
      safetyPolicies: project.safetyPolicies.map((policy) => ({
        ...policy,
        configuration:
          tryParseSafetyConfiguration(policy.configuration) ?? policy.configuration,
      })),
    };
  }

  findEnvironment(projectId: string, environmentId: string): Promise<JourneyEnvironment | null> {
    return this.database.environment.findFirst({
      where: { id: environmentId, projectId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        baseUrl: true,
        validationStatus: true,
        deletedAt: true,
      },
    });
  }

  create(projectId: string, input: JourneyPersistenceInput): Promise<JourneyRecord> {
    return this.database.journey.create({
      data: {
        projectId,
        name: input.name,
        description: input.description,
        steps: {
          create: encodeSteps(input).map((step) => ({
            ...step,
            metadata: step.metadata as Prisma.InputJsonValue,
          })),
        },
      },
      include: journeyInclude,
    });
  }

  list(projectId: string): Promise<JourneyRecord[]> {
    return this.database.journey.findMany({
      where: { projectId, deletedAt: null },
      include: journeyInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  find(projectId: string, journeyId: string): Promise<JourneyRecord | null> {
    return this.database.journey.findFirst({
      where: { id: journeyId, projectId, deletedAt: null },
      include: journeyInclude,
    });
  }

  async update(
    projectId: string,
    journeyId: string,
    input: JourneyPersistenceInput,
  ): Promise<JourneyRecord | null> {
    const updated = await this.database.$transaction(async (transaction) => {
      const current = await transaction.journey.findFirst({
        where: { id: journeyId, projectId, deletedAt: null },
        select: { id: true },
      });
      if (!current) return false;
      await transaction.journey.update({
        where: { id: journeyId },
        data: { name: input.name, description: input.description },
      });
      await transaction.journeyStep.deleteMany({ where: { journeyId } });
      await transaction.journeyStep.createMany({
        data: encodeSteps(input).map((step) => ({
          journeyId,
          ...step,
          metadata: step.metadata as Prisma.InputJsonValue,
        })),
      });
      return true;
    });
    return updated ? this.find(projectId, journeyId) : null;
  }

  async archive(projectId: string, journeyId: string) {
    const result = await this.database.journey.updateMany({
      where: { id: journeyId, projectId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count === 1;
  }

  async nameExists(projectId: string, name: string, excludingId?: string) {
    return Boolean(
      await this.database.journey.findFirst({
        where: {
          projectId,
          name,
          deletedAt: null,
          ...(excludingId ? { id: { not: excludingId } } : {}),
        },
        select: { id: true },
      }),
    );
  }

  async setValidationMetadata(
    projectId: string,
    journeyId: string,
    metadata: Record<string, unknown>,
  ) {
    const journey = await this.find(projectId, journeyId);
    const first = journey?.steps[0];
    if (!first) return null;
    const updated = await this.database.$transaction(async (transaction) => {
      const result = await transaction.journeyStep.updateMany({
        where: { id: first.id, journeyId },
        data: { metadata: metadata as Prisma.InputJsonValue },
      });
      if (!result.count) return false;
      await transaction.journey.update({
        where: { id: journeyId },
        data: { updatedAt: new Date() },
      });
      return true;
    });
    return updated ? this.find(projectId, journeyId) : null;
  }
}
