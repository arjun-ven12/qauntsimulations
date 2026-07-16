import type { DatabaseClient, Prisma } from '@taskos/database';
import type {
  ProjectListRecord,
  ProjectMembership,
  ProjectMutationRecord,
  ProjectRecord,
} from './projects.types.js';

export interface ProjectRepository {
  findMembership(userId: string, organisationId: string): Promise<ProjectMembership | null>;
  create(input: ProjectMutationRecord): Promise<ProjectRecord>;
  list(organisationId: string): Promise<ProjectListRecord[]>;
  find(organisationId: string, id: string): Promise<ProjectRecord | null>;
  update(input: ProjectMutationRecord): Promise<ProjectRecord | null>;
  updateSafety(input: {
    organisationId: string;
    projectId: string;
    configuration: ProjectMutationRecord['configuration'];
    domainAllowlist: string[];
    blockedActions: string[];
  }): Promise<ProjectRecord | null>;
}

const projectDetails = {
  organisation: { select: { id: true, name: true, slug: true } },
  secrets: {
    select: { id: true, name: true, provider: true, externalReference: true },
    orderBy: { createdAt: 'asc' as const },
  },
  safetyPolicies: {
    select: {
      id: true,
      domainAllowlist: true,
      blockedActions: true,
      configuration: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
    take: 1,
  },
};

export class PrismaProjectRepository implements ProjectRepository {
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

  async create(input: ProjectMutationRecord): Promise<ProjectRecord> {
    const projectId = await this.database.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          organisationId: input.organisationId,
          name: input.name,
          description: input.description,
          repositoryUrl: input.repositoryUrl,
        },
        select: { id: true },
      });
      await transaction.safetyPolicy.create({
        data: {
          organisationId: input.organisationId,
          projectId: project.id,
          name: 'Project safety',
          domainAllowlist: input.domainAllowlist,
          blockedActions: input.blockedActions,
          configuration: input.configuration as unknown as Prisma.InputJsonValue,
        },
      });
      if (input.credentialReferences?.length) {
        await transaction.projectSecretReference.createMany({
          data: input.credentialReferences.map((credential) => ({
            organisationId: input.organisationId,
            projectId: project.id,
            name: credential.label,
            provider: inferCredentialProvider(credential.reference),
            externalReference: credential.reference,
          })),
        });
      }
      return project.id;
    });
    return (await this.find(input.organisationId, projectId))!;
  }

  list(organisationId: string): Promise<ProjectListRecord[]> {
    return this.database.project.findMany({
      where: { organisationId, deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: {
        organisation: { select: { id: true, name: true, slug: true } },
        safetyPolicies: {
          select: { domainAllowlist: true, blockedActions: true, configuration: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
  }

  find(organisationId: string, id: string): Promise<ProjectRecord | null> {
    return this.database.project.findFirst({
      where: { id, organisationId, deletedAt: null },
      include: projectDetails,
    });
  }

  async update(input: ProjectMutationRecord): Promise<ProjectRecord | null> {
    if (!(await this.find(input.organisationId, input.projectId))) return null;
    await this.database.$transaction(async (transaction) => {
      await transaction.project.update({
        where: { id: input.projectId },
        data: {
          name: input.name,
          description: input.description,
          repositoryUrl: input.repositoryUrl,
        },
      });
      await transaction.safetyPolicy.updateMany({
        where: { projectId: input.projectId, organisationId: input.organisationId },
        data: {
          domainAllowlist: input.domainAllowlist,
          configuration: input.configuration as unknown as Prisma.InputJsonValue,
        },
      });
      if (input.credentialReferences) {
        await transaction.projectSecretReference.deleteMany({
          where: {
            projectId: input.projectId,
            organisationId: input.organisationId,
            externalReference: { not: null },
          },
        });
        if (input.credentialReferences.length) {
          await transaction.projectSecretReference.createMany({
            data: input.credentialReferences.map((credential) => ({
              organisationId: input.organisationId,
              projectId: input.projectId,
              name: credential.label,
              provider: inferCredentialProvider(credential.reference),
              externalReference: credential.reference,
            })),
          });
        }
      }
    });
    return this.find(input.organisationId, input.projectId);
  }

  async updateSafety(input: {
    organisationId: string;
    projectId: string;
    configuration: ProjectMutationRecord['configuration'];
    domainAllowlist: string[];
    blockedActions: string[];
  }): Promise<ProjectRecord | null> {
    const result = await this.database.safetyPolicy.updateMany({
      where: { projectId: input.projectId, organisationId: input.organisationId },
      data: {
        domainAllowlist: input.domainAllowlist,
        blockedActions: input.blockedActions,
        configuration: input.configuration as unknown as Prisma.InputJsonValue,
      },
    });
    return result.count ? this.find(input.organisationId, input.projectId) : null;
  }
}

function inferCredentialProvider(reference: string): string {
  if (reference.startsWith('1password://')) return '1password';
  if (reference.startsWith('vault://')) return 'vault';
  const scheme = reference.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1];
  return scheme?.toLowerCase() ?? 'reference';
}
