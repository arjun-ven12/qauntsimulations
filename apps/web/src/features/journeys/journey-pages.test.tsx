import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { Environment } from '../../services/environment-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import type { Journey } from './journey-api.js';
import { JourneyForm } from './journey-form.js';
import { checkoutTemplate } from './journey-form.model.js';
import { JourneyOverviewPage } from './journey-overview.page.js';
import { JourneySettingsPage } from './journey-settings.page.js';
import { JourneysPage } from './journeys.page.js';
import { NewJourneyPage } from './new-journey.page.js';

describe('Journey frontend pages', () => {
  afterEach(() => {
    useAuthStore.setState({ organisation: null, permissions: [] });
  });

  it('renders the Journey list loading state', () => {
    const html = renderPage(<JourneysPage />, '/projects/project-1/journeys');
    expect(html).toContain('Loading Journeys');
  });

  it('renders the Journey list empty state', () => {
    const client = queryClient();
    client.setQueryData(['journeys', 'project-1'], []);
    client.setQueryData(['environments', 'project-1'], []);
    const html = renderPage(<JourneysPage />, '/projects/project-1/journeys', client);
    expect(html).toContain('No Journeys yet');
  });

  it('renders New Journey and the shared form for an Owner', () => {
    setRole('OWNER');
    const client = queryClient();
    client.setQueryData(['environments', 'project-1'], [environment()]);
    const html = renderPage(<NewJourneyPage />, '/projects/project-1/journeys/new', client);
    expect(html).toContain('New Journey');
    expect(html).toContain('Ordered steps');
    expect(html).toContain('Completion condition');
    expect(html).toContain('Execution path');
    expect(html).toContain('Validation and review');
  });

  it('renders Settings with persisted Journey values', () => {
    setRole('ADMIN');
    const client = queryClient();
    client.setQueryData(['journey', 'project-1', 'journey-1'], journey());
    client.setQueryData(['environments', 'project-1'], [environment()]);
    const html = renderPage(
      <JourneySettingsPage />,
      '/projects/project-1/journeys/journey-1/settings',
      client,
    );
    expect(html).toContain('Journey Settings');
    expect(html).toContain('Checkout Purchase Flow');
    expect(html).toContain('customer@example.test');
  });

  it('renders the Journey overview as one human-readable execution path', () => {
    setRole('OWNER');
    const client = queryClient();
    client.setQueryData(['journey', 'project-1', 'journey-1'], journey());
    client.setQueryData(['environments', 'project-1'], [environment()]);
    const html = renderPage(
      <JourneyOverviewPage />,
      '/projects/project-1/journeys/journey-1',
      client,
    );
    expect(html).toContain('Execution path');
    expect(html).toContain('Open application');
    expect(html).toContain('Verify completion');
    expect(html).toContain('Journey execution path');
    expect(html).not.toContain('Execution graph');
  });

  it.each(['MEMBER', 'VIEWER'] as const)('renders a clear read-only %s experience', (role) => {
    setRole(role);
    const client = queryClient();
    client.setQueryData(['journey', 'project-1', 'journey-1'], journey());
    client.setQueryData(['environments', 'project-1'], [environment()]);
    const html = renderPage(
      <JourneySettingsPage />,
      '/projects/project-1/journeys/journey-1/settings',
      client,
    );
    expect(html).toContain('read-only Journey access');
    expect(html).not.toContain('Save Journey');
  });

  it('uses responsive stacked layouts without fixed-width step cards', () => {
    const client = queryClient();
    client.setQueryData(['environments', 'project-1'], [environment()]);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <JourneyForm
          initial={checkoutTemplate('environment-1')}
          onSubmit={() => undefined}
          pending={false}
          projectId="project-1"
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('min-w-0');
    expect(html).toContain('md:grid-cols-2');
    expect(html).toContain('sm:grid-cols-3');
    expect(html).not.toMatch(/min-w-\[[0-9]/);
  });
});

function renderPage(element: React.ReactNode, location: string, client = queryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[location]}>
        <Routes>
          <Route path="/projects/:projectId/journeys" element={element} />
          <Route path="/projects/:projectId/journeys/new" element={element} />
          <Route path="/projects/:projectId/journeys/:journeyId" element={element} />
          <Route path="/projects/:projectId/journeys/:journeyId/settings" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function setRole(role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') {
  useAuthStore.setState({
    organisation: { id: 'org-1', name: 'Organisation', slug: 'organisation', role },
  });
}

function environment(): Environment {
  return {
    id: 'environment-1',
    projectId: 'project-1',
    name: 'Staging',
    description: null,
    type: 'STAGING',
    baseUrl: 'https://staging.example.com',
    apiBaseUrl: null,
    healthCheckUrl: null,
    isDefault: true,
    validationStatus: 'READY',
    lastValidatedAt: null,
    featureFlags: [],
    paymentConfiguration: {
      mode: 'MOCK',
      delayMs: 0,
      result: 'SUCCESS',
      retryEnabled: false,
      maxRetries: 0,
    },
    resetConfiguration: {
      mode: 'NONE',
      endpoint: null,
      method: 'POST',
      credentialReference: null,
      timeoutMs: 30_000,
      expectedStatus: 200,
      beforeEachWorld: false,
      afterEachWorld: false,
      procedure: null,
      scriptReference: null,
    },
    testDataConfiguration: {
      customerCredentialReference: null,
      productIdentifier: 'test-product',
      initialInventory: 10,
      seedProfile: null,
      orderCleanup: null,
      isolation: 'RESET_BEFORE_WORLD',
    },
    credentialReferences: [],
    allowedActions: [],
    validationResults: [],
    configuration: {
      featureFlagEndpoint: null,
      featureFlagMethod: 'GET',
      featureFlags: [],
      payment: {
        mode: 'MOCK',
        delayMs: 0,
        result: 'SUCCESS',
        retryEnabled: false,
        maxRetries: 0,
      },
      reset: {
        mode: 'NONE',
        endpoint: null,
        method: 'POST',
        credentialReference: null,
        timeoutMs: 30_000,
        expectedStatus: 200,
        beforeEachWorld: false,
        afterEachWorld: false,
        procedure: null,
        scriptReference: null,
      },
      testData: {
        customerCredentialReference: null,
        productIdentifier: 'test-product',
        initialInventory: 10,
        seedProfile: null,
        orderCleanup: null,
        isolation: 'RESET_BEFORE_WORLD',
      },
      credentialReferences: [],
      allowedActions: [],
      validationResults: [],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function journey(): Journey {
  const input = checkoutTemplate('environment-1');
  return {
    ...input,
    id: 'journey-1',
    projectId: 'project-1',
    validationStatus: 'READY',
    steps: input.steps.map(({ clientId: _clientId, ...step }, index) => ({
      ...step,
      id: `step-${index + 1}`,
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
