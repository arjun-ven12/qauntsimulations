import { describe, expect, it } from 'vitest';
import { seededDemoDashboardData } from './dashboard.fixtures.js';
import { createDashboardViewModel, projectView } from './dashboard.model.js';

describe('Product Dashboard view model', () => {
  it('prioritises the seeded Checkout Reliability Lab as the primary READY Project', () => {
    const dashboard = createDashboardViewModel(seededDemoDashboardData);
    expect(dashboard.primaryProject).toMatchObject({
      ready: true,
      readinessScore: 100,
      project: {
        id: 'project_demo_checkout',
        name: 'Checkout Reliability Lab',
        isPrimaryDemo: true,
      },
      startInvestigationHref: '/projects/project_demo_checkout/investigations/new',
      continueSetupHref: '/projects/project_demo_checkout',
    });
    expect(dashboard.totals).toEqual({
      projectCount: 1,
      readyProjectCount: 1,
      recentInvestigationCount: 0,
      openFindingCount: 0,
    });
  });

  it('uses the first incomplete onboarding destination for Continue Setup', () => {
    const project = projectView({
      id: 'project-partial',
      name: 'Partial Project',
      safetyConfigured: true,
      readyEnvironmentCount: 1,
      totalEnvironmentCount: 2,
      readyJourneyCount: 0,
      totalJourneyCount: 1,
      readyInvariantCount: 0,
      totalInvariantCount: 2,
      recentInvestigationCount: 0,
      openFindingCount: 0,
    });
    expect(project.ready).toBe(false);
    expect(project.readinessScore).toBe(50);
    expect(project.continueSetupHref).toBe('/projects/project-partial/journeys');
  });

  it('sorts the primary Project first and recent activity newest first', () => {
    const dashboard = createDashboardViewModel({
      organisation: { id: 'org-1', name: 'Organisation', role: 'ADMIN' },
      projects: [
        project('ordinary', 'Ordinary', false, '2026-07-19T00:00:00.000Z'),
        project('demo', 'Demo', true, '2026-07-17T00:00:00.000Z'),
      ],
      recentInvestigations: [
        investigation('older', '2026-07-17T00:00:00.000Z'),
        investigation('newer', '2026-07-18T00:00:00.000Z'),
      ],
      recentFindings: [
        finding('older', '2026-07-17T00:00:00.000Z'),
        finding('newer', '2026-07-18T00:00:00.000Z'),
      ],
    });
    expect(dashboard.projects.map(({ project }) => project.id)).toEqual(['demo', 'ordinary']);
    expect(dashboard.recentInvestigations.map((item) => item.id)).toEqual(['newer', 'older']);
    expect(dashboard.recentFindings.map((item) => item.id)).toEqual(['newer', 'older']);
  });
});

function project(id: string, name: string, isPrimaryDemo: boolean, updatedAt: string) {
  return {
    id,
    name,
    isPrimaryDemo,
    safetyConfigured: true,
    readyEnvironmentCount: 1,
    totalEnvironmentCount: 1,
    readyJourneyCount: 1,
    totalJourneyCount: 1,
    readyInvariantCount: 1,
    totalInvariantCount: 1,
    recentInvestigationCount: 1,
    openFindingCount: 1,
    updatedAt,
  };
}

function investigation(id: string, createdAt: string) {
  return {
    id,
    projectId: 'project-1',
    projectName: 'Project',
    name: `Investigation ${id}`,
    status: 'RUNNING',
    createdAt,
  };
}

function finding(id: string, createdAt: string) {
  return {
    id,
    projectId: 'project-1',
    projectName: 'Project',
    title: `Finding ${id}`,
    severity: 'HIGH',
    status: 'OPEN',
    createdAt,
  };
}
