import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { seededDemoDashboardData } from './dashboard.fixtures.js';
import { ProductDashboard } from './product-dashboard.js';
import type { DashboardData } from './dashboard.types.js';

describe('Rift operational dashboard', () => {
  it('renders the approved operational hierarchy without legacy dashboard panels', () => {
    const html = render(seededDemoDashboardData);

    expect(html).toContain('Operational view for investigations, findings, and release readiness.');
    expect(html).toContain('Current investigation');
    expect(html).toContain('Needs attention');
    expect(html).toContain('Recent investigations');
    expect(html).toContain('Project readiness');
    expect(html).toContain('Recent findings');
    expect(html).toContain('Investigation');
    expect(html).toContain('Ready projects');
    expect(html).not.toContain('Active organisation');
    expect(html).not.toContain('Featured Project');
    expect(html).not.toContain('Configuration readiness');
    expect(html).not.toContain('Primary demo');
    expect(html).not.toContain('Rift Demo Commerce');
  });

  it('uses real running investigation and finding data for the primary operational questions', () => {
    const html = render({
      ...seededDemoDashboardData,
      projects: [{ ...seededDemoDashboardData.projects[0]!, recentInvestigationCount: 1, openFindingCount: 1 }],
      recentInvestigations: [{ id: 'investigation-1', projectId: 'project_demo_checkout', projectName: 'Checkout Reliability Lab', name: 'Delayed payment checkout', status: 'RUNNING', worldCount: 4, findingCount: 1, createdAt: '2026-07-18T00:00:00.000Z' }],
      recentFindings: [{ id: 'finding-1', investigationId: 'investigation-1', projectId: 'project_demo_checkout', projectName: 'Checkout Reliability Lab', title: 'Duplicate payment request', severity: 'CRITICAL', status: 'OPEN', createdAt: '2026-07-18T00:00:00.000Z' }],
    });

    expect(html).toContain('Delayed payment checkout');
    expect(html).toContain('Running');
    expect(html).toContain('4 worlds');
    expect(html).toContain('Duplicate payment request');
    expect(html).toContain('Critical · Open');
    expect(html).toContain('/investigations/investigation-1/findings/finding-1');
  });

  it('uses one next action and changes it to setup when the primary Project is incomplete', () => {
    const html = render({ ...seededDemoDashboardData, projects: [{ ...seededDemoDashboardData.projects[0]!, readyJourneyCount: 0 }] });

    expect(html).toContain('Continue setup');
    expect(html).toContain('/projects/project_demo_checkout/journeys');
    expect(html).not.toContain('Start investigation');
  });

  it('places a truthful execution overview between project readiness and recent findings', () => {
    const html = render({
      ...seededDemoDashboardData,
      recentInvestigations: [
        { id: 'completed', projectId: 'project_demo_checkout', projectName: 'Checkout Reliability Lab', status: 'COMPLETED', worldCount: 8, createdAt: '2026-07-18T00:00:00.000Z' },
        { id: 'failed', projectId: 'project_demo_checkout', projectName: 'Checkout Reliability Lab', status: 'FAILED', worldCount: 5, createdAt: '2026-07-17T00:00:00.000Z' },
      ],
      recentFindings: [
        { id: 'finding-open', projectId: 'project_demo_checkout', projectName: 'Checkout Reliability Lab', title: 'Open risk', severity: 'HIGH', status: 'OPEN', createdAt: '2026-07-18T00:00:00.000Z' },
      ],
    });

    const overviewPosition = html.indexOf('Execution overview');
    expect(overviewPosition).toBeGreaterThan(html.indexOf('Project readiness'));
    expect(overviewPosition).toBeLessThan(html.lastIndexOf('Recent findings'));
    expect(html).toContain('Worlds executed across recent investigations');
    expect(html).toContain('Completion rate');
    expect(html).toContain('50%');
    expect(html).toContain('Open findings');
    expect(html).toContain('Repairs verified');
    expect(html).toContain('Not available in this view');
  });

  it('uses an em dash for execution metrics that the routed dashboard cannot know', () => {
    const html = render(seededDemoDashboardData);

    expect(html).toContain('World execution volume is not available for recent investigations.');
    expect(html).toContain('No concluded investigations');
    expect(html).toContain('Repairs verified');
  });

  it('keeps activity failures subtle and does not fabricate records', () => {
    const html = render(seededDemoDashboardData, { activityAvailability: { investigations: 'unavailable', findings: 'unavailable' } });

    expect(html).toContain('Activity is temporarily unavailable.');
    expect(html).not.toContain('Recent Investigations unavailable');
    expect(html).not.toContain('No Investigations yet');
  });

  it('keeps creation permission-aware for an empty organisation', () => {
    const data: DashboardData = { organisation: { id: 'org-empty', name: 'Empty Organisation', role: 'VIEWER' }, projects: [], recentInvestigations: [], recentFindings: [] };
    const html = render(data, { canCreateProject: false });

    expect(html).toContain('No investigation running');
    expect(html).toContain('Create a Project to establish a safe investigation boundary.');
    expect(html).not.toContain('Create project');
  });

  it('uses responsive, non-nested operational sections', () => {
    const html = render(seededDemoDashboardData);
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]');
    expect(html).toContain('rift-surface rounded-xl');
    expect(html).not.toContain('bg-gradient');
    expect(html).not.toContain('text-cyan');
  });
});

function render(data: DashboardData, props: { canCreateProject?: boolean; activityAvailability?: { investigations: 'available' | 'unavailable'; findings: 'available' | 'unavailable' } } = {}) {
  return renderToStaticMarkup(<MemoryRouter><ProductDashboard data={data} {...props} /></MemoryRouter>);
}
