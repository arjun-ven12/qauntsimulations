import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExperimentPlanResponse } from '../../services/api/index.js';
import { demoPlanPreviewFixture } from './demo-plan-preview.fixture.js';
import { demoPlanPreviewEnabled, ExperimentPlanPage } from './experiment-plan.page.js';

const runtimeQueries = vi.hoisted(() => ({
  useExperimentPlan: vi.fn(),
  useInvestigationProgress: vi.fn(),
}));

vi.mock('../runtime/use-runtime-queries.js', () => runtimeQueries);

describe('ExperimentPlanPage demo preview', () => {
  beforeEach(() => {
    runtimeQueries.useExperimentPlan.mockReset();
    runtimeQueries.useInvestigationProgress.mockReset();
  });

  it('keeps demo mode off by default and requires explicit activation', () => {
    expect(demoPlanPreviewEnabled(new URLSearchParams(), {})).toBe(false);
    expect(demoPlanPreviewEnabled(new URLSearchParams('demoPlanPreview=false'), {
      VITE_DEMO_PLAN_PREVIEW_ENABLED: 'false',
    })).toBe(false);
    expect(demoPlanPreviewEnabled(new URLSearchParams('demoPlanPreview=true'), {})).toBe(true);
    expect(demoPlanPreviewEnabled(new URLSearchParams(), {
      VITE_DEMO_PLAN_PREVIEW_ENABLED: 'true',
    })).toBe(true);
  });

  it('renders an explicit frontend-only preview without calling persisted planner APIs', () => {
    const html = renderPage('/investigations/investigation-demo/plan?demoPlanPreview=true');

    expect(runtimeQueries.useInvestigationProgress).not.toHaveBeenCalled();
    expect(runtimeQueries.useExperimentPlan).not.toHaveBeenCalled();
    expect(html).toContain('DEMO PREVIEW');
    expect(html).toContain('Simulated successful ai&amp; plan');
    expect(html).toContain('Not a persisted provider result');
    expect(html).toContain('This screen uses simulated presentation data.');
    expect(html).toContain('No successful full ai&amp; plan was persisted for this preview.');
    expect(html).toContain('Exit demo preview');
    expect(html).toContain('Planned by Kimi via ai&amp;');
    expect(html).toContain('moonshotai/kimi-k2.7-code');
    expect(html).toContain('Fallback');
    expect(html).toContain('No');
    expect(html).toContain('Schema');
    expect(html).toContain('Passed');
    expect(html).toContain('Safety');
    expect(html).toContain('<strong class="text-white">4</strong> initial worlds');
    expect(html).toContain('Baseline');
    expect(html).toContain('Delayed response');
    expect(html).toContain('Repeated submission');
    expect(html).toContain('Mobile stress case');
    expect(html).toContain('Simulated 12.40s');
    expect(html).not.toContain('Kimi Verified');
    expect(html).not.toContain('API_KEY');
  });

  it('uses persisted fallback provenance in real mode instead of preview success labels', () => {
    runtimeQueries.useInvestigationProgress.mockReturnValue({
      data: { status: 'COMPLETED' },
    });
    runtimeQueries.useExperimentPlan.mockReturnValue({
      data: fallbackPlan(),
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    const html = renderPage('/investigations/investigation-real/plan');

    expect(runtimeQueries.useInvestigationProgress).toHaveBeenCalledTimes(1);
    expect(runtimeQueries.useExperimentPlan).toHaveBeenCalledTimes(1);
    expect(html).toContain('Fallback plan');
    expect(html).toContain('Deterministic fallback');
    expect(html).toContain('Malformed provider output');
    expect(html).not.toContain('DEMO PREVIEW');
    expect(html).not.toContain('Simulated successful ai&amp; plan');
    expect(html).not.toContain('Planned by Kimi via ai&amp;');
    expect(html).not.toContain('Kimi Verified');
  });
});

function renderPage(path: string): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ExperimentPlanPage />} path="/investigations/:investigationId/plan" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fallbackPlan(): ExperimentPlanResponse {
  return {
    ...demoPlanPreviewFixture,
    aiProvider: 'FALLBACK',
    plannerStatus: 'FALLBACK_USED',
    planningExplanation: 'Deterministic fallback plan created after malformed provider output.',
    schemaPassed: true,
    safetyPassed: true,
    plannerMetadata: {
      requestedProvider: 'AIAND',
      effectiveProvider: 'FALLBACK',
      plannerStatus: 'FALLBACK_USED',
      fallbackReason: 'Malformed provider output',
      model: 'moonshotai/kimi-k2.7-code',
    },
  };
}
