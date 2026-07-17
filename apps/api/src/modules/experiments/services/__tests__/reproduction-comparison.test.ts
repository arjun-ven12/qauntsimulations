import { describe, expect, it } from 'vitest';
import type { AdaptivePurpose } from '../adaptive-reproduction-plan.service.js';
import type { DeterministicWorldDefinition } from '../deterministic-experiment-plan.service.js';
import { ReproductionComparisonService, type ReproductionWorldOutcome } from '../reproduction-comparison.service.js';
import { AdaptiveConfidenceService } from '../adaptive-confidence.service.js';

const world = (paymentDelayMs: number, changes: Partial<DeterministicWorldDefinition> = {}): DeterministicWorldDefinition => ({
  key: `world-${paymentDelayMs}-${changes.doubleSubmit ?? true}-${changes.duplicateSubmissionBug ?? true}`,
  name: 'World',
  browser: 'chromium',
  viewport: 'mobile-390x844',
  networkProfile: 'delayed-payment',
  userProfile: 'impatient',
  paymentDelayMs,
  duplicateSubmissionBug: true,
  doubleSubmit: true,
  doubleSubmitIntervalMs: 100,
  expectedOutcome: 'OBSERVE',
  reason: 'test',
  randomSeed: paymentDelayMs,
  creationOrder: paymentDelayMs,
  ...changes,
});

const outcome = (purpose: AdaptivePurpose, outcomeValue: ReproductionWorldOutcome['outcome'], item = world(1200)): ReproductionWorldOutcome => ({
  worldId: `world-${purpose}`,
  experimentId: `experiment-${purpose}`,
  purpose,
  world: item,
  outcome: outcomeValue,
  invariantEvaluationIds: outcomeValue === 'FAIL' ? [`evaluation-${purpose}`] : [],
  evidenceArtifactIds: [`artifact-${purpose}`],
});

describe('ReproductionComparisonService', () => {
  it('marks bug flag and double-submit as likely required and estimates a bounded delay region', () => {
    const source = world(1200);
    const result = new ReproductionComparisonService().compare(source, [
      outcome('EXACT_REPRODUCTION', 'FAIL', source),
      outcome('BUG_FLAG_CONTROL', 'PASS', world(1200, { duplicateSubmissionBug: false })),
      outcome('INTERACTION_CONTROL', 'PASS', world(1200, { doubleSubmit: false })),
      outcome('DELAY_COMPARISON', 'PASS', world(600)),
      outcome('LOW_DELAY_COMPARISON', 'PASS', world(200)),
    ], 'source-world');

    expect(result.exactReproduced).toBe(true);
    expect(result.causalStatus).toBe('SUPPORTED');
    expect(result.comparisons).toEqual(expect.arrayContaining([
      expect.objectContaining({ variable: 'duplicateSubmissionBug', interpretation: 'LIKELY_REQUIRED' }),
      expect.objectContaining({ variable: 'doubleSubmit', interpretation: 'LIKELY_REQUIRED' }),
      expect.objectContaining({ variable: 'paymentDelayMs', interpretation: 'LIKELY_CONTRIBUTING' }),
    ]));
    expect(result.failureRegion.estimatedDelayRegion).toMatchObject({
      lowerPassingBoundMs: 600,
      upperFailingBoundMs: 1200,
      classification: 'FAILURE_OBSERVED_ABOVE_COMPARISON_RANGE',
    });
  });
});

describe('AdaptiveConfidenceService', () => {
  it('raises confidence conservatively and caps the maximum', () => {
    const comparison = new ReproductionComparisonService().compare(world(1200), [
      outcome('EXACT_REPRODUCTION', 'FAIL'),
      outcome('BUG_FLAG_CONTROL', 'PASS', world(1200, { duplicateSubmissionBug: false })),
      outcome('INTERACTION_CONTROL', 'PASS', world(1200, { doubleSubmit: false })),
      outcome('DELAY_COMPARISON', 'PASS', world(600)),
    ]);
    const confidence = new AdaptiveConfidenceService({ initialConfidence: 0.75, maximumConfidence: 0.95 }).update(0.9, comparison, [
      outcome('EXACT_REPRODUCTION', 'FAIL'),
      outcome('BUG_FLAG_CONTROL', 'PASS'),
      outcome('INTERACTION_CONTROL', 'PASS'),
      outcome('DELAY_COMPARISON', 'PASS'),
    ]);

    expect(confidence.updatedConfidence).toBe(0.95);
    expect(confidence.confidenceLabel).toBe('CONFIRMED');
    expect(confidence.reproducedIncrement).toBe(1);
  });

  it('does not increment reproduction count when exact reproduction does not fail', () => {
    const comparison = new ReproductionComparisonService().compare(world(1200), [
      outcome('EXACT_REPRODUCTION', 'PASS'),
    ]);
    const confidence = new AdaptiveConfidenceService({ initialConfidence: 0.75, maximumConfidence: 0.95 }).update(0.75, comparison, [
      outcome('EXACT_REPRODUCTION', 'PASS'),
    ]);

    expect(confidence.reproducedIncrement).toBe(0);
    expect(confidence.updatedConfidence).toBe(0.75);
  });
});
