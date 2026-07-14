export interface CreateProjectInput { name: string; description: string | null; repositoryUrl: string | null }
export interface ProjectRecord extends CreateProjectInput { id: string; organisationId: string; createdAt: Date; updatedAt: Date }
