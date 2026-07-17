import type { DashboardData } from './dashboard.types.js';

export const seededDemoDashboardData: DashboardData = {
  organisation: {
    id: 'organisation_demo_taskos',
    name: 'TaskOS Demo',
    role: 'OWNER',
  },
  projects: [
    {
      id: 'project_demo_checkout',
      name: 'Checkout Reliability Lab',
      description:
        'A deterministic checkout target for validating payment and order reliability.',
      isPrimaryDemo: true,
      safetyConfigured: true,
      readyEnvironmentCount: 1,
      totalEnvironmentCount: 1,
      readyJourneyCount: 1,
      totalJourneyCount: 1,
      readyInvariantCount: 2,
      totalInvariantCount: 2,
      recentInvestigationCount: 0,
      openFindingCount: 0,
      updatedAt: '2026-07-17T00:00:00.000Z',
    },
  ],
  recentInvestigations: [],
  recentFindings: [],
};
