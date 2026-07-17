import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/auth.store.js';
import type { Invariant, InvariantValidationResult } from './invariant-api.js';
import { InvariantForm } from './invariant-form.js';
import { invariantTemplates, templateValue } from './invariant-form.model.js';
import { InvariantSettingsPage } from './invariant-settings.page.js';
import { InvariantValidationPanel } from './invariant-structured-preview.js';
import { InvariantsPage } from './invariants.page.js';
import { NewInvariantPage } from './new-invariant.page.js';

describe('Invariant frontend pages', () => {
  afterEach(() => {
    useAuthStore.setState({ organisation: null, permissions: [] });
  });

  it('renders the list loading state', () => {
    const html = renderPage(<InvariantsPage />, '/projects/project-1/invariants');
    expect(html).toContain('Loading Invariants');
  });

  it('renders the empty list state', () => {
    const client = queryClient();
    client.setQueryData(['invariants', 'project-1'], []);
    const html = renderPage(<InvariantsPage />, '/projects/project-1/invariants', client);
    expect(html).toContain('No Invariants yet');
  });

  it('renders the list API error state', () => {
    const client = queryClient();
    const error = new Error('Invariant service unavailable');
    client.getQueryCache().build(
      client,
      { queryKey: ['invariants', 'project-1'] },
      {
        data: undefined,
        dataUpdateCount: 0,
        dataUpdatedAt: 0,
        error,
        errorUpdateCount: 1,
        errorUpdatedAt: Date.now(),
        fetchFailureCount: 1,
        fetchFailureReason: error,
        fetchMeta: null,
        isInvalidated: false,
        status: 'error',
        fetchStatus: 'idle',
      },
    );
    const html = renderPage(<InvariantsPage />, '/projects/project-1/invariants', client);
    expect(html).toContain('Invariants could not be loaded');
    expect(html).toContain('Invariant service unavailable');
  });

  it('renders New Invariant with both exact templates and structured preview', () => {
    setRole('OWNER');
    const html = renderPage(<NewInvariantPage />, '/projects/project-1/invariants/new');
    expect(html).toContain('New Invariant');
    expect(html).toContain('No duplicate payment');
    expect(html).toContain('NO_DUPLICATE_PAYMENT');
    expect(html).toContain('No duplicate order');
    expect(html).toContain('NO_DUPLICATE_ORDER');
    expect(html).toContain('Structured preview');
    expect(html).not.toContain('CUSTOM_EVALUATOR');
    expect(html).not.toContain('JSON editor');
  });

  it('renders Settings with persisted values and the shared form', () => {
    setRole('ADMIN');
    const client = queryClient();
    client.setQueryData(['invariant', 'project-1', 'invariant-1'], invariant());
    const html = renderPage(
      <InvariantSettingsPage />,
      '/projects/project-1/invariants/invariant-1/settings',
      client,
    );
    expect(html).toContain('Invariant Settings');
    expect(html).toContain('A customer must never be charged twice');
    expect(html).toContain('/api/payments');
    expect(html).toContain('Critical (CRITICAL)');
  });

  it.each(['MEMBER', 'VIEWER'] as const)('renders clear read-only %s list and settings', (role) => {
    setRole(role);
    const client = queryClient();
    client.setQueryData(['invariants', 'project-1'], [invariant()]);
    client.setQueryData(['invariant', 'project-1', 'invariant-1'], invariant());
    const listHtml = renderPage(<InvariantsPage />, '/projects/project-1/invariants', client);
    const settingsHtml = renderPage(
      <InvariantSettingsPage />,
      '/projects/project-1/invariants/invariant-1/settings',
      client,
    );
    expect(listHtml).toContain('read-only Invariant access');
    expect(listHtml).not.toContain('Duplicate');
    expect(listHtml).not.toContain('Archive');
    expect(settingsHtml).toContain('read-only Invariant access');
    expect(settingsHtml).not.toContain('Save Invariant');
  });

  it.each(['PASSED', 'WARNING', 'FAILED'] as const)('renders %s validation checks and messages', (status) => {
    const result: InvariantValidationResult = {
      status: status === 'FAILED' ? 'INVALID' : 'READY',
      checks: [{ key: 'configuration', status, message: `${status} returned message` }],
      invariant: invariant(),
    };
    const html = renderToStaticMarkup(<InvariantValidationPanel result={result} />);
    expect(html).toContain(status);
    expect(html).toContain(`${status} returned message`);
  });

  it('uses responsive wrapping and stacked template structures without fixed-width controls', () => {
    const html = renderToStaticMarkup(
      <InvariantForm
        initial={templateValue(invariantTemplates[1]!)}
        onSubmit={() => undefined}
        pending={false}
      />,
    );
    expect(html).toContain('min-w-0');
    expect(html).toContain('md:grid-cols-2');
    expect(html).toContain('lg:grid-cols-2');
    expect(html).toContain('flex-wrap');
    expect(html).not.toMatch(/min-w-\[[0-9]/);
  });
});

function renderPage(element: React.ReactNode, location: string, client = queryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[location]}>
        <Routes>
          <Route path="/projects/:projectId/invariants" element={element} />
          <Route path="/projects/:projectId/invariants/new" element={element} />
          <Route
            path="/projects/:projectId/invariants/:invariantId/settings"
            element={element}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity, refetchOnMount: false },
    },
  });
}

function setRole(role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') {
  useAuthStore.setState({
    organisation: { id: 'org-1', name: 'Organisation', slug: 'organisation', role },
  });
}

function invariant(): Invariant {
  return {
    id: 'invariant-1',
    projectId: 'project-1',
    name: 'No duplicate payment',
    description: 'A customer must never be charged twice for one checkout.',
    type: 'NO_DUPLICATE_PAYMENT',
    configuration: { requestPatterns: ['/api/payments'], methods: ['POST'] },
    severity: 'CRITICAL',
    enabled: true,
    validationStatus: 'READY',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
