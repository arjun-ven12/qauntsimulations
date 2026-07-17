import { investigationProgressSchema } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import { mapProgress } from '../investigations.mapper.js';

const world = (id: string, status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED', experimentStatus: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR') => ({
  id,
  status,
  experiments: [{
    status: experimentStatus,
    evaluations: experimentStatus === 'PASSED' ? [{ passed: true, executionAttemptId: 'attempt' }] : experimentStatus === 'FAILED' ? [{ passed: false, executionAttemptId: 'attempt' }] : [],
    attempts: [{ id: 'attempt', status: experimentStatus, result: experimentStatus === 'PASSED' ? { status: 'PASSED' } : experimentStatus === 'FAILED' ? { status: 'INVARIANT_VIOLATION' } : experimentStatus === 'ERROR' ? { status: 'RUNNER_ERROR' } : null, completedAt: ['PASSED', 'FAILED', 'ERROR'].includes(experimentStatus) ? new Date() : null }],
  }],
});

describe('investigation progress mapping', () => {
  it('returns canonical ISO events and terminal counters', () => {
    const result = mapProgress({
      id: 'investigation_test',
      status: 'COMPLETED',
      worlds: [world('one', 'COMPLETED', 'PASSED'), world('two', 'COMPLETED', 'PASSED'), world('three', 'COMPLETED', 'FAILED'), world('four', 'COMPLETED', 'FAILED')],
      experiments: [{ status: 'PASSED' }, { status: 'PASSED' }, { status: 'FAILED' }, { status: 'FAILED' }],
      events: [{ id: 'event_one', type: 'investigation_completed', occurredAt: new Date('2026-07-15T00:00:00.000Z'), data: { message: 'Completed.', worldId: 'four', count: 4 } }],
      findingsCount: 1,
    });
    expect(investigationProgressSchema.parse(result)).toEqual(result);
    expect(result.progress).toEqual({ totalWorlds: 4, queued: 0, running: 0, passed: 4, failed: 0, flaky: 0 });
    expect(result.recentEvents[0]?.createdAt).toBe('2026-07-15T00:00:00.000Z');
  });

  it('never emits negative counters', () => {
    const result = mapProgress({ id: 'investigation_empty', status: 'PLANNING', worlds: [], experiments: [], events: [], findingsCount: 0 });
    expect(Object.values(result.progress).every((value) => value >= 0)).toBe(true);
  });

  it('derives progress from current worlds and keeps unknown adaptive events readable', () => {
    const result = mapProgress({
      id: 'investigation_adaptive',
      status: 'REPRODUCING',
      worlds: [
        world('world_initial_passed', 'COMPLETED', 'PASSED'),
        world('world_initial_failed', 'COMPLETED', 'FAILED'),
        world('world_reproduction_running', 'RUNNING', 'RUNNING'),
        world('world_reproduction_queued', 'QUEUED', 'QUEUED'),
        world('world_reproduction_queued_two', 'QUEUED', 'QUEUED'),
      ],
      experiments: [
        { status: 'PASSED' },
        { status: 'FAILED' },
        { status: 'RUNNING' },
        { status: 'QUEUED' },
        { status: 'QUEUED' },
      ],
      events: [
        {
          id: 'event_adaptive_world_generated',
          type: 'adaptive_world_generated',
          occurredAt: new Date('2026-07-15T00:00:00.000Z'),
          data: { worldId: 'world_reproduction_queued', confidence: 0.55 },
        },
        {
          id: 'event_unknown',
          type: 'future_prompt_6_event',
          occurredAt: new Date('2026-07-15T00:00:01.000Z'),
          data: {},
        },
      ],
      findingsCount: 1,
    });

    expect(investigationProgressSchema.parse(result)).toEqual(result);
    expect(result.status).toBe('REPRODUCING');
    expect(result.progress).toEqual({ totalWorlds: 5, queued: 2, running: 1, passed: 2, failed: 0, flaky: 0 });
    expect(result.recentEvents[0]).toMatchObject({
      type: 'adaptive_world_generated',
      message: 'adaptive world generated',
      worldId: 'world_reproduction_queued',
      metadata: { confidence: 0.55 },
    });
    expect(result.recentEvents[1]).toMatchObject({
      type: 'future_prompt_6_event',
      message: 'future prompt 6 event',
    });
  });
});
