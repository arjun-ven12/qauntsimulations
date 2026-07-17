import { describe, expect, it } from 'vitest';
import { aggregateMinimisationDelayBounds, boundedRangeFromAggregatedBounds } from '../minimisation-bounds.js';

describe('minimisation delay-bound aggregation', () => {
  it('updates passing and failing bounds from delay candidates', () => {
    const bounds = aggregateMinimisationDelayBounds({
      candidates: [
        { variableName: 'paymentDelayMs', candidateValue: 900, result: 'FAILURE_NOT_REPRODUCED' },
        { variableName: 'paymentDelayMs', candidateValue: 1200, result: 'FAILURE_REPRODUCED' },
      ],
    });
    expect(bounds).toMatchObject({ knownPassingDelayMs: 900, knownFailingDelayMs: 1200, contradictory: false });
  });

  it('selects highest passing and lowest failing values independent of completion order', () => {
    const bounds = aggregateMinimisationDelayBounds({
      existingPassingDelayMs: 500,
      existingFailingDelayMs: 1500,
      candidates: [
        { variableName: 'paymentDelayMs', candidateValue: 1200, result: 'FAILURE_REPRODUCED' },
        { variableName: 'paymentDelayMs', candidateValue: 700, result: 'FAILURE_NOT_REPRODUCED' },
        { variableName: 'paymentDelayMs', candidateValue: 900, result: 'FAILURE_NOT_REPRODUCED' },
        { variableName: 'paymentDelayMs', candidateValue: 1100, result: 'FAILURE_REPRODUCED' },
      ],
    });
    expect(bounds).toMatchObject({ knownPassingDelayMs: 900, knownFailingDelayMs: 1100 });
  });

  it('ignores null, infrastructure, inconclusive, and non-delay candidates without erasing bounds', () => {
    const bounds = aggregateMinimisationDelayBounds({
      existingPassingDelayMs: 900,
      existingFailingDelayMs: 1200,
      candidates: [
        { variableName: 'paymentDelayMs', candidateValue: 1000, result: null },
        { variableName: 'paymentDelayMs', candidateValue: 1000, result: 'EXECUTION_FAILED' },
        { variableName: 'paymentDelayMs', candidateValue: 1000, result: 'INCONCLUSIVE' },
        { variableName: 'doubleSubmit', candidateValue: false, result: 'FAILURE_NOT_REPRODUCED' },
      ],
    });
    expect(bounds).toMatchObject({ knownPassingDelayMs: 900, knownFailingDelayMs: 1200, evidence: [] });
  });

  it('is idempotent when reprocessing the same candidate evidence', () => {
    const candidates = [{ variableName: 'paymentDelayMs', candidateValue: 900, result: 'FAILURE_NOT_REPRODUCED' }];
    const first = aggregateMinimisationDelayBounds({ candidates });
    const second = aggregateMinimisationDelayBounds({
      ...(first.knownPassingDelayMs !== undefined ? { existingPassingDelayMs: first.knownPassingDelayMs } : {}),
      ...(first.knownFailingDelayMs !== undefined ? { existingFailingDelayMs: first.knownFailingDelayMs } : {}),
      candidates,
    });
    expect(second).toMatchObject(first);
  });

  it('marks contradictory structured evidence as unsafe to backfill', () => {
    const bounds = aggregateMinimisationDelayBounds({
      candidates: [
        { variableName: 'paymentDelayMs', candidateValue: 1200, result: 'FAILURE_NOT_REPRODUCED' },
        { variableName: 'paymentDelayMs', candidateValue: 900, result: 'FAILURE_REPRODUCED' },
      ],
    });
    expect(bounds.contradictory).toBe(true);
  });

  it('serializes only established structured bounds', () => {
    expect(boundedRangeFromAggregatedBounds({ knownFailingDelayMs: 1200, contradictory: false, evidence: [] }, 100)).toEqual({
      upperFailingBoundMs: 1200,
      targetPrecisionMs: 100,
    });
  });
});
