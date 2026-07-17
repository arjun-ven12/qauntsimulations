import type {
  ExperimentPlanner,
  PlannerContext,
  PlannerGenerationResult,
  PlannerRequest,
} from '../../contracts/experiment-planner.types.js';
import {
  experimentPlannerPromptVersion,
  experimentPlannerSystemPrompt,
} from '../../prompts/experiment-planner.prompt.js';
import { generatedExperimentPlanSchema } from '../../schemas/generated-experiment-plan.schema.js';
import type { OpenAIClient } from './openai.client.js';

export class OpenAIExperimentPlanner implements ExperimentPlanner {
  readonly provider = 'OPENAI' as const;

  constructor(
    private readonly client: OpenAIClient,
    private readonly model: string,
  ) {}

  async generatePlan(
    request: PlannerRequest,
    context: PlannerContext,
  ): Promise<PlannerGenerationResult> {
    const started = Date.now();
    try {
      const parsed = await this.client.parseStructuredOutput(
        this.model,
        `${experimentPlannerSystemPrompt}\n\nPrompt version: ${experimentPlannerPromptVersion}`,
        request,
        generatedExperimentPlanSchema,
        'taskos_experiment_plan',
        {
          maxOutputTokens: context.maxOutputTokens,
          ...(context.signal ? { signal: context.signal } : {}),
        },
      );
      return {
        provider: 'OPENAI',
        status: 'VALIDATING',
        model: this.model,
        output: parsed.output,
        durationMs: Date.now() - started,
        usage: parsed.usage ? { ...parsed.usage, providerRequestCount: 1 } : { providerRequestCount: 1 },
      };
    } catch (error) {
      return {
        provider: 'OPENAI',
        status: 'FAILED',
        model: this.model,
        durationMs: Date.now() - started,
        usage: { providerRequestCount: 1 },
        error: {
          code: error instanceof Error && error.name.includes('Timeout') ? 'PlannerTimeoutError' : 'PlannerProviderError',
          message: error instanceof Error ? error.message.slice(0, 500) : 'OpenAI planner failed',
        },
      };
    }
  }
}
