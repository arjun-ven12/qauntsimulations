import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { seededDemoDashboardData } from './dashboard.fixtures.js';
import { ProductDashboard } from './product-dashboard.js';
import type { DashboardData } from './dashboard.types.js';

describe('isolated Product Dashboard', () => {
  it('renders organisation, primary demo Project, readiness, onboarding, and Product actions', () => {
    const html = render(seededDemoDashboardData);
    expect(html).toContain('Rift Demo');
    expect(html).toContain('OWNER');
    expect(html).toContain('Checkout Reliability Lab');
    expect(html).toContain('Primary demo');
    expect(html).toContain('Configuration readiness');
    expect(html).toContain('Project ready for investigation');
    expect(html).toContain('4 of 4 readiness steps complete');
    expect(html).toContain('Start Investigation');
    expect(html).not.toContain('Continue Setup');
    expect(html).toContain('/projects/project_demo_checkout/investigations/new');
    expect(html).toContain('1/1 READY');
    expect(html).toContain('2/2 READY');
  });

  it('renders honest empty states without fabricating runtime history', () => {
    const html = render(seededDemoDashboardData);
    expect(html).toContain('No Investigations yet');
    expect(html).toContain('No Findings yet');
    expect(html).not.toContain('COMPLETED');
    expect(html).not.toContain('Duplicate checkout submission under delayed payment');
  });

  it('keeps Investigation lifecycle and Finding business status presentation separate', () => {
    const data: DashboardData = {
      ...seededDemoDashboardData,
      projects: [
        {
          ...seededDemoDashboardData.projects[0]!,
          recentInvestigationCount: 1,
          openFindingCount: 1,
        },
      ],
      recentInvestigations: [
        {
          id: 'investigation-1',
          projectId: 'project_demo_checkout',
          projectName: 'Checkout Reliability Lab',
          status: 'RUNNING',
          worldCount: 4,
          findingCount: 1,
          createdAt: '2026-07-18T00:00:00.000Z',
        },
      ],
      recentFindings: [
        {
          id: 'finding-1',
          projectId: 'project_demo_checkout',
          projectName: 'Checkout Reliability Lab',
          title: 'Duplicate payment request',
          severity: 'CRITICAL',
          status: 'OPEN',
          createdAt: '2026-07-18T00:00:00.000Z',
          href: '/investigations/investigation-1/findings/finding-1',
        },
      ],
    };
    const html = render(data);
    expect(html).toContain('RUNNING');
    expect(html).toContain('4 worlds');
    expect(html).toContain('1 finding');
    expect(html).toContain('Duplicate payment request');
    expect(html).toContain('CRITICAL');
    expect(html).toContain('OPEN');
    expect(html).toContain('/investigations/investigation-1/findings/finding-1');
  });

  it('renders a first-Project empty state when Product data is empty', () => {
    const html = render({
      organisation: { id: 'org-empty', name: 'Empty Organisation', role: 'OWNER' },
      projects: [],
      recentInvestigations: [],
      recentFindings: [],
    });
    expect(html).toContain('No Projects yet');
    expect(html).toContain('Create your first Project');
    expect(html).toContain('/projects/new');
  });

  it('does not give Rift Demo Commerce seeded primary-demo treatment', () => {
    const html = render({
      ...seededDemoDashboardData,
      projects: [
        {
          ...seededDemoDashboardData.projects[0]!,
          id: 'project-commerce',
          name: 'Rift Demo Commerce',
          isPrimaryDemo: false,
        },
      ],
    });
    expect(html).toContain('Featured Project');
    expect(html).not.toContain('Primary demo');
    expect(html).not.toContain('data-testid="primary-demo-project"');
    expect(html).toContain('data-testid="featured-project"');
  });

  it('retains seeded primary-demo treatment for Checkout Reliability Lab', () => {
    const html = render(seededDemoDashboardData);
    expect(html).toContain('Checkout Reliability Lab');
    expect(html).toContain('Primary demo');
    expect(html).toContain('data-testid="primary-demo-project"');
  });

  it('shows Create Project actions for an OWNER with CREATE_PROJECTS permission', () => {
    const html = render(emptyDashboard('OWNER'), { canCreateProject: true });
    expect(html).toContain('Create Project');
    expect(html).toContain('Create your first Project');
    expect(html).toContain('/projects/new');
  });

  it('matches current Product rules by allowing a MEMBER with CREATE_PROJECTS permission', () => {
    const html = render(emptyDashboard('MEMBER'), { canCreateProject: true });
    expect(html).toContain('Create Project');
    expect(html).toContain('Create your first Project');
  });

  it('shows a permission-aware empty state without creation links when permission is absent', () => {
    const html = render(emptyDashboard('VIEWER'), { canCreateProject: false });
    expect(html).toContain('view Projects but not create them');
    expect(html).not.toContain('Create Project');
    expect(html).not.toContain('/projects/new');
  });

  it('offers Continue Setup instead of Start Investigation for an incomplete Project', () => {
    const html = render({
      ...seededDemoDashboardData,
      projects: [
        {
          ...seededDemoDashboardData.projects[0]!,
          readyJourneyCount: 0,
        },
      ],
    });
    expect(html).toContain('Continue Setup');
    expect(html).toContain('/projects/project_demo_checkout/journeys');
    expect(html).not.toContain('Start Investigation');
  });

  it('renders honest unavailable states when aggregate runtime APIs do not exist', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ProductDashboard
          activityAvailability={{ findings: 'unavailable', investigations: 'unavailable' }}
          data={seededDemoDashboardData}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('Recent Investigations unavailable');
    expect(html).toContain('Recent Findings unavailable');
    expect(html).not.toContain('No Investigations yet');
  });

  it.each(['desktop', 'tablet', 'mobile'])(
    'uses wrapping and responsive grids for %s presentation',
    () => {
      const html = render(seededDemoDashboardData);
      expect(html).toContain('min-w-0');
      expect(html).toContain('flex-wrap');
      expect(html).toContain('sm:grid-cols-2');
      expect(html).toContain('xl:grid-cols-2');
      expect(html).not.toMatch(/min-w-\[[0-9]/);
    },
  );
});

function emptyDashboard(role: string): DashboardData {
  return {
    organisation: { id: 'org-empty', name: 'Empty Organisation', role },
    projects: [],
    recentInvestigations: [],
    recentFindings: [],
  };
}

function render(
  data: DashboardData,
  props: { canCreateProject?: boolean } = {},
) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ProductDashboard data={data} {...props} />
    </MemoryRouter>,
  );
}
