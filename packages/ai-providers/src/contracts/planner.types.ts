import type { ExperimentPlan, WorldConfig } from '@taskos/shared-types';

export interface PlanningRequest {
  objective: string; journeyId: string; scenarioId: string; worldPack: string;
  invariantIds: string[]; safetyConstraints: Array<{ type: string; value: unknown; description?: string }>;
}
export interface FollowUpRequest { plan: ExperimentPlan; failingWorld: WorldConfig; failureKind: string }
