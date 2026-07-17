export interface DashboardOrganisation {
  id: string;
  name: string;
  role: string;
}

export interface DashboardProject {
  id: string;
  name: string;
  description?: string;
  isPrimaryDemo?: boolean;
  safetyConfigured: boolean;
  readyEnvironmentCount: number;
  totalEnvironmentCount: number;
  readyJourneyCount: number;
  totalJourneyCount: number;
  readyInvariantCount: number;
  totalInvariantCount: number;
  recentInvestigationCount: number;
  openFindingCount: number;
  updatedAt?: string;
}

export interface DashboardInvestigationSummary {
  id: string;
  projectId: string;
  projectName: string;
  status: string;
  worldCount?: number;
  findingCount?: number;
  createdAt?: string;
  href?: string;
}

export interface DashboardFindingSummary {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  severity: string;
  status: string;
  createdAt?: string;
  href?: string;
}

export interface DashboardData {
  organisation: DashboardOrganisation;
  projects: DashboardProject[];
  recentInvestigations: DashboardInvestigationSummary[];
  recentFindings: DashboardFindingSummary[];
}
