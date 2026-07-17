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
  worldResult,
} from './runtime-normalizers.js';

describe('runtime world normalization', () => {
  it('classifies initial, adaptive, minimisation, and unknown origins safely', async () => {
    const worlds = await new MockInvestigationApi().getWorlds(MOCK_INVESTIGATION_ID);
    expect(worldOrigin(worlds[0]!)).toBe('INITIAL');
    expect(worldOrigin(worlds[4]!)).toBe('ADAPTIVE_REPRODUCTION');
    expect(worldOrigin(worlds[7]!)).toBe('MINIMISATION');
    expect(worldOrigin({ configuration: { origin: 'ALIEN' } })).toBe('UNKNOWN');
    expect(worldPurpose(worlds[7]!)).toContain('Normalise');
  });

  it('does not treat attempts as world count and filters by result/origin', async () => {
    const api = new MockInvestigationApi();
    const worlds = await api.getWorlds(MOCK_INVESTIGATION_ID);
    const experiments = await api.getExperiments(MOCK_INVESTIGATION_ID);
    expect(worlds).toHaveLength(13);
    expect(experiments.reduce((sum, experiment) => sum + experiment.attemptCount, 0)).toBe(13);
    expect(worlds.filter((world) => filterWorld(world, 'MINIMISATION', experiments))).toHaveLength(6);
    expect(worlds.filter((world) => filterWorld(world, 'PASSED', experiments)).length).toBeGreaterThan(0);
    expect(['PASS', 'FAIL']).toContain(worldResult(worlds[0]!, experiments));
  });
});

describe('runtime progress and event formatting', () => {
  it('renders dynamic progress and terminal statuses accurately', async () => {
    const progress = await new MockInvestigationApi().getInvestigation(MOCK_INVESTIGATION_ID);
    expect(completedWorlds(progress.progress)).toBe(13);
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

    const matrix = runtimeMatrix(rows);
    expect(matrix?.columns).toEqual([600, 900, 1200]);
    expect(matrix?.excludedWorldCount).toBeGreaterThan(0);
    expect(matrix?.cells.some((cell) => cell.outcome === 'NOT_TESTED')).toBe(true);
    expect(matrix?.cells.some((cell) => cell.outcome === 'PASS')).toBe(true);
    expect(matrix?.cells.some((cell) => cell.outcome === 'FAIL' || cell.outcome === 'MIXED')).toBe(true);
  });
});
