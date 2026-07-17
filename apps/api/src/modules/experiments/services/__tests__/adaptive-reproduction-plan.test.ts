import { describe, expect, it } from 'vitest';
import { AdaptiveReproductionPlanService } from '../adaptive-reproduction-plan.service.js';
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
  reason: 'Known duplicate condition.',
  randomSeed: 41002,
  creationOrder: 2,
};

describe('AdaptiveReproductionPlanService', () => {
  it('generates a deterministic exact reproduction and one-variable controls', () => {
    const service = new AdaptiveReproductionPlanService();
    const input = {
      investigationId: 'investigation',
      findingId: 'finding',
      findingFingerprint: 'fingerprint',
      sourceWorldId: 'world-source',
      sourceExperimentId: 'experiment-source',
      sourceWorld,
      maximumWorlds: 5,
      createdAt: '2026-07-17T00:00:00.000Z',
    };
    const first = service.create(input);
    const second = service.create(input);

    expect(second).toEqual(first);
    expect(first.generatedWorlds).toHaveLength(5);
    expect(first.generatedWorlds[0]).toMatchObject({
      duplicateSubmissionBug: true,
      paymentDelayMs: 1200,
      doubleSubmit: true,
      expectedOutcome: 'INVARIANT_VIOLATION',
      adaptive: { adaptivePurpose: 'EXACT_REPRODUCTION' },
    });
    expect(first.generatedWorlds[1]).toMatchObject({
      duplicateSubmissionBug: false,
      paymentDelayMs: 1200,
      doubleSubmit: true,
      expectedOutcome: 'PASS',
      adaptive: { changedVariables: { duplicateSubmissionBug: false } },
    });
    expect(first.generatedWorlds[2]).toMatchObject({
      duplicateSubmissionBug: true,
      doubleSubmit: false,
      expectedOutcome: 'PASS',
    });
    expect(first.generatedWorlds[3]).toMatchObject({
      paymentDelayMs: 600,
      adaptive: { adaptivePurpose: 'DELAY_COMPARISON' },
    });
    expect(new Set(first.generatedWorlds.map(({ key }) => key)).size).toBe(5);
  });

  it('respects the maximum follow-up world limit', () => {
    const plan = new AdaptiveReproductionPlanService().create({
      investigationId: 'investigation',
      findingId: 'finding',
      findingFingerprint: 'fingerprint',
      sourceWorldId: 'world-source',
      sourceExperimentId: 'experiment-source',
      sourceWorld,
      maximumWorlds: 3,
    });

    expect(plan.generatedWorlds.map(({ adaptive }) => adaptive.adaptivePurpose)).toEqual([
      'EXACT_REPRODUCTION',
      'BUG_FLAG_CONTROL',
      'INTERACTION_CONTROL',
    ]);
  });
});
