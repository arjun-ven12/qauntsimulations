import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/auth.store.js';
import { ScenarioApiError, type ScenarioPreflightResult } from './scenario-api.js';
import { ScenarioCreatePage } from './scenario-create.page.js';
import { ScenarioForm } from './scenario-form.js';
import { ScenarioPresetSelector } from './scenario-preset-selector.js';
import { defaultScenarioPresetId } from './scenario-presets.js';
import { ScenarioPreflightResults } from './scenario-preflight-results.js';
import { environment, invariant, journey, validScenario } from './scenario-test-fixtures.js';

describe('Scenario frontend', () => {
  afterEach(() => useAuthStore.setState({ organisation: null, permissions: [] }));

  it('renders persisted Environment, Journey, and Invariant selectors with exact evaluator labels', () => {
    const html = renderForm();
    expect(html).toContain('Checkout staging');
    expect(html).toContain('Checkout journey');
    expect(html).toContain('2 executable steps');
    expect(html).toContain('NO_DUPLICATE_PAYMENT');
    expect(html).toContain('NO_DUPLICATE_ORDER');
    expect(html).toContain('invariant-payment');
    expect(html).toContain('invariant-order');
  });

  it('renders prompt input and only the five supported control areas', () => {
    const html = renderForm();
    expect(html).toContain('Investigation objective');
    expect(html).toContain(validScenario().scenario.prompt);
    expect(html).toContain('Browsers');
    expect(html).toContain('Viewports');
    expect(html).toContain('Network profiles');
    expect(html).toContain('Maximum initial worlds');
    expect(html).toContain('Adaptive reproduction and minimisation may add additional worlds.');
    expect(html).toContain('Maximum concurrent workers');
    expect(html).not.toContain('Maximum compute');
    expect(html).not.toContain('JSON editor');
  });

  it('renders four Scenario built-ins through the shared Templates system', () => {
    const html = renderForm();
    expect(html).toContain('Templates');
    expect(html).toContain('Healthy Checkout Baseline');
    expect(html).toContain('Delayed Payment Double Submission');
    expect(html).toContain('Mobile Checkout Under Slow Network');
    expect(html).toContain('Payment Timeout and Retry');
    expect(html).toContain('Built-in');
    expect(html).toContain('Apply template');
    expect(html).toContain('Save current');
  });

  it('renders unavailable recommended Invariants as a non-blocking status message', () => {
    const html = renderToStaticMarkup(
      <ScenarioPresetSelector
        appliedPresetId={defaultScenarioPresetId}
        customised={false}
        onApply={() => undefined}
        onSelect={() => undefined}
        selectedPresetId={defaultScenarioPresetId}
        unavailableInvariantTypes={['NO_DUPLICATE_ORDER']}
      />,
    );
    expect(html).toContain('Unavailable recommended Invariants were left unselected');
    expect(html).toContain('NO_DUPLICATE_ORDER');
    expect(html).toContain('role="status"');
  });

  it('shows disabled and non-READY Invariants as unavailable rather than selectable', () => {
    const html = renderForm([
      invariant('disabled', 'NO_DUPLICATE_PAYMENT', { enabled: false }),
      invariant('invalid', 'NO_DUPLICATE_ORDER', { validationStatus: 'INVALID' }),
    ]);
    expect(html.match(/Not selectable for launch/g)).toHaveLength(2);
    expect(html).toContain('Disabled');
    expect(html).toContain('INVALID');
  });

  it('has no fixture Journey or Invariant fallback when persisted lists are empty', () => {
    const html = renderToStaticMarkup(
      <ScenarioForm
        environments={[environment()]}
        initial={{ ...validScenario(), journeyId: '', invariantIds: [] }}
        invariants={[]}
        journeys={[]}
        onLaunch={async () => undefined}
        onPreflight={async () => readyResult()}
      />,
    );
    expect(html).not.toContain('Complete checkout');
    expect(html).not.toContain('Single checkout submission');
  });

  it('displays READY passed checks and backend warnings', () => {
    const html = renderToStaticMarkup(
      <ScenarioPreflightResults
        error={null}
        result={readyResult({
          status: 'READY',
          warnings: [
            {
              code: 'LIMIT_REDUCED',
              field: 'scenario.controls.maximumWorlds',
              message: 'Planner limit is lower than requested.',
              blocking: false,
            },
          ],
        })}
      />,
    );
    expect(html).toContain('Preflight READY');
    expect(html).toContain('Passed checks');
    expect(html).toContain('LIMIT_REDUCED');
    expect(html).toContain('Planner limit is lower than requested.');
  });

  it('displays blocking failures with the exact backend code and message', () => {
    const html = renderToStaticMarkup(
      <ScenarioPreflightResults
        error={
          new ScenarioApiError('Journey must be enabled before launch', 422, 'JOURNEY_DISABLED')
        }
        result={null}
      />,
    );
    expect(html).toContain('Preflight blocked');
    expect(html).toContain('JOURNEY_DISABLED');
    expect(html).toContain('Journey must be enabled before launch');
  });

  it('renders the loading and Viewer read-only page states', () => {
    expect(renderPage(queryClient())).toContain('Loading persisted launch configuration');
    setRole('VIEWER');
    const client = configuredClient();
    const html = renderPage(client);
    expect(html).toContain('Read-only Scenario access');
    expect(html).toContain('Viewer access is read-only');
  });

  it.each(['1440 × 900', '768 × 1024', '390 × 844'])(
    'uses wrapping and stacked rendered structures for %s',
    () => {
      const html = renderForm();
      expect(html).toContain('min-w-0');
      expect(html).toContain('flex-wrap');
      expect(html).toContain('lg:grid-cols-2');
      expect(html).toContain('min-h-40');
      expect(html).not.toMatch(/min-w-\[[0-9]/);
    },
  );
});

function renderForm(
  extraInvariants = [
    invariant('invariant-payment', 'NO_DUPLICATE_PAYMENT'),
    invariant('invariant-order', 'NO_DUPLICATE_ORDER'),
  ],
) {
  return renderToStaticMarkup(
    <ScenarioForm
      environments={[environment()]}
      initial={validScenario()}
      invariants={extraInvariants}
      journeys={[journey()]}
      onLaunch={async () => undefined}
      onPreflight={async () => readyResult()}
    />,
  );
}

function readyResult(
  validation: ScenarioPreflightResult['validation'] = { status: 'READY', warnings: [] },
): ScenarioPreflightResult {
  return {
    status: 'READY',
    projectId: 'project-1',
    environmentId: 'environment-1',
    journeyId: 'journey-1',
    invariantIds: ['invariant-payment', 'invariant-order'],
    validation,
  };
}

function renderPage(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects/project-1/investigations/new']}>
        <Routes>
          <Route path="/projects/:projectId/investigations/new" element={<ScenarioCreatePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function configuredClient() {
  const client = queryClient();
  client.setQueryData(['environments', 'project-1'], [environment()]);
  client.setQueryData(['journeys', 'project-1'], [journey()]);
  client.setQueryData(
    ['invariants', 'project-1'],
    [invariant('invariant-payment', 'NO_DUPLICATE_PAYMENT')],
  );
  return client;
}

function setRole(role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') {
  useAuthStore.setState({
    organisation: { id: 'org-1', name: 'Organisation', slug: 'organisation', role },
  });
}
