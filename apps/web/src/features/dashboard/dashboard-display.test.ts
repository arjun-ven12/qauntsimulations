import { describe, expect, it } from 'vitest';
import {
  compactFindingTitle,
  compactInvestigationTitle,
  displayProjectName,
} from './dashboard-display.js';

describe('dashboard display names', () => {
  it('maps only the legacy seeded demo display name', () => {
    expect(displayProjectName('TaskOS Demo Commerce')).toBe('Checkout Reliability Lab');
    expect(displayProjectName('Commerce Operations')).toBe('Commerce Operations');
  });

  it('turns long prompt-like investigation names into a concise project label', () => {
    expect(compactInvestigationTitle(
      'Test the checkout flow under delayed payment responses and repeated user interaction.',
      'TaskOS Demo Commerce',
    )).toBe('Checkout Reliability Lab investigation');
  });

  it('shortens titles only at word boundaries', () => {
    const title = compactFindingTitle(
      'Payment retry handling under a deliberately prolonged simulated gateway response',
    );

    expect(title).toMatch(/…$/);
    expect(title).not.toMatch(/cre$/);
  });
});
