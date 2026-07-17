import { describe, expect, it } from 'vitest';
import { MockInvestigationApi, MOCK_FINDING_ID, MOCK_INVESTIGATION_ID } from '../../services/api/mock-investigation-api.js';
import {
  boundedRange,
  causalStatus,
  completedWorlds,
  conditionRecord,
  evidenceFilename,
  evidenceStageGroups,
  eventLabel,
  eventGroup,
  eventImportance,
  eventMetadataSummary,
  experimentHistoryRows,
  failureBoundaryFromWorlds,
  failureBoundaryViewModel,
  evidenceGroups,
  filterWorld,
  filterWorldRows,
  formatConditionKey,
  formatConditionValue,
  noAbsolutePath,
  phaseTracker,
  phaseLabel,
  progressPercentage,
  progressCopy,
  reproductionSteps,
  runtimeMatrix,
  sortWorldRows,
  terminalSummary,
  workerViewModels,
  worldOrigin,
  worldPurpose,
  worldRows,
  worldExecutionState,
  worldResult,
  providerFromPlan,
  plannerProviderLabel,
} from './runtime-normalizers.js';

describe('runtime world normalization', () => {
  it('normalizes Kimi planner provenance independently from fallback source', () => {
    expect(providerFromPlan({ plannerMetadata: { requestedProvider: 'KIMI', effectiveProvider: 'KIMI', plannerStatus: 'ACCEPTED', model: 'kimi-k2.6' } } as never)).toMatchObject({ requested: 'KIMI', effective: 'KIMI', model: 'kimi-k2.6', fallbackUsed: false });
    expect(providerFromPlan({ plannerMetadata: { requestedProvider: 'KIMI', effectiveProvider: 'FALLBACK', plannerStatus: 'FALLBACK_USED' } } as never)).toMatchObject({ requested: 'KIMI', effective: 'FALLBACK', fallbackUsed: true });
    expect(plannerProviderLabel('KIMI')).toBe('Kimi AI');
    expect(plannerProviderLabel('FALLBACK')).toBe('Deterministic fallback');
  });
  it('classifies initial, adaptive, minimisation, and unknown origins safely', async () => {
    const worlds = await new MockInvestigationApi().getWorlds(MOCK_INVESTIGATION_ID);
    expect(worldOrigin(worlds[0]!)).toBe('INITIAL');
    expect(worldOrigin(worlds[4]!)).toBe('ADAPTIVE_REPRODUCTION');
    expect(worldOrigin(worlds[7]!)).toBe('MINIMISATION');
    expect(worldOrigin({ configuration: { origin: 'ALIEN' } })).toBe('UNKNOWN');
    expect(worldPurpose(worlds[7]!)).toContain('Normalise');
  });

  it('keeps lifecycle and business outcomes independent for the affected real-shape rows', async () => {
    const api = new MockInvestigationApi();
    const worlds = await api.getWorlds('cmrox3ij8010t8z9kdrt0xjjt');
    const experiments = await api.getExperiments('cmrox3ij8010t8z9kdrt0xjjt');
    const workers = await api.getWorkers('cmrox3ij8010t8z9kdrt0xjjt');
    const evidence = await api.getEvidence('cmrox3ij8010t8z9kdrt0xjjt');
    const rows = worldRows(worlds, experiments, workers, evidence);

    for (const workerId of ['worker_3', 'worker_4', 'worker_5']) {
      expect(rows.find((row) => row.workerId === workerId)).toMatchObject({ status: 'Completed', result: 'FAIL' });
      expect(workers.find((worker) => worker.id === workerId)).toMatchObject({ status: 'COMPLETED', attempts: [{ status: 'FAILED', exitCode: 2 }] });
    }
    expect(rows.some((row) => row.status === 'Failed' && row.result === 'PASS')).toBe(false);
  });

  it('normalizes technical failure as FAILED / INCONCLUSIVE even when partial invariants passed', async () => {
    const api = new MockInvestigationApi();
    const [sourceWorld] = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const [sourceExperiment] = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const world = { ...sourceWorld!, id: 'technical-world', status: 'FAILED', executionState: 'FAILED' as const, businessOutcome: 'INCONCLUSIVE' as const };
    const experiment = { ...sourceExperiment!, worldId: world.id, status: 'ERROR', executionState: 'FAILED' as const, businessOutcome: 'INCONCLUSIVE' as const };
    expect(worldExecutionState(world, [experiment])).toBe('FAILED');
    expect(worldResult(world, [experiment])).toBe('INCONCLUSIVE');
  });

  it('filters lifecycle and business outcome independently', async () => {
    const api = new MockInvestigationApi();
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const workers = await api.getWorkers(MOCK_INVESTIGATION_ID);
    const evidence = await api.getEvidence(MOCK_INVESTIGATION_ID);
    const rows = worldRows(worlds, experiments, workers, evidence);
    expect(filterWorldRows(rows, 'BUSINESS_FAIL', '').map((row) => row.workerId)).toEqual(expect.arrayContaining(['worker_3', 'worker_4', 'worker_5']));
    expect(filterWorldRows(rows, 'EXECUTION_FAILED', '')).toHaveLength(0);
  });

  it('does not treat attempts as world count and filters by result/origin', async () => {
    const api = new MockInvestigationApi();
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    expect(worlds).toHaveLength(13);
    expect(experiments.reduce((sum, experiment) => sum + experiment.attemptCount, 0)).toBe(13);
    expect(worlds.filter((world) => filterWorld(world, 'MINIMISATION', experiments))).toHaveLength(6);
    expect(worlds.filter((world) => filterWorld(world, 'BUSINESS_PASS', experiments)).length).toBeGreaterThan(0);
    expect(['PASS', 'FAIL']).toContain(worldResult(worlds[0]!, experiments));
  });
});

