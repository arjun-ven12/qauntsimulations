import type { z } from 'zod';
import type { generatedExperimentPlanSchema } from '../schemas/generated-experiment-plan.schema.js';

export type PlannerProvider = 'DETERMINISTIC' | 'OPENAI' | 'FALLBACK';
export type PlannerStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'VALIDATING'
  | 'ACCEPTED'
  | 'PARTIALLY_ACCEPTED'
  | 'REJECTED'
  | 'FALLBACK_USED'
  | 'FAILED';

export type GeneratedExperimentPlan = z.infer<typeof generatedExperimentPlanSchema>;

export interface PlannerRequest {
  scenarioPrompt: string;
  project: { id: string; name: string };
  environment: { id: string; name: string };
  journey: { id: string; name: string; supportedVariables: string[] };
  controls: {
    allowedBrowsers: string[];
    allowedViewports: string[];
    allowedNetworkProfiles: string[];
    maximumWorlds: number;
    maximumConcurrentWorkers: number;
  };
  invariants: Array<{ id: string; name: string; description?: string }>;
  supportedFaults: Array<{ id: string; type: string; allowedValues: unknown }>;
}

export interface PlannerContext {
  plannerVersion: string;
  model?: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxAttempts: number;
  signal?: AbortSignal;
}

export interface PlannerUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerRequestCount: number;
}

export interface PlannerGenerationResult {
  provider: PlannerProvider;
  status: PlannerStatus;
  model?: string;
  output?: GeneratedExperimentPlan;
  durationMs: number;
  usage?: PlannerUsage;
  error?: {
    code: string;
    message: string;
  };
}

export interface ExperimentPlanner {
  readonly provider: PlannerProvider;
  generatePlan(
    request: PlannerRequest,
    context: PlannerContext,
  ): Promise<PlannerGenerationResult>;
}
