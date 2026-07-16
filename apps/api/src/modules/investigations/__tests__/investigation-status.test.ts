import { describe, expect, it } from 'vitest';
import { canTransitionInvestigation } from '../investigation-status.js';

describe('investigation status transitions', () => {
  it('allows the local milestone lifecycle', () => {
    expect(canTransitionInvestigation('PLANNING', 'QUEUED')).toBe(true);
    expect(canTransitionInvestigation('QUEUED', 'RUNNING')).toBe(true);
    expect(canTransitionInvestigation('RUNNING', 'OBSERVING')).toBe(true);
    expect(canTransitionInvestigation('OBSERVING', 'COMPLETED')).toBe(true);
  });
  it('prevents terminal investigations restarting', () => {
    expect(canTransitionInvestigation('COMPLETED', 'RUNNING')).toBe(false);
    expect(canTransitionInvestigation('FAILED', 'RUNNING')).toBe(false);
  });
});
