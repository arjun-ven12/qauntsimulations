import type { Environment } from '../../services/environment-api.js';
import { environmentApi } from '../../services/environment-api.js';
import type { ProjectSummary } from '../../services/project-api.js';
import { projectApi } from '../../services/project-api.js';
import type { Invariant } from '../invariants/invariant-api.js';
import { invariantApi } from '../invariants/invariant-api.js';
import type { Journey } from '../journeys/journey-api.js';
import { journeyApi } from '../journeys/journey-api.js';
import type { DashboardData, DashboardOrganisation, DashboardProject } from './dashboard.types.js';

const primaryDemoProjectName = 'Checkout Reliability Lab';

export interface DashboardDataSources {
  listProjects(): Promise<ProjectSummary[]>;
  listEnvironments(projectId: string): Promise<Environment[]>;
  listJourneys(projectId: string): Promise<Journey[]>;
  listInvariants(projectId: string): Promise<Invariant[]>;
}

export interface DashboardDataResult {
  data: DashboardData;
  configurationWarnings: string[];
  investigationsAvailable: false;
  findingsAvailable: false;
}

export const dashboardDataSources: DashboardDataSources = {
  listProjects: () => projectApi.list(),
  listEnvironments: (projectId) => environmentApi.list(projectId),
  listJourneys: (projectId) => journeyApi.list(projectId),
  listInvariants: (projectId) => invariantApi.list(projectId),
};

export function dashboardQueryKey(organisationId: string) {
  return ['dashboard', organisationId] as const;
}

export async function loadDashboardData(
  organisation: DashboardOrganisation,
  sources: DashboardDataSources = dashboardDataSources,
): Promise<DashboardDataResult> {
  const projects = await sources.listProjects();
  const mapped = await Promise.all(
    projects.map(async (project) => mapProjectReadiness(project, sources)),
  );

  return {
    data: {
      organisation,
      projects: mapped.map((result) => result.project),
      recentInvestigations: [],
      recentFindings: [],
    },
    configurationWarnings: mapped.flatMap((result) => result.warnings),
    investigationsAvailable: false,
    findingsAvailable: false,
  };
}

async function mapProjectReadiness(
  project: ProjectSummary,
  sources: DashboardDataSources,
): Promise<{ project: DashboardProject; warnings: string[] }> {
  const [environments, journeys, invariants] = await Promise.allSettled([
    sources.listEnvironments(project.id),
    sources.listJourneys(project.id),
    sources.listInvariants(project.id),
  ]);
  const unavailableConfiguration: DashboardProject['unavailableConfiguration'] = [];
  if (environments.status === 'rejected') unavailableConfiguration.push('environments');
  if (journeys.status === 'rejected') unavailableConfiguration.push('journeys');
  if (invariants.status === 'rejected') unavailableConfiguration.push('invariants');

  const environmentValues = environments.status === 'fulfilled' ? environments.value : [];
  const journeyValues = journeys.status === 'fulfilled' ? journeys.value : [];
  const invariantValues = invariants.status === 'fulfilled' ? invariants.value : [];
  const enabledJourneys = journeyValues.filter((journey) => journey.state === 'ENABLED');
  const enabledInvariants = invariantValues.filter((invariant) => invariant.enabled);

  return {
    project: {
      id: project.id,
      name: project.name,
      ...(project.description ? { description: project.description } : {}),
      isPrimaryDemo: project.name === primaryDemoProjectName,
      safetyConfigured: project.safety.configured,
      readyEnvironmentCount: environmentValues.filter(
        (environment) => environment.validationStatus === 'READY',
      ).length,
      totalEnvironmentCount: environmentValues.length,
      readyJourneyCount: enabledJourneys.filter(
        (journey) => journey.validationStatus === 'READY',
      ).length,
      totalJourneyCount: enabledJourneys.length,
      readyInvariantCount: enabledInvariants.filter(
        (invariant) => invariant.validationStatus === 'READY',
      ).length,
      totalInvariantCount: enabledInvariants.length,
      recentInvestigationCount: 0,
      openFindingCount: 0,
      updatedAt: project.updatedAt,
      ...(unavailableConfiguration.length ? { unavailableConfiguration } : {}),
    },
    warnings: unavailableConfiguration.map(
      (resource) => `${project.name}: ${resource} readiness is unavailable.`,
    ),
  };
}
