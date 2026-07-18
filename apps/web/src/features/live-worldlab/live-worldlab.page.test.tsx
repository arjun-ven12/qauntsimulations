import type { InvestigationEvent } from '@taskos/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MockInvestigationApi, MOCK_INVESTIGATION_ID } from '../../services/api/mock-investigation-api.js';
import { CompletedRunSummary, EventTimeline, EvidenceSummary, ExperimentPlanPanel, InvestigationOverviewHeader, LiveFindingSummary, ProgressSummary, WorkerPanel, WorldMatrix, WorldTable } from '../runtime/runtime-components.js';
import { polling } from '../runtime/use-runtime-queries.js';
import { cleanupWarning, plannerLabels, providerLabel, timingLabels } from './live-worldlab.page.js';
import { InvestigationReport } from './investigation-report.js';

const event = (metadata?: InvestigationEvent['metadata']): InvestigationEvent => ({
  id: 'event-1',
  investigationId: 'investigation-1',
  type: 'sandbox_provisioning',
  message: 'Sandbox lifecycle event.',
  createdAt: '2026-01-01T00:00:00.000Z',
  metadata,
});

describe('LiveWorldLabPage runtime metadata helpers', () => {
  it('labels known providers and falls back safely for unknown providers', () => {
    expect(providerLabel(event({ provider: 'LOCAL' }))).toBe('Local worker');
    expect(providerLabel(event({ provider: 'DAYTONA' }))).toBe('Daytona sandbox');
    expect(providerLabel(event({ provider: 'EXPERIMENTAL_PROVIDER' }))).toBe(
      'Provider: EXPERIMENTAL_PROVIDER',
    );
    expect(providerLabel(event())).toBeNull();
  });

  it('formats optional timings only when finite values exist', () => {
    expect(
      timingLabels(
        event({
          sandboxSetupDurationMs: 1200.4,
          workerExecutionDurationMs: 333,
          artifactDownloadDurationMs: null,
          ignoredDurationMs: '200',
        }),
      ),
    ).toEqual(['Setup: 1,200 ms', 'Worker: 333 ms']);
    expect(timingLabels(event())).toEqual([]);
  });

  it('shows cleanup warnings only for cleanup failure metadata', () => {
    expect(cleanupWarning(event({ cleanupOutcome: 'DELETED' }))).toBeNull();
    expect(cleanupWarning(event({ phase: 'sandbox_cleanup_failed' }))).toBe(
      'Cleanup failed. Manual sandbox cleanup may be required.',
    );
    expect(cleanupWarning(event({ cleanupOutcome: 'FAILED', cleanupError: 'delete failed' }))).toBe(
      'Cleanup failed: delete failed',
    );
  });

  it('labels optional planner provenance and status metadata without requiring AI fields', () => {
    expect(
      plannerLabels(
        event({
          plannerProvenance: 'FALLBACK',
          plannerStatus: 'PARTIALLY_ACCEPTED',
          rejectedPlanItems: ['unsafe-world'],
        }),
      ),
    ).toEqual(['Planner: FALLBACK', 'Plan status: PARTIALLY ACCEPTED']);
    expect(plannerLabels(event())).toEqual([]);
  });

  it('renders Kimi planner and deterministic fallback provenance explicitly', () => {
    const base = {
      objective: 'Safe plan', journeyId: 'journey', scenarioId: 'scenario', worldPack: 'v1', selectedVariables: [], initialWorldCount: 0,
      maximumWorldCount: 4, maximumConcurrentWorkers: 2, timeoutSeconds: 0, retryCount: 0, safetyConstraints: [], invariants: [], worlds: [],
    };
    const kimi = renderToStaticMarkup(<ExperimentPlanPanel plan={{ ...base, plannerMetadata: { requestedProvider: 'KIMI', effectiveProvider: 'KIMI', plannerStatus: 'ACCEPTED', model: 'kimi-k2.6' } }} />);
    expect(kimi).toContain('Kimi AI');
    expect(kimi).toContain('kimi-k2.6');
    expect(kimi).toContain('Fallback used');
    expect(kimi).toContain('No');
    const fallback = renderToStaticMarkup(<ExperimentPlanPanel plan={{ ...base, plannerMetadata: { requestedProvider: 'KIMI', effectiveProvider: 'FALLBACK', plannerStatus: 'FALLBACK_USED', fallbackReason: 'Kimi planner request timed out.' } }} />);
    expect(fallback).toContain('Deterministic fallback');
    expect(fallback).toContain('Kimi planner request timed out.');
  });

  it('renders the completed 13-world runtime experience without report-body content', async () => {
    const api = new MockInvestigationApi();
    const progress = await api.getInvestigation(MOCK_INVESTIGATION_ID);
    const plan = await api.getExperimentPlan(MOCK_INVESTIGATION_ID);
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const workers = await api.getWorkers(MOCK_INVESTIGATION_ID);
    const evidence = await api.getEvidence(MOCK_INVESTIGATION_ID);
    const findings = await api.listFindings(MOCK_INVESTIGATION_ID);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <InvestigationOverviewHeader progress={progress} plan={plan} workerProvider={workers[0]?.provider} />
          <ProgressSummary progress={progress} />
          <CompletedRunSummary progress={progress} findings={findings} />
          <WorldTable worlds={worlds} experiments={experiments} workers={workers} evidence={evidence} />
          <WorldMatrix worlds={worlds} experiments={experiments} workers={workers} evidence={evidence} />
          <WorkerPanel workers={workers} experiments={experiments} />
          <EventTimeline events={progress.recentEvents} />
          <LiveFindingSummary investigationId={MOCK_INVESTIGATION_ID} findings={findings} investigationStatus={progress.status} />
          <EvidenceSummary evidence={evidence} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(worlds).toHaveLength(13);
    expect(workers).toHaveLength(13);
    expect(evidence).toHaveLength(93);
    expect(findings).toHaveLength(1);
    expect(html).toContain('Investigation complete');
    expect(html).toContain('World exploration');
    expect(html).toContain('Inspect world');
    expect(html).not.toContain('>Browser</th>');
    expect(html).not.toContain('>Viewport</th>');
    expect(html).toContain('Execution');
    expect(html).toContain('Business outcome');
    expect(html).toContain('Execution completed');
    expect(html).toContain('Execution failed');
    expect(html).not.toContain('World status');
    expect(html).toContain('Adaptive reproduction');
    expect(html).toContain('Failure minimisation');
    expect(html).toContain('World matrix');
    expect(html).toContain('Workers and attempts');
    expect(html).toContain('Runtime event timeline');
    expect(html).toContain('Discovered finding');
    expect(html).toContain('Evidence availability');
    expect(html).toContain('rift-semantic-status--pass');
    expect(html).toContain('rift-semantic-status--fail');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('/Users/');
    expect(html).not.toContain('Final report\\n\\nDuplicate checkout submission');
  });

  it('renders the monochrome report hierarchy from real investigation data', async () => {
    const api = new MockInvestigationApi();
    const progress = await api.getInvestigation(MOCK_INVESTIGATION_ID);
    const findings = await api.listFindings(MOCK_INVESTIGATION_ID);
    const evidence = await api.getEvidence(MOCK_INVESTIGATION_ID);
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <InvestigationReport
          canVerifyRepair
          evidence={evidence}
          experiments={experiments}
          findings={findings}
          investigationId={MOCK_INVESTIGATION_ID}
          progress={progress}
          worlds={worlds}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('Investigation conclusion');
    expect(html).toContain('Confirmed finding');
    expect(html).toContain('Minimal tested trigger');
    expect(html).toContain('Final report');
    expect(html).toContain('Repair Verification');
    expect(html).toContain('Failure boundary');
    expect(html).toContain('Confidence');
    expect(html).toContain('Evidence artifacts');
    expect(html).toContain('rift-semantic-status--pass');
    expect(html).toContain('rift-semantic-status--fail');
    expect(html).toContain('/repair-verifications/new');
    expect(html).not.toContain('bg-cyan');
    expect(html).not.toContain('text-emerald');
    expect(html).not.toContain('text-red');
  });

  it('documents polling intervals used by active investigations', () => {
    expect(polling.progressMs).toBe(2000);
    expect(polling.worldsMs).toBe(3000);
    expect(polling.workersMs).toBe(3000);
    expect(polling.findingsMs).toBe(5000);
    expect(polling.evidenceMs).toBe(5000);
  });
});
