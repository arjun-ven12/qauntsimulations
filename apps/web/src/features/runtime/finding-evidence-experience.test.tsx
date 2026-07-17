import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MockInvestigationApi, MOCK_FINDING_ID, MOCK_INVESTIGATION_ID } from '../../services/api/mock-investigation-api.js';
import { EvidenceViewer, FailureRange, FindingDetailSections, ReproductionSteps } from './runtime-components.js';

function withQueryClient(node: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>;
}

describe('finding evidence experience', () => {
  it('renders minimal tested condition language without proven causal claims', async () => {
    const api = new MockInvestigationApi();
    const finding = await api.getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    const html = renderToStaticMarkup(withQueryClient(<FindingDetailSections finding={finding} investigationStatus="COMPLETED" />));

    expect(html).toContain('Minimal tested condition set');
    expect(html).toContain('Duplicate-submission mode');
    expect(html).toContain('Repeated checkout submission');
    expect(html).toContain('No inconclusive conditions were recorded');
    expect(html).toContain('Business impact');
    expect(html).not.toMatch(/Proven/i);
  });

  it('renders one-sided structured bounds without inventing a passing delay', async () => {
    const finding = await new MockInvestigationApi().getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    const html = renderToStaticMarkup(<FailureRange finding={finding} />);

    expect(html).toContain('No passing bound');
    expect(html).toContain('≥ 1,200 ms');
    expect(html).toContain('Only one side of the boundary was recorded');
    expect(html).not.toContain('901 ms definitely fails');
    expect(html).not.toContain('≤ 900 ms');
  });

  it('preserves reproduction-step order and renders the empty state', async () => {
    const finding = await new MockInvestigationApi().getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    const html = renderToStaticMarkup(<ReproductionSteps finding={finding} />);
    expect(html.indexOf('Open the test product.')).toBeLessThan(html.indexOf('Click Pay twice quickly.'));

    const empty = renderToStaticMarkup(<ReproductionSteps finding={{ ...finding, causalConditions: {} }} />);
    expect(empty).toContain('Structured reproduction steps were not generated');
  });

  it('renders 93 artifacts in collapsed groups without fetching report bodies', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const api = new MockInvestigationApi();
    const finding = await api.getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const evidence = await api.getEvidence(MOCK_INVESTIGATION_ID);
    const html = renderToStaticMarkup(withQueryClient(
      <EvidenceViewer evidence={evidence} experiments={experiments} finding={finding} investigationId={MOCK_INVESTIGATION_ID} worlds={worlds} />,
    ));

    expect(evidence).toHaveLength(93);
    expect(html).toContain('93 artifacts grouped by runtime stage');
    expect(html).toContain('Final reports (2)');
    expect(html).toContain('Original observation');
    expect(html).toContain('Minimisation trials');
    expect(html).toContain('Show more evidence');
    expect(html).not.toContain('/Users/');
    expect(html).not.toContain('reports/cmrol9cxh0001rurb8godxnh6');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('renders experiment history, limitations, final reports, and safe causal sequence', async () => {
    const api = new MockInvestigationApi();
    const finding = await api.getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const evidence = await api.getEvidence(MOCK_INVESTIGATION_ID);
    const html = renderToStaticMarkup(withQueryClient(
      <FindingDetailSections evidence={evidence} experiments={experiments} finding={finding} investigationStatus="COMPLETED" worlds={worlds} />,
    ));

    expect(html).toContain('Experiment history');
    expect(html).toContain('Initial');
    expect(html).toContain('Adaptive Reproduction');
    expect(html).toContain('Minimisation');
    expect(html).toContain('Evidence-supported sequence');
    expect(html).toContain('Delayed payment response');
    expect(html).toContain('Greedy minimisation was used');
    expect(html).toContain('Final reports (2)');
  });
});
