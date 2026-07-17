import { deriveOnboardingProgress } from '../onboarding/onboarding.model.js';
import type { OnboardingProgress } from '../onboarding/onboarding.types.js';
import type {
  DashboardData,
  DashboardFindingSummary,
  DashboardInvestigationSummary,
  DashboardProject,
} from './dashboard.types.js';

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
  };
}

export function projectView(project: DashboardProject): DashboardProjectView {
  const onboarding = deriveOnboardingProgress(project);
  return {
    project,
    onboarding,
    ready: onboarding.complete,
    readinessScore: onboarding.percentage,
    startInvestigationHref: `/projects/${project.id}/investigations/new`,
    continueSetupHref: onboarding.nextStep?.href ?? `/projects/${project.id}`,
    projectHref: `/projects/${project.id}`,
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
