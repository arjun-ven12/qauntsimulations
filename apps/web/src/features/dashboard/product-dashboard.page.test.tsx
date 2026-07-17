import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/auth.store.js';
import type { DashboardDataResult } from './dashboard.data.js';
import { DashboardResult, ProductDashboardPage } from './product-dashboard.page.js';

describe('routed Product Dashboard page', () => {
  afterEach(() => {
    useAuthStore.setState({ organisation: null });
  });

  it('renders the current organisation and real mapped Project data from its organisation cache', () => {
    const organisation = {
      id: 'org-current',
      name: 'Current Organisation',
      slug: 'current',
      role: 'OWNER' as const,
    };
    useAuthStore.setState({ organisation });
    const result: DashboardDataResult = {
      data: {
        organisation,
        projects: [
          {
            id: 'project-current',
            name: 'Current Project',
            safetyConfigured: true,
            readyEnvironmentCount: 1,
            totalEnvironmentCount: 1,
            readyJourneyCount: 1,
            totalJourneyCount: 1,
            readyInvariantCount: 1,
            totalInvariantCount: 1,
            recentInvestigationCount: 0,
            openFindingCount: 0,
          },
        ],
        recentInvestigations: [],
        recentFindings: [],
      },
      configurationWarnings: [],
      findingsAvailable: false,
      investigationsAvailable: false,
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DashboardResult canCreateProject result={result} />
      </MemoryRouter>,
    );
    expect(html).toContain('Current Organisation');
    expect(html).toContain('Current Project');
    expect(html).toContain('Recent Investigations unavailable');
    expect(html).not.toContain('TaskOS Demo');
    expect(html).not.toContain('project_demo_checkout');
  });

  it('shows an organisation-safe loading state before current data is available', () => {
    useAuthStore.setState({
      organisation: { id: 'org-new', name: 'New Organisation', slug: 'new', role: 'OWNER' },
    });
    const html = render(new QueryClient());
    expect(html).toContain('Loading Dashboard');
    expect(html).not.toContain('Current Organisation');
    expect(html).not.toContain('Current Project');
  });
});

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
