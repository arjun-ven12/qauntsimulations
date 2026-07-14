import { ApplicationError } from '../../core/errors/application-error.js';
import { mapProject } from './projects.mapper.js';
import type { ProjectRepository } from './projects.repository.js';
import type { CreateProjectInput } from './projects.types.js';
export class ProjectService { constructor(private readonly repository: ProjectRepository) {} async create(organisationId: string, input: CreateProjectInput) { return mapProject(await this.repository.create(organisationId, input)); } async list(organisationId: string) { return Promise.all((await this.repository.list(organisationId)).map(mapProject)); } async get(organisationId: string, id: string) { const project = await this.repository.find(organisationId, id); if (!project) throw new ApplicationError('PROJECT_NOT_FOUND', 'Project was not found', 404); return mapProject(project); } }
