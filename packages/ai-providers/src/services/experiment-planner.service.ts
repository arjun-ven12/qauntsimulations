import type { AIProvider } from '../contracts/ai-provider.js';
import type { PlanningRequest } from '../contracts/planner.types.js';
export class ExperimentPlannerService { constructor(private readonly provider: AIProvider) {} plan(request: PlanningRequest) { return this.provider.generateExperimentPlan(request); } }
