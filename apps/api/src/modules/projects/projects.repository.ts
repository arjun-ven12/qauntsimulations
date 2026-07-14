import type { DatabaseClient } from '@taskos/database';
import type { CreateProjectInput, ProjectRecord } from './projects.types.js';
export interface ProjectRepository { create(organisationId: string, input: CreateProjectInput): Promise<ProjectRecord>; list(organisationId: string): Promise<ProjectRecord[]>; find(organisationId: string, id: string): Promise<ProjectRecord | null> }
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly database: DatabaseClient) {}
  create(organisationId: string, input: CreateProjectInput) { return this.database.project.create({ data: { organisationId, ...input } }); }
  list(organisationId: string) { return this.database.project.findMany({ where: { organisationId, deletedAt: null }, orderBy: { createdAt: 'desc' } }); }
  find(organisationId: string, id: string) { return this.database.project.findFirst({ where: { id, organisationId, deletedAt: null } }); }
}
