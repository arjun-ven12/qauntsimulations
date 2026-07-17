export const dashboardRoutes = {
  dashboard: '/dashboard',
  projects: '/projects',
  createProject: '/projects/new',
  project: (projectId: string) => `/projects/${projectId}`,
  safety: (projectId: string) => `/projects/${projectId}/safety`,
  environments: (projectId: string) => `/projects/${projectId}/environments`,
  journeys: (projectId: string) => `/projects/${projectId}/journeys`,
  invariants: (projectId: string) => `/projects/${projectId}/invariants`,
  startInvestigation: (projectId: string) => `/projects/${projectId}/investigations/new`,
  investigation: (investigationId: string) => `/investigations/${investigationId}`,
  investigationFindings: (investigationId: string) =>
    `/investigations/${investigationId}/findings`,
  finding: (investigationId: string, findingId: string) =>
    `/investigations/${investigationId}/findings/${findingId}`,
} as const;
