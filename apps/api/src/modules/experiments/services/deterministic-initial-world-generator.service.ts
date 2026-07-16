import type { DeterministicExperimentPlan, DeterministicWorldDefinition } from './deterministic-experiment-plan.service.js';

export class DeterministicInitialWorldGeneratorService {
  generate(plan: DeterministicExperimentPlan): DeterministicWorldDefinition[] {
    return plan.worlds.map((world) => ({ ...world }));
  }
}
