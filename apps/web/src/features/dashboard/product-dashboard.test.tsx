import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { seededDemoDashboardData } from './dashboard.fixtures.js';
import { ProductDashboard } from './product-dashboard.js';
import type { DashboardData } from './dashboard.types.js';

describe('Rift operational dashboard', () => {
  it('uses the approved operational hierarchy without an organisation label above the title', () => {
    const html = render(seededDemoDashboardData);

    expect(html).toContain('Dashboard');
    expect(html).toContain('Start investigation');
    expect(html).toContain('Active investigations');
    expect(html).toContain('Recent investigations');
    expect(html).toContain('Open findings');
    expect(html).toContain('Ready projects');
    expect(html).toContain('Current investigation');
    expect(html).toContain('Needs attention');
    expect(html).toContain('Project readiness');
    expect(html).toContain('Recent findings');
    expect(html).not.toContain('Rift Demo');
    expect(html).not.toContain('Search activity');
  });

  it('uses active work when present and otherwise shows the latest record as current', () => {
    const html = render({
      ...seededDemoDashboardData,
      recentInvestigations: [
        investigation('failed', 'FAILED', 'Verify a checkout flow with a long prompt that must not become the heading'),
        investigation('running', 'RUNNING', 'Delayed payment verification'),
      ],
    });

    expect(html).toContain('>Current investigation</p>');
    expect(html).toContain('Delayed payment verification');
    expect(html).toContain('Investigation timeline');
    expect(html).not.toContain('Verify a checkout flow with a long prompt');

    const terminalOnly = render({ ...seededDemoDashboardData, recentInvestigations: [investigation('failed', 'FAILED', 'Completed checkout review')] });
    expect(terminalOnly).toContain('Current investigation');
    expect(terminalOnly).toContain('Completed checkout review');
  });

  it('renders recent investigations and findings as compact tables with safe display names', () => {
    const html = render({
      ...seededDemoDashboardData,
      projects: [{ ...seededDemoDashboardData.projects[0]!, name: 'TaskOS Demo Commerce' }],
      recentInvestigations: [
        { ...investigation('investigation-1', 'RUNNING', 'Test the checkout flow under delayed payment responses and repeated user interaction.'), projectName: 'TaskOS Demo Commerce' },
      ],
      recentFindings: [{ id: 'finding-1', investigationId: 'investigation-1', projectId: 'project_demo_checkout', projectName: 'TaskOS Demo Commerce', title: 'Duplicate payment request', severity: 'CRITICAL', status: 'OPEN', createdAt: '2026-07-18T00:00:00.000Z' }],
    });

    expect(html).toContain('<table');
    expect(html).toContain('Investigation</th>');
    expect(html).toContain('Finding</th>');
    expect(html).toContain('Checkout Reliability Lab');
    expect(html).not.toContain('TaskOS Demo Commerce');
    expect(html).not.toContain('world count unavailable');
  });

  it('does not add an alternative execution section outside the approved hierarchy', () => {
    expect(render(seededDemoDashboardData)).not.toContain('Execution overview');
  });

  it('keeps creation permission-aware for an empty organisation', () => {
    const data: DashboardData = { organisation: { id: 'org-empty', name: 'Empty Organisation', role: 'VIEWER' }, projects: [], recentInvestigations: [], recentFindings: [] };
    const html = render(data, { canCreateProject: false });

    expect(html).toContain('No investigation running');
    expect(html).toContain('No Project configuration is available yet.');
    expect(html).not.toContain('Create project');
  });

  it('keeps the dashboard monochrome, compact, and responsive', () => {
    const html = render(seededDemoDashboardData);
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]');
    expect(html).toContain('rift-surface h-full rounded-xl');
    expect(html).not.toContain('bg-gradient');
    expect(html).not.toContain('bg-cyan');
  });
});

function investigation(id: string, status: string, name: string) {
  return {
    id,
    projectId: 'project_demo_checkout',
    projectName: 'Checkout Reliability Lab',
    name,
    status,
    createdAt: '2026-07-18T00:00:00.000Z',
  };
}

function render(data: DashboardData, props: { canCreateProject?: boolean; activityAvailability?: { investigations: 'available' | 'unavailable'; findings: 'available' | 'unavailable' } } = {}) {
  return renderToStaticMarkup(<MemoryRouter><ProductDashboard data={data} {...props} /></MemoryRouter>);
}
