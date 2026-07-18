import { deriveOnboardingProgress } from '../onboarding/onboarding.model.js';
import type { OnboardingProgress } from '../onboarding/onboarding.types.js';
import type {
  DashboardData,
  DashboardFindingSummary,
  DashboardInvestigationSummary,
  DashboardProject,
} from './dashboard.types.js';
import { dashboardRoutes } from './dashboard.routes.js';

export interface DashboardProjectView {
  project: DashboardProject;
  onboarding: OnboardingProgress;
  ready: boolean;
  readinessScore: number;
  startInvestigationHref: string;
  continueSetupHref: string;
  projectHref: string;
}

export interface DashboardViewModel {
  organisation: DashboardData['organisation'];
  projects: DashboardProjectView[];
  primaryProject: DashboardProjectView | null;
  recentInvestigations: DashboardInvestigationSummary[];
  recentFindings: DashboardFindingSummary[];
  totals: {
    projectCount: number;
    readyProjectCount: number;
    recentInvestigationCount: number;
    openFindingCount: number;
  };
  executionOverview: {
    worldsExecuted: number | null;
    completionRate: number | null;
    openFindingCount: number;
    repairsVerified: null;
  };
}

export function createDashboardViewModel(data: DashboardData): DashboardViewModel {
  const projects = [...data.projects]
    .sort((left, right) => {
      if (Boolean(left.isPrimaryDemo) !== Boolean(right.isPrimaryDemo))
        return left.isPrimaryDemo ? -1 : 1;
      return timestamp(right.updatedAt) - timestamp(left.updatedAt) || left.name.localeCompare(right.name);
    })
    .map(projectView);
  const recentInvestigations = newestFirst(data.recentInvestigations).slice(0, 5);
  const recentFindings = newestFirst(data.recentFindings).slice(0, 5);
  return {
    organisation: data.organisation,
    projects,
    primaryProject: projects.find(({ project }) => project.isPrimaryDemo) ?? projects[0] ?? null,
    recentInvestigations,
    recentFindings,
    totals: {
      projectCount: projects.length,
      readyProjectCount: projects.filter((project) => project.ready).length,
      recentInvestigationCount: data.projects.reduce(
        (total, project) => total + project.recentInvestigationCount,
        0,
      ),
      openFindingCount: data.projects.reduce(
        (total, project) => total + project.openFindingCount,
        0,
      ),
    },
    executionOverview: {
      worldsExecuted: knownWorldTotal(recentInvestigations),
      completionRate: completionRate(recentInvestigations),
      openFindingCount: recentFindings.filter((finding) => finding.status === 'OPEN').length,
      repairsVerified: null,
    },
  };
}

export function projectView(project: DashboardProject): DashboardProjectView {
  const onboarding = deriveOnboardingProgress(project);
  return {
    project,
    onboarding,
    ready: onboarding.complete,
    readinessScore: onboarding.percentage,
    startInvestigationHref: dashboardRoutes.startInvestigation(project.id),
    continueSetupHref: onboarding.nextStep?.href ?? dashboardRoutes.project(project.id),
    projectHref: dashboardRoutes.project(project.id),
  };
}

function newestFirst<T extends { createdAt?: string }>(items: T[]) {
  return [...items].sort(
    (left, right) => timestamp(right.createdAt) - timestamp(left.createdAt),
  );
}

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function knownWorldTotal(investigations: DashboardInvestigationSummary[]) {
  const knownWorldCounts = investigations
    .map((investigation) => investigation.worldCount)
    .filter((count): count is number => count !== undefined);

  return knownWorldCounts.length ? knownWorldCounts.reduce((total, count) => total + count, 0) : null;
}

function completionRate(investigations: DashboardInvestigationSummary[]) {
  const concluded = investigations.filter((investigation) =>
    ['COMPLETED', 'FAILED', 'CANCELLED'].includes(investigation.status),
  );
  if (!concluded.length) return null;

  return Math.round(
    (concluded.filter((investigation) => investigation.status === 'COMPLETED').length /
      concluded.length) *
      100,
  );
}
