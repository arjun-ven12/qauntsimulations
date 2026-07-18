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
  unavailableConfiguration?: Array<'environments' | 'journeys' | 'invariants'>;
}

export type DashboardActivityAvailability = 'available' | 'unavailable';

export interface DashboardInvestigationSummary {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  status: string;
  worldCount?: number;
  findingCount?: number;
  createdAt?: string;
  href?: string;
}

export interface DashboardFindingSummary {
  id: string;
  investigationId?: string;
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
