import { ZodError } from 'zod';
import type { ExperimentPlanner, PlannerContext, PlannerGenerationResult, PlannerRequest } from '../../contracts/experiment-planner.types.js';
import { experimentPlannerPromptVersion, experimentPlannerSystemPrompt } from '../../prompts/experiment-planner.prompt.js';
import { generatedExperimentPlanSchema } from '../../schemas/generated-experiment-plan.schema.js';
import { KimiResponseError, type KimiClient } from './kimi.client.js';

const outputInstructions = `
Return one JSON object only, without Markdown or commentary, with exactly this shape:
{"objective":"string","explanation":"string","assumptions":["string"],"variables":[{"name":"string","reason":"string","priority":"HIGH|MEDIUM|LOW"}],"worlds":[{"name":"string","purpose":"string","browser":"allowed value","viewport":"allowed value","networkProfile":"allowed value","userProfile":"normal|impatient","paymentDelayMs":0,"duplicateSubmissionBug":false,"doubleSubmit":false,"doubleSubmitIntervalMs":100,"expectedOutcome":"PASS|INVARIANT_VIOLATION|OBSERVE","reason":"string"}],"warnings":["string"]}
Do not wrap the JSON in a code fence.`;

export class KimiExperimentPlanner implements ExperimentPlanner {
  readonly provider = 'KIMI' as const;

  constructor(private readonly client: KimiClient, private readonly model: string) {}

  async generatePlan(request: PlannerRequest, context: PlannerContext): Promise<PlannerGenerationResult> {
    const started = Date.now();
    try {
      const completion = await this.client.createPlanCompletion(
        this.model,
        `${experimentPlannerSystemPrompt}\n\nPrompt version: ${experimentPlannerPromptVersion}\n${outputInstructions}`,
        request,
        {
          maxOutputTokens: context.maxOutputTokens,
          timeoutMs: context.timeoutMs,
          ...(context.signal ? { signal: context.signal } : {}),
        },
      );
      const candidate = extractJson(completion.content);
      const output = generatedExperimentPlanSchema.parse(JSON.parse(candidate) as unknown);
      return {
        provider: 'KIMI',
        status: 'VALIDATING',
        model: this.model,
        output,
        durationMs: Date.now() - started,
        usage: completion.usage ? { ...completion.usage, providerRequestCount: 1 } : { providerRequestCount: 1 },
      };
    } catch (error) {
      const normalized = normalizeKimiPlannerError(error);
      return {
        provider: 'KIMI',
        status: 'FAILED',
        model: this.model,
        durationMs: Date.now() - started,
        usage: { providerRequestCount: 1 },
        error: normalized,
      };
    }
  }
}

export function extractJson(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1]?.trim();
  if (fenced?.startsWith('{') && fenced.endsWith('}')) return fenced;
  throw new KimiResponseError('MALFORMED_RESPONSE', 'Kimi response was not a single JSON object.');
}

export function normalizeKimiPlannerError(error: unknown): { code: string; message: string } {
  if (error instanceof KimiResponseError) return { code: error.code, message: error.message };
  if (error instanceof SyntaxError) return { code: 'MALFORMED_RESPONSE', message: 'Kimi returned invalid JSON.' };
  if (error instanceof ZodError) return { code: 'PLAN_SCHEMA_INVALID', message: 'Kimi output did not match the experiment-plan schema.' };
  const candidate = error as { status?: unknown; name?: unknown };
  const status = typeof candidate?.status === 'number' ? candidate.status : undefined;
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  if (status === 401 || status === 403) return { code: 'AUTHENTICATION_ERROR', message: 'Kimi authentication failed.' };
  if (status === 429) return { code: 'RATE_LIMITED', message: 'Kimi rate limit was reached.' };
  if (name.includes('Timeout') || name === 'AbortError') return { code: 'TIMEOUT', message: 'Kimi planner request timed out.' };
  if (status !== undefined && status >= 500) return { code: 'PROVIDER_UNAVAILABLE', message: 'Kimi is temporarily unavailable.' };
  return { code: 'UNKNOWN_PROVIDER_ERROR', message: 'Kimi planner request failed.' };
}
