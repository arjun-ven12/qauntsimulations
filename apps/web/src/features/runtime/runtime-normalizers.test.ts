import { describe, expect, it } from 'vitest';
import { MockInvestigationApi, MOCK_FINDING_ID, MOCK_INVESTIGATION_ID } from '../../services/api/mock-investigation-api.js';
import {
  boundedRange,
  causalStatus,
  completedWorlds,
  conditionRecord,
  eventLabel,
  eventMetadataSummary,
  evidenceGroups,
  filterWorld,
  noAbsolutePath,
  phaseLabel,
  progressPercentage,
  reproductionSteps,
  worldOrigin,
  worldPurpose,
  worldResult,
} from './runtime-normalizers.js';

describe('runtime world normalization', () => {
  it('classifies initial, adaptive, minimisation, and unknown origins safely', async () => {
    const worlds = await new MockInvestigationApi().getWorlds(MOCK_INVESTIGATION_ID);
    expect(worldOrigin(worlds[0]!)).toBe('INITIAL');
    expect(worldOrigin(worlds[4]!)).toBe('ADAPTIVE_REPRODUCTION');
    expect(worldOrigin(worlds[7]!)).toBe('MINIMISATION');
    expect(worldOrigin({ configuration: { origin: 'ALIEN' } })).toBe('UNKNOWN');
    expect(worldPurpose(worlds[7]!)).toContain('Remove');
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
    expect(phaseLabel('ADAPTING')).toBe('Designing follow-up experiments');
    expect(phaseLabel('REPRODUCING')).toBe('Reproducing the failure');
    expect(phaseLabel('MINIMISING')).toBe('Finding minimal trigger conditions');
    expect(phaseLabel('CANCELLED')).toBe('Investigation cancelled');
  });

  it('humanizes known and unknown events without dumping metadata', () => {
    expect(eventLabel('adaptive_plan_created')).toBe('Adaptive plan created');
    expect(eventLabel('surprising_future_event')).toBe('Surprising Future Event');
    expect(eventMetadataSummary({ id: 'e', investigationId: 'i', type: 'x', message: 'x', createdAt: '2026-01-01T00:00:00.000Z', metadata: { durationMs: 100, large: { nested: true } } })).toEqual(['Duration Ms: 100']);
  });
});

describe('finding, minimisation, and evidence normalization', () => {
  it('extracts confidence metadata, conditions, bounded range, and steps without overclaiming', async () => {
    const finding = await new MockInvestigationApi().getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID);
    expect(causalStatus(finding)).toBe('SUPPORTED');
    expect(causalStatus(finding)).not.toBe('PROVEN');
    expect(Object.keys(conditionRecord(finding, 'retainedConditions'))).toContain('duplicateSubmissionBug');
    expect(Object.keys(conditionRecord(finding, 'removedConditions'))).toContain('viewport');
    expect(Object.keys(conditionRecord(finding, 'inconclusiveConditions'))).toHaveLength(0);
    expect(boundedRange(finding).knownFailingDelayMs).toBe(1200);
    expect(reproductionSteps(finding).length).toBeGreaterThan(0);
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
});