describe('runtime progress and event formatting', () => {
  it('renders dynamic progress and terminal statuses accurately', async () => {
    const progress = await new MockInvestigationApi().getInvestigation(MOCK_INVESTIGATION_ID);
    expect(completedWorlds(progress.progress)).toBe(13);
    expect(progress.progress.passed).toBe(13);
    expect(progress.progress.failed).toBe(0);
    expect(progressPercentage(progress.progress)).toBe(100);
    expect(progressPercentage({ totalWorlds: 20, queued: 7, running: 0, passed: 7, failed: 6, flaky: 0 })).toBe(65);
    expect(phaseLabel('ADAPTING')).toBe('Designing follow-up worlds');
    expect(phaseLabel('REPRODUCING')).toBe('Reproducing the failure');
    expect(phaseLabel('MINIMISING')).toBe('Narrowing trigger conditions');
    expect(phaseLabel('CANCELLED')).toBe('Investigation cancelled');
    expect(progressCopy({ totalWorlds: 20, queued: 7, running: 0, passed: 7, failed: 6, flaky: 0 })).toBe('13 completed · 0 running · 7 queued');
  });

  it('maps statuses to phase tracker states and terminal summaries', async () => {
    expect(phaseTracker('PLANNING')[0]).toMatchObject({ label: 'Plan', state: 'active' });
    expect(phaseTracker('RUNNING')[1]).toMatchObject({ label: 'Explore', state: 'active' });
    expect(phaseTracker('ADAPTING')[2]).toMatchObject({ label: 'Reproduce', state: 'active' });
    expect(phaseTracker('REPRODUCING')[2]).toMatchObject({ label: 'Reproduce', state: 'active' });
    expect(phaseTracker('MINIMISING')[3]).toMatchObject({ label: 'Minimise', state: 'active' });
    expect(phaseTracker('COMPLETED', 1).every((step) => step.state === 'completed')).toBe(true);
    expect(phaseTracker('COMPLETED', 0).filter((step) => step.state === 'skipped').map((step) => step.label)).toEqual(['Reproduce', 'Minimise']);
    expect(phaseTracker('FAILED').some((step) => step.state === 'stopped')).toBe(true);
    expect(phaseTracker('CANCELLED').some((step) => step.state === 'stopped')).toBe(true);
    const progress = await new MockInvestigationApi().getInvestigation(MOCK_INVESTIGATION_ID);
    expect(terminalSummary(progress, [])).toContain('All evaluated business invariants held');
    expect(terminalSummary(progress, [await new MockInvestigationApi().getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID)])).toContain('Investigation complete');
  });

  it('humanizes known and unknown events without dumping metadata', () => {
    expect(eventLabel('adaptive_plan_created')).toBe('Adaptive plan created');
    expect(eventLabel('surprising_future_event')).toBe('Surprising Future Event');
    expect(eventMetadataSummary({ id: 'e', investigationId: 'i', type: 'x', message: 'x', createdAt: '2026-01-01T00:00:00.000Z', metadata: { durationMs: 100, large: { nested: true } } })).toEqual(['Duration Ms: 100']);
    expect(eventGroup('final_report_completed')).toBe('Final report');
    expect(eventGroup('sandbox_ready')).toBe('Fleet and sandbox');
    expect(eventImportance('finding_created')).toBe('IMPORTANT');
    expect(eventImportance('evidence_captured')).toBe('TECHNICAL');
  });
});

