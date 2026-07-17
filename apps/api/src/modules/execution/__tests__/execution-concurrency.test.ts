import { describe, expect, it } from 'vitest';
import { ExecutionConcurrencyService } from '../execution-concurrency.service.js';

describe('ExecutionConcurrencyService', () => {
  it('never exceeds the limit, continues after failure, and preserves association', async () => {
    let active = 0; let peak = 0;
    const results = await new ExecutionConcurrencyService(2).run([1, 2, 3, 4], 4, async (item) => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (item === 2) throw new Error('expected');
      return `result-${item}`;
    });
    expect(peak).toBe(2);
    expect(results.map(({ item }) => item)).toEqual([1, 2, 3, 4]);
    expect(results[1]?.error).toBeInstanceOf(Error);
    expect(results[3]?.result).toBe('result-4');
  });

  it('does not start queued work after cancellation', async () => {
    let started = 0; let cancelled = false;
    const results = await new ExecutionConcurrencyService(1).run([1, 2, 3], 1, async (item) => {
      started++;
      cancelled = true;
      return item;
    }, async () => cancelled);
    expect(started).toBe(1);
    expect(results).toHaveLength(1);
  });
});
