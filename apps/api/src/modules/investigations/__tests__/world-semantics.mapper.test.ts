import { describe, expect, it } from 'vitest';
import { mapWorldList } from '../investigations.mapper.js';

const timestamp = new Date('2026-07-17T12:00:00.000Z');

function mapped(input: {
  origin?: string;
  worldStatus?: string;
  experimentStatus?: string;
  attemptStatus?: string;
  workerResultStatus?: string;
  evaluations?: boolean[];
  completed?: boolean;
}) {
  const attemptId = 'attempt-1';
  return mapWorldList([{
    id: 'world-1',
    investigationId: 'investigation-1',
    status: input.worldStatus ?? 'COMPLETED',
    reason: 'Sanitized regression fixture',
    configuration: { origin: input.origin ?? 'INITIAL', name: 'Fixture world' },
    createdAt: timestamp,
    updatedAt: timestamp,
    experiments: [{
      id: 'experiment-1',
      status: input.experimentStatus ?? 'PASSED',
      evaluations: (input.evaluations ?? [true]).map((passed) => ({ passed, executionAttemptId: attemptId })),
      attempts: [{
        id: attemptId,
        status: input.attemptStatus ?? input.experimentStatus ?? 'PASSED',
        result: input.workerResultStatus ? { status: input.workerResultStatus } : null,
        workerId: 'worker-1',
        startedAt: timestamp,
        completedAt: input.completed === false ? null : timestamp,
      }],
    }],
  }])[0]!;
}

describe('public world execution and business semantics', () => {
  it('maps completed execution with all invariants passing', () => {
    expect(mapped({ workerResultStatus: 'PASSED', evaluations: [true, true] })).toMatchObject({ executionState: 'COMPLETED', businessOutcome: 'PASS' });
  });

  it('aggregates one or more invariant violations as business FAIL', () => {
    expect(mapped({ workerResultStatus: 'INVARIANT_VIOLATION', experimentStatus: 'FAILED', evaluations: [true, false] })).toMatchObject({ executionState: 'COMPLETED', businessOutcome: 'FAIL' });
  });

  it('does not use worker process completion as business PASS', () => {
    expect(mapped({ workerResultStatus: 'PASSED', evaluations: [false] })).toMatchObject({ executionState: 'COMPLETED', businessOutcome: 'FAIL' });
  });

  it('does not use invariant failure as execution FAILED', () => {
    expect(mapped({ worldStatus: 'FAILED', workerResultStatus: 'INVARIANT_VIOLATION', experimentStatus: 'FAILED', evaluations: [false] })).toMatchObject({ executionState: 'COMPLETED', businessOutcome: 'FAIL' });
  });

  it('maps worker infrastructure failure to FAILED / INCONCLUSIVE', () => {
    expect(mapped({ worldStatus: 'FAILED', workerResultStatus: 'RUNNER_ERROR', experimentStatus: 'ERROR', attemptStatus: 'ERROR', evaluations: [true] })).toMatchObject({ executionState: 'FAILED', businessOutcome: 'INCONCLUSIVE' });
  });

  it('maps cancellation to CANCELLED / INCONCLUSIVE', () => {
    expect(mapped({ worldStatus: 'CANCELLED', experimentStatus: 'CANCELLED', attemptStatus: 'CANCELLED', evaluations: [] })).toMatchObject({ executionState: 'CANCELLED', businessOutcome: 'INCONCLUSIVE' });
  });

  it('keeps missing invariant output inconclusive after completed execution', () => {
    expect(mapped({ workerResultStatus: 'PASSED', evaluations: [] })).toMatchObject({ executionState: 'COMPLETED', businessOutcome: 'INCONCLUSIVE' });
  });

  it.each(['INITIAL', 'ADAPTIVE_REPRODUCTION', 'MINIMISATION'])('uses one derivation path for %s worlds', (origin) => {
    expect(mapped({ origin, workerResultStatus: 'INVARIANT_VIOLATION', experimentStatus: 'FAILED', evaluations: [false] })).toMatchObject({ executionState: 'COMPLETED', businessOutcome: 'FAIL' });
  });
});
