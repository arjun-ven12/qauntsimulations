import { describe, expect, it } from 'vitest';
import { seededDemoDashboardData } from './dashboard.fixtures.js';
import { createDashboardViewModel } from './dashboard.model.js';
import { searchDashboard } from './dashboard-search.js';

describe('dashboard search', () => {
  it('filters real projects, investigations, and findings without new API requests', () => {
    const dashboard = createDashboardViewModel({
      ...seededDemoDashboardData,
      recentInvestigations: [{
        id: 'investigation-1',
        projectId: 'project_demo_checkout',
        projectName: 'Checkout Reliability Lab',
        name: 'Delayed payment checkout',
        status: 'RUNNING',
      }],
      recentFindings: [{
        id: 'finding-1',
        projectId: 'project_demo_checkout',
        projectName: 'Checkout Reliability Lab',
        title: 'Duplicate payment request',
        severity: 'CRITICAL',
        status: 'OPEN',
      }],
    });

    const results = searchDashboard(dashboard, 'payment');

    expect(results.projects.map(({ project }) => project.id)).toEqual(['project_demo_checkout']);
    expect(results.investigations.map(({ id }) => id)).toEqual(['investigation-1']);
    expect(results.findings.map(({ id }) => id)).toEqual(['finding-1']);
  });

  it('returns the complete routed dashboard data for an empty search', () => {
    const dashboard = createDashboardViewModel(seededDemoDashboardData);

    expect(searchDashboard(dashboard, '   ')).toEqual({
      projects: dashboard.projects,
      investigations: dashboard.recentInvestigations,
      findings: dashboard.recentFindings,
    });
  });
});
