import { describe, expect, it } from 'vitest';
import { DeterministicMinimisationPlanService, type CandidateResult, type MinimisationState } from '../minimisation.service.js';
import type { DeterministicWorldDefinition } from '../deterministic-experiment-plan.service.js';

const sourceWorld: DeterministicWorldDefinition = {
  key: 'defective-repeat',
  name: 'Duplicate submission under delayed payment',
  browser: 'chromium',
  viewport: 'mobile-390x844',
  networkProfile: 'delayed-payment',
  userProfile: 'impatient',
  paymentDelayMs: 1200,
  duplicateSubmissionBug: true,
  doubleSubmit: true,
  doubleSubmitIntervalMs: 100,
  expectedOutcome: 'INVARIANT_VIOLATION',
  reason: 'Known failing source world.',
  randomSeed: 41002,
  creationOrder: 2,
};

const service = new DeterministicMinimisationPlanService();

const plan = () => service.create({
  investigationId: 'investigation_min',
  findingId: 'finding_duplicate',
  findingFingerprint: 'fingerprint_duplicate',
  sourceWorldId: 'world_source',
  sourceExperimentId: 'experiment_source',
  reproductionRunId: 'repro_run',
  sourceWorld,
  causalConditions: {
    causalStatus: 'SUPPORTED',
    failureRegion: {
      estimatedDelayRegion: {
        lowerPassingBoundMs: 600,
        upperFailingBoundMs: 1200,
      },
    },
  },
  maximumTrials: 8,
  targetPrecisionMs: 100,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('deterministic failure-condition minimisation', () => {
  it('creates stable plans with deterministic candidate order', () => {
    const first = plan();
    const second = plan();
    expect(first.id).toBe(second.id);
    expect(first.candidateVariables.map(({ name }) => name)).toEqual([
      'duplicateSubmissionBug',
      'doubleSubmit',
      'paymentDelayMs',
      'doubleSubmitIntervalMs',
      'userProfile',
      'viewport',
      'networkProfile',
      'browser',
    ]);
  });

  it('changes exactly one categorical variable per candidate', () => {
    const created = plan();
    const state = service.initialState(created);
    const [removeBug, removeDoubleSubmit, normaliseUser, normaliseViewport] = service.categoricalCandidates(created, state);
    expect(removeBug?.world).toMatchObject({ duplicateSubmissionBug: false, doubleSubmit: true, paymentDelayMs: 1200 });
    expect(removeDoubleSubmit?.world).toMatchObject({ duplicateSubmissionBug: true, doubleSubmit: false, paymentDelayMs: 1200 });
    expect(normaliseUser?.world).toMatchObject({ userProfile: 'normal', viewport: 'mobile-390x844' });
    expect(normaliseViewport?.world).toMatchObject({ userProfile: 'impatient', viewport: 'desktop-1440x900' });
  });

  it('records retained and removed condition decisions from simulated candidate outcomes', () => {
    const created = plan();
    let state: MinimisationState = service.initialState(created);
    const candidates = service.categoricalCandidates(created, state);
    const outcomes: CandidateResult[] = [
      'FAILURE_NOT_REPRODUCED',
      'FAILURE_NOT_REPRODUCED',
      'FAILURE_REPRODUCED',
      'FAILURE_REPRODUCED',
    ];
    for (const [index, outcome] of outcomes.entries()) {
      const decision = service.decide(state, candidates[index]!, outcome);
      state = {
        retainedConditions: decision.retainedConditions,
        removedConditions: decision.removedConditions,
        inconclusiveConditions: decision.inconclusiveConditions,
        currentConfiguration: decision.currentConfiguration,
        delayRange: decision.delayRange,
        completedTrials: state.completedTrials + 1,
      };
    }
    expect(state.retainedConditions).toMatchObject({ duplicateSubmissionBug: true, doubleSubmit: true });
    expect(state.removedConditions).toMatchObject({ userProfile: 'impatient', viewport: 'mobile-390x844' });
  });

  it('narrows delay bounds without claiming an exact threshold', () => {
    const created = plan();
    let state = service.initialState(created);
    const first = service.nextDelayCandidate(created, state, 1)!;
    expect(first.candidateValue).toBe(900);
    let decision = service.decide(state, first, 'FAILURE_REPRODUCED');
    state = { ...state, currentConfiguration: decision.currentConfiguration, delayRange: decision.delayRange, completedTrials: 1 };
    const second = service.nextDelayCandidate(created, state, 2)!;
    expect(second.candidateValue).toBe(750);
    decision = service.decide(state, second, 'FAILURE_NOT_REPRODUCED');
    state = { ...state, currentConfiguration: decision.currentConfiguration, delayRange: decision.delayRange, completedTrials: 2 };
    const third = service.nextDelayCandidate(created, state, 3)!;
    expect(third.candidateValue).toBe(825);
    decision = service.decide(state, third, 'FAILURE_REPRODUCED');
    expect(decision.delayRange).toMatchObject({
      lowerPassingBoundMs: 750,
      upperFailingBoundMs: 825,
      targetPrecisionMs: 100,
    });
    expect(825 - 750).toBeLessThanOrEqual(100);
  });

  it('updates confidence conservatively and caps the maximum', () => {
    expect(service.updateConfidence({
      previousConfidence: 0.95,
      retainedCount: 2,
      removedCount: 2,
      boundedRangeEstablished: true,
      finalConfirmationReproduced: true,
      maximumConfidence: 0.97,
    })).toMatchObject({
      finalConfidence: 0.97,
      confidenceLabel: 'CONFIRMED',
    });
  });
});
