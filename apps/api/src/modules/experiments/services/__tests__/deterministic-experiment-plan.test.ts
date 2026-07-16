import { demoCreateInvestigationInput } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import { DeterministicExperimentPlanService } from '../deterministic-experiment-plan.service.js';

describe('DeterministicExperimentPlanService', () => {
  it('generates four stable, reasoned worlds with unique seeds', () => {
    const plan = new DeterministicExperimentPlanService().create(demoCreateInvestigationInput, 'scenario_duplicate_submission');
    expect(plan.worlds).toHaveLength(4);
    expect(plan.worlds.map((world) => world.creationOrder)).toEqual([0, 1, 2, 3]);
    expect(new Set(plan.worlds.map((world) => world.randomSeed)).size).toBe(4);
    expect(plan.worlds.every((world) => world.reason.length > 0)).toBe(true);
    expect(plan.worlds[2]).toMatchObject({ duplicateSubmissionBug: true, paymentDelayMs: 1200, expectedOutcome: 'INVARIANT_VIOLATION' });
    expect(plan.maximumConcurrentWorkers).toBe(2);
  });

  it('respects lower world and concurrency limits', () => {
    const input = {
      ...demoCreateInvestigationInput,
      scenario: { ...demoCreateInvestigationInput.scenario, controls: { ...demoCreateInvestigationInput.scenario.controls, maximumWorlds: 2, maximumConcurrentWorkers: 1 } },
    };
    const plan = new DeterministicExperimentPlanService().create(input, 'scenario_duplicate_submission');
    expect(plan.worlds).toHaveLength(2);
    expect(plan.maximumConcurrentWorkers).toBe(1);
  });
});
