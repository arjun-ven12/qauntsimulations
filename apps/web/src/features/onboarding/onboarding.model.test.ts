import { describe, expect, it } from 'vitest';
import { deriveOnboardingProgress } from './onboarding.model.js';

describe('Product onboarding model', () => {
  it('derives the first incomplete setup step and stable Product routes', () => {
    const progress = deriveOnboardingProgress({
      id: 'project-1',
      safetyConfigured: true,
      readyEnvironmentCount: 1,
      readyJourneyCount: 0,
      readyInvariantCount: 0,
    });
    expect(progress).toMatchObject({
      completedCount: 2,
      totalCount: 4,
      percentage: 50,
      complete: false,
      nextStep: {
        id: 'journey',
        href: '/projects/project-1/journeys',
        status: 'CURRENT',
      },
    });
    expect(progress.steps.map((step) => [step.id, step.status, step.href])).toEqual([
      ['safety', 'COMPLETED', '/projects/project-1/safety'],
      ['environment', 'COMPLETED', '/projects/project-1/environments'],
      ['journey', 'CURRENT', '/projects/project-1/journeys'],
      ['invariant', 'UPCOMING', '/projects/project-1/invariants'],
    ]);
  });

  it('marks a fully configured Project complete with no next step', () => {
    const progress = deriveOnboardingProgress({
      id: 'project-ready',
      safetyConfigured: true,
      readyEnvironmentCount: 1,
      readyJourneyCount: 1,
      readyInvariantCount: 2,
    });
    expect(progress.percentage).toBe(100);
    expect(progress.complete).toBe(true);
    expect(progress.nextStep).toBeNull();
    expect(progress.steps.every((step) => step.status === 'COMPLETED')).toBe(true);
  });

  it('starts with Safety and never treats non-READY totals as complete', () => {
    const progress = deriveOnboardingProgress({
      id: 'project-empty',
      safetyConfigured: false,
      readyEnvironmentCount: 0,
      readyJourneyCount: 0,
      readyInvariantCount: 0,
    });
    expect(progress.percentage).toBe(0);
    expect(progress.nextStep?.id).toBe('safety');
    expect(progress.steps.map((step) => step.status)).toEqual([
      'CURRENT',
      'UPCOMING',
      'UPCOMING',
      'UPCOMING',
    ]);
  });
});
