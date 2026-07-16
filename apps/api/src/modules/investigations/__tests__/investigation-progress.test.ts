import { investigationProgressSchema } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import { mapProgress } from '../investigations.mapper.js';

describe('investigation progress mapping', () => {
  it('returns canonical ISO events and terminal counters', () => {
    const result = mapProgress({
      id: 'investigation_test',
      status: 'COMPLETED',
      worlds: [{ id: 'one' }, { id: 'two' }, { id: 'three' }, { id: 'four' }],
      experiments: [{ status: 'PASSED' }, { status: 'PASSED' }, { status: 'FAILED' }, { status: 'FAILED' }],
      events: [{ id: 'event_one', type: 'investigation_completed', occurredAt: new Date('2026-07-15T00:00:00.000Z'), data: { message: 'Completed.', worldId: 'four', count: 4 } }],
      findingsCount: 1,
    });
    expect(investigationProgressSchema.parse(result)).toEqual(result);
    expect(result.progress).toEqual({ totalWorlds: 4, queued: 0, running: 0, passed: 2, failed: 2, flaky: 0 });
    expect(result.recentEvents[0]?.createdAt).toBe('2026-07-15T00:00:00.000Z');
  });

  it('never emits negative counters', () => {
    const result = mapProgress({ id: 'investigation_empty', status: 'PLANNING', worlds: [], experiments: [], events: [], findingsCount: 0 });
    expect(Object.values(result.progress).every((value) => value >= 0)).toBe(true);
  });
});