describe('finding, minimisation, and evidence normalization', () => {
  it('formats condition keys and values for product-facing copy', () => {
    expect(formatConditionKey('duplicateSubmissionBug')).toBe('Duplicate-submission mode');
    expect(formatConditionKey('doubleSubmit')).toBe('Repeated checkout submission');
    expect(formatConditionKey('doubleSubmitIntervalMs')).toBe('Click interval');
    expect(formatConditionKey('unknownRuntimeKey')).toBe('Unknown Runtime Key');
    expect(formatConditionValue('duplicateSubmissionBug', true)).toBe('Enabled');
    expect(formatConditionValue('doubleSubmitIntervalMs', 100)).toBe('100 ms');
    expect(formatConditionValue('optional', null)).toBe('Not recorded');
  });

  it('extracts confidence metadata, conditions, bounded range, and steps without overclaiming', async () => {
    const finding = await new MockInvestigationApi().getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    expect(causalStatus(finding)).toBe('SUPPORTED');
    expect(causalStatus(finding)).not.toBe('PROVEN');
    expect(Object.keys(conditionRecord(finding, 'retainedConditions'))).toContain('duplicateSubmissionBug');
    expect(Object.keys(conditionRecord(finding, 'removedConditions'))).toContain('viewport');
    expect(Object.keys(conditionRecord(finding, 'inconclusiveConditions'))).toHaveLength(0);
    expect(boundedRange(finding).knownFailingDelayMs).toBe(1200);
    expect(failureBoundaryViewModel(finding)).toMatchObject({
      failingBoundMs: 1200,
      testedPoints: [
        { valueMs: 1200, outcome: 'FAIL' },
      ],
    });
    expect(failureBoundaryViewModel(finding).passingBoundMs).toBeUndefined();
    expect(reproductionSteps(finding).length).toBeGreaterThan(0);
  });

  it('reads Prompt 8 final minimisation shapes from real API metadata aliases', async () => {
    const finding = await new MockInvestigationApi().getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    const realShape = {
      ...finding,
      causalConditions: {
        worldId: 'world-source',
        experimentId: 'experiment-source',
        minimalTestedConditions: {
          retainedConditions: { duplicateSubmissionBug: true },
          removedConditions: { viewport: 'mobile' },
          inconclusiveConditions: {},
          timingRange: { lowerPassingBoundMs: 900, upperFailingBoundMs: 1200, targetPrecisionMs: 100 },
        },
        finalReproductionSteps: ['Enable duplicate-submission mode.', 'Click Pay twice.'],
      },
    };
    expect(conditionRecord(realShape, 'retainedConditions').duplicateSubmissionBug).toBe(true);
    expect(failureBoundaryViewModel(realShape).passingBoundMs).toBe(900);
    expect(failureBoundaryViewModel(realShape).failingBoundMs).toBe(1200);
    expect(reproductionSteps(realShape)).toEqual(['Enable duplicate-submission mode.', 'Click Pay twice.']);
  });

  it('groups evidence and keeps local paths out of renderable metadata', async () => {
    const evidence = await new MockInvestigationApi().getEvidence(MOCK_INVESTIGATION_ID);
    const groups = evidenceGroups(evidence);
    expect(groups['Final reports']).toHaveLength(2);
    expect(groups.Screenshots?.length).toBeGreaterThan(0);
    expect(groups.Traces?.length).toBeGreaterThan(0);
    expect(groups.Logs?.length).toBeGreaterThan(0);
    expect(noAbsolutePath(evidence)).toBe(true);
  });

  it('groups evidence by structured runtime stage before falling back to Other', async () => {
    const api = new MockInvestigationApi();
    const finding = await api.getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const evidence = await api.getEvidence(MOCK_INVESTIGATION_ID);
    const groups = evidenceStageGroups(evidence, { finding, worlds, experiments });
    expect(groups['Final reports']).toHaveLength(2);
    expect(groups['Original observation'].length).toBeGreaterThan(0);
    expect(groups['Exact reproduction'].length).toBeGreaterThan(0);
    expect(groups['Controlled comparisons'].length).toBeGreaterThan(0);
    expect(groups['Minimisation trials'].length).toBeGreaterThan(0);
    expect(groups['Final confirmation'].length).toBeGreaterThan(0);
    expect(evidenceFilename(evidence[0]!)).not.toContain('/');
  });

  it('builds experiment history without per-world fetch state', async () => {
    const api = new MockInvestigationApi();
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const evidence = await api.getEvidence(MOCK_INVESTIGATION_ID);
    const rows = experimentHistoryRows(worlds, experiments, evidence);
    expect(rows).toHaveLength(13);
    expect(rows.some((row) => row.stage === 'ADAPTIVE_REPRODUCTION')).toBe(true);
    expect(rows.some((row) => row.stage === 'MINIMISATION')).toBe(true);
    expect(rows.find((row) => row.worldId === 'world_minimisation_13')?.purpose).toContain('Confirm');
    expect(rows.every((row) => row.evidenceCount > 0)).toBe(true);
    expect(failureBoundaryFromWorlds(worlds, experiments)).toMatchObject({ failingBoundMs: 1200 });
    expect(failureBoundaryFromWorlds(worlds, experiments).passingBoundMs).toBeUndefined();
  });

  it('builds sortable searchable world rows, worker view models, and a real matrix', async () => {
    const api = new MockInvestigationApi();
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    const workers = await api.getWorkers(MOCK_INVESTIGATION_ID);
    const evidence = await api.getEvidence(MOCK_INVESTIGATION_ID);
    const rows = worldRows(worlds, experiments, workers, evidence);
    expect(rows).toHaveLength(13);
    expect(filterWorldRows(rows, 'ADAPTIVE_REPRODUCTION', '')).toHaveLength(3);
    expect(filterWorldRows(rows, 'MINIMISATION', '')).toHaveLength(6);
    expect(filterWorldRows(rows, 'ALL', 'confirm minimal')).toHaveLength(1);
    expect(sortWorldRows(rows, 'PAYMENT_DELAY')[0]?.paymentDelayMs).toBe(0);

    const workerRows = workerViewModels(workers, experiments);
    expect(workerRows).toHaveLength(13);
    expect(workerRows[0]?.attempts[0]?.number).toBe(1);
    expect(workerRows.every((row) => row.cleanupLabel.length > 0)).toBe(true);
    expect(workerRows.find((row) => row.worker.id === 'worker_3')).toMatchObject({
      state: 'Completed',
      finalOutcome: 'Fail',
      attempts: [{ status: 'Completed · invariant violation', infrastructureFailure: false }],
    });

    const matrix = runtimeMatrix(rows);
    expect(matrix?.columns).toEqual([600, 900, 1200]);
    expect(matrix?.excludedWorldCount).toBeGreaterThan(0);
    expect(matrix?.cells.some((cell) => cell.outcome === 'NOT_TESTED')).toBe(true);
    expect(matrix?.cells.some((cell) => cell.outcome === 'PASS')).toBe(true);
    expect(matrix?.cells.some((cell) => cell.outcome === 'FAIL' || cell.outcome === 'MIXED')).toBe(true);

    const technicalFailureMatrix = runtimeMatrix([{ ...rows[0]!, status: 'Failed', result: 'INCONCLUSIVE' }]);
    expect(technicalFailureMatrix?.cells.some((cell) => cell.outcome === 'FAIL')).toBe(false);
    expect(technicalFailureMatrix?.cells.some((cell) => cell.outcome === 'INCONCLUSIVE')).toBe(true);
  });
});
