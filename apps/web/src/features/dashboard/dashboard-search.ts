import type { DashboardViewModel } from './dashboard.model.js';

export interface DashboardSearchResults {
  projects: DashboardViewModel['projects'];
  investigations: DashboardViewModel['recentInvestigations'];
  findings: DashboardViewModel['recentFindings'];
}

export function searchDashboard(
  dashboard: DashboardViewModel,
  query: string,
): DashboardSearchResults {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return {
      projects: dashboard.projects,
      investigations: dashboard.recentInvestigations,
      findings: dashboard.recentFindings,
    };
  }

  return {
    projects: dashboard.projects.filter(({ project }) =>
      matches(needle, project.name, project.description),
    ),
    investigations: dashboard.recentInvestigations.filter((investigation) =>
      matches(
        needle,
        investigation.name,
        investigation.projectName,
        investigation.status,
      ),
    ),
    findings: dashboard.recentFindings.filter((finding) =>
      matches(
        needle,
        finding.title,
        finding.projectName,
        finding.severity,
        finding.status,
      ),
    ),
  };
}

function matches(needle: string, ...values: Array<string | undefined>) {
  return values.some((value) => value?.toLocaleLowerCase().includes(needle));
}
