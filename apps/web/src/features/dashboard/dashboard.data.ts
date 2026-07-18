import type { Environment } from '../../services/environment-api.js';
import { environmentApi } from '../../services/environment-api.js';
import type { ProjectSummary } from '../../services/project-api.js';
import { projectApi } from '../../services/project-api.js';
import type { Invariant } from '../invariants/invariant-api.js';
import { invariantApi } from '../invariants/invariant-api.js';
import type { Journey } from '../journeys/journey-api.js';
import { journeyApi } from '../journeys/journey-api.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { dashboardActivityApi, type DashboardActivity } from './dashboard-activity-api.js';
import type {
  DashboardData,
  DashboardFindingSummary,
  DashboardInvestigationSummary,
  DashboardOrganisation,
  DashboardProject,
} from './dashboard.types.js';

const primaryDemoProjectName = 'Checkout Reliability Lab';

export interface DashboardDataSources {
  listProjects(): Promise<ProjectSummary[]>;
  listEnvironments(projectId: string): Promise<Environment[]>;
  listJourneys(projectId: string): Promise<Journey[]>;
  listInvariants(projectId: string): Promise<Invariant[]>;
  getActivity(): Promise<DashboardActivity>;
}

export interface DashboardDataResult {
  data: DashboardData;
  configurationWarnings: string[];
  investigationsAvailable: boolean;
  findingsAvailable: boolean;
}

export const dashboardDataSources: DashboardDataSources = {
  listProjects: () => projectApi.list(),
  listEnvironments: (projectId) => environmentApi.list(projectId),
  listJourneys: (projectId) => journeyApi.list(projectId),
  listInvariants: (projectId) => invariantApi.list(projectId),
  getActivity: () => dashboardActivityApi.get(),
};

export function dashboardQueryKey(organisationId: string) {
  return ['dashboard', organisationId] as const;
}

export async function loadDashboardData(
  organisation: DashboardOrganisation,
  sources: DashboardDataSources = dashboardDataSources,
): Promise<DashboardDataResult> {
  const [projects, activity] = await Promise.all([
    sources.listProjects(),
    sources.getActivity().then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    ),
  ]);
  const recentInvestigations = activity.status === 'fulfilled'
    ? activity.value.investigations.slice(0, 5).map(mapInvestigationActivity)
    : [];
  const recentFindings = activity.status === 'fulfilled'
    ? activity.value.findings.slice(0, 5).map(mapFindingActivity)
    : [];
  const investigationCounts = countByProject(recentInvestigations);
  const findingCounts = countByProject(recentFindings);
  const mapped = await Promise.all(
    projects.map(async (project) => mapProjectReadiness(project, sources, {
      recentInvestigations: investigationCounts.get(project.id) ?? 0,
      openFindings: findingCounts.get(project.id) ?? 0,
    })),
  );

  return {
    data: {
      organisation,
      projects: mapped.map((result) => result.project),
      recentInvestigations,
      recentFindings,
    },
    configurationWarnings: mapped.flatMap((result) => result.warnings),
    investigationsAvailable: activity.status === 'fulfilled',
    findingsAvailable: activity.status === 'fulfilled',
  };
}

async function mapProjectReadiness(
  project: ProjectSummary,
  sources: DashboardDataSources,
  activity: { recentInvestigations: number; openFindings: number },
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
      recentInvestigationCount: activity.recentInvestigations,
      openFindingCount: activity.openFindings,
      updatedAt: project.updatedAt,
      ...(unavailableConfiguration.length ? { unavailableConfiguration } : {}),
    },
    warnings: unavailableConfiguration.map(
      (resource) => `${project.name}: ${resource} readiness is unavailable.`,
    ),
  };
}

function mapInvestigationActivity(item: DashboardActivity['investigations'][number]): DashboardInvestigationSummary {
  return {
    id: item.id,
    projectId: item.projectId,
    projectName: item.projectName,
    name: item.name,
    status: item.status,
    findingCount: item.findingsCount,
    createdAt: item.createdAt,
    href: dashboardRoutes.investigation(item.id),
  };
}

function mapFindingActivity(item: DashboardActivity['findings'][number]): DashboardFindingSummary {
  return {
    id: item.id,
    investigationId: item.investigationId,
    projectId: item.projectId,
    projectName: item.projectName,
    title: item.title,
    severity: item.severity ?? 'UNSPECIFIED',
    status: item.status ?? (typeof item.confidence === 'string' ? item.confidence : 'OPEN'),
    createdAt: item.createdAt,
    href: dashboardRoutes.finding(item.investigationId, item.id),
  };
}

function countByProject(items: Array<{ projectId: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
  return counts;
}
