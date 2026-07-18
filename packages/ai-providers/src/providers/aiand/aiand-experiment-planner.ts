import { ZodError } from 'zod';
import { z } from 'zod';
import type { ExperimentPlanner, PlannerContext, PlannerGenerationResult, PlannerRequest } from '../../contracts/experiment-planner.types.js';
import { experimentPlannerPromptVersion } from '../../prompts/experiment-planner.prompt.js';
import { generatedExperimentPlanSchema } from '../../schemas/generated-experiment-plan.schema.js';
import { AiAndResponseError, type AiAndApiSurface, type AiAndClient, type AiAndResponseFormat } from './aiand.client.js';

const aiAndMinimalPlannerSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  hypothesis: z.string().trim().min(1).max(500),
  selectedDimensions: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(240),
  }).strict()).min(1).max(8),
  worlds: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    purpose: z.string().trim().min(1).max(300),
    hypothesis: z.string().trim().min(1).max(300),
    dimensions: z.record(z.union([z.string().max(120), z.number().finite(), z.boolean()])).refine((value) => Object.keys(value).length <= 12, 'World dimensions must be bounded.'),
    expectedObservation: z.string().trim().min(1).max(300),
  }).strict()).length(4),
}).strict();

type AiAndMinimalPlannerOutput = z.infer<typeof aiAndMinimalPlannerSchema>;

const outputInstructions = `
Return one concise JSON object only. Design exactly four initial worlds.
Use only these dimension keys when relevant: browser, viewport, networkProfile, userProfile, paymentDelayMs, duplicateSubmissionBug, doubleSubmit, doubleSubmitIntervalMs, expectedOutcome.
Use allowed values from the user message. Do not include IDs, timestamps, statuses, evidence, provider metadata, execution metadata, or prose outside JSON.`;

export class AiAndExperimentPlanner implements ExperimentPlanner {
  readonly provider = 'AIAND' as const;

  constructor(
    private readonly client: AiAndClient,
    private readonly model: string,
    private readonly apiSurface: AiAndApiSurface = 'CHAT_COMPLETIONS',
  ) {}

  async generatePlan(request: PlannerRequest, context: PlannerContext): Promise<PlannerGenerationResult> {
    const started = Date.now();
    try {
      const completion = await this.createCompletion(request, context, { type: 'json_schema', json_schema: aiAndMinimalJsonSchemaResponse });
      const candidate = extractAiAndJson(completion.content);
      const minimal = aiAndMinimalPlannerSchema.parse(JSON.parse(candidate) as unknown);
      const output = mapMinimalOutputToGeneratedPlan(minimal, request);
      return {
        provider: 'AIAND',
        status: 'VALIDATING',
        model: this.model,
        output,
        durationMs: Date.now() - started,
        usage: completion.usage ? { ...completion.usage, providerRequestCount: completion.providerRequestCount } : { providerRequestCount: completion.providerRequestCount },
        providerDiagnostics: completion.diagnostics,
      };
    } catch (error) {
      if (isStrictSchemaCompatibilityError(error)) {
        try {
          const completion = await this.createCompletion(request, context, { type: 'json_object' }, 2);
          const candidate = extractAiAndJson(completion.content);
          const minimal = aiAndMinimalPlannerSchema.parse(JSON.parse(candidate) as unknown);
          const output = mapMinimalOutputToGeneratedPlan(minimal, request);
          return {
            provider: 'AIAND',
            status: 'VALIDATING',
            model: this.model,
            output,
            durationMs: Date.now() - started,
            usage: completion.usage ? { ...completion.usage, providerRequestCount: completion.providerRequestCount } : { providerRequestCount: completion.providerRequestCount },
            providerDiagnostics: { ...completion.diagnostics, strictJsonSchemaRejected: true },
          };
        } catch (retryError) {
          const normalized = normalizeAiAndPlannerError(retryError);
          return {
            provider: 'AIAND',
            status: 'FAILED',
            model: this.model,
            durationMs: Date.now() - started,
            usage: { providerRequestCount: 2 },
            error: normalized,
          };
        }
      }
      const normalized = normalizeAiAndPlannerError(error);
      return {
        provider: 'AIAND',
        status: 'FAILED',
        model: this.model,
        durationMs: Date.now() - started,
        usage: { providerRequestCount: 1 },
        error: normalized,
        ...(error instanceof AiAndResponseError && error.diagnostics ? { providerDiagnostics: error.diagnostics } : {}),
      };
    }
  }

  private async createCompletion(
    request: PlannerRequest,
    context: PlannerContext,
    responseFormat: AiAndResponseFormat,
    providerRequestCount = 1,
  ) {
    const create = context.streamingEnabled
      ? this.client.createStreamingPlanCompletion.bind(this.client)
      : this.apiSurface === 'RESPONSES'
      ? this.client.createPlanResponse.bind(this.client)
      : this.client.createPlanCompletion.bind(this.client);
    const completion = await create(
        this.model,
        `${compactAiAndSystemPrompt()}\n\nPrompt version: ${experimentPlannerPromptVersion}\n${outputInstructions}`,
        compactAiAndInput(request),
        {
          maxCompletionTokens: context.maxOutputTokens,
          timeoutMs: context.timeoutMs,
          ...(context.idleTimeoutMs ? { idleTimeoutMs: context.idleTimeoutMs } : {}),
          ...(context.reasoningEffort ? { reasoningEffort: context.reasoningEffort } : {}),
          responseFormat,
          ...(context.signal ? { signal: context.signal } : {}),
        },
      );
    return { ...completion, providerRequestCount };
  }
}

export function extractAiAndJson(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1]?.trim();
  if (fenced?.startsWith('{') && fenced.endsWith('}')) return fenced;
  throw new AiAndResponseError('MALFORMED_RESPONSE', 'ai& response was not a single JSON object.');
}

export function normalizeAiAndPlannerError(error: unknown): { code: string; message: string } {
  if (error instanceof AiAndResponseError) return { code: error.code, message: error.message };
  if (error instanceof SyntaxError) return { code: 'MALFORMED_RESPONSE', message: 'ai& returned invalid JSON.' };
  if (error instanceof ZodError) return { code: 'PLAN_SCHEMA_INVALID', message: 'ai& output did not match the experiment-plan schema.' };
  const candidate = error as { status?: unknown; name?: unknown; message?: unknown; cause?: { code?: unknown; name?: unknown; message?: unknown } };
  const status = typeof candidate?.status === 'number' ? candidate.status : undefined;
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  const timeoutEvidence = [name, candidate?.message, candidate?.cause?.code, candidate?.cause?.name, candidate?.cause?.message]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => /timeout|timed out|etimedout|und_err_connect_timeout/i.test(value));
  if (status === 401 || status === 403) return { code: 'AUTHENTICATION_ERROR', message: 'ai& authentication failed.' };
  if (status === 400 && isResponseFormatError(candidate)) return { code: 'RESPONSE_FORMAT_UNSUPPORTED', message: 'ai& rejected strict JSON Schema response format.' };
  if (status === 404) return { code: 'MODEL_UNAVAILABLE', message: 'The configured ai& model is unavailable.' };
  if (status === 429) return { code: 'RATE_LIMITED', message: 'ai& rate limit was reached.' };
  if (timeoutEvidence || name === 'AbortError') return { code: 'TIMEOUT', message: 'ai& planner request timed out.' };
  if (status !== undefined && status >= 500) return { code: 'PROVIDER_UNAVAILABLE', message: 'ai& is temporarily unavailable.' };
  return { code: 'UNKNOWN_PROVIDER_ERROR', message: 'ai& planner request failed.' };
}

function isStrictSchemaCompatibilityError(error: unknown): boolean {
  if (error instanceof AiAndResponseError) return error.code === 'RESPONSE_FORMAT_UNSUPPORTED';
  const candidate = error as { status?: unknown; message?: unknown; body?: unknown; error?: { message?: unknown } };
  return candidate.status === 400 && isResponseFormatError(candidate);
}

function isResponseFormatError(error: { message?: unknown; body?: unknown; error?: { message?: unknown } }): boolean {
  const evidence = [error.message, error.body, error.error?.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return /response_format|json_schema|schema|strict/i.test(evidence);
}

const aiAndMinimalJsonSchemaResponse = {
  name: 'rift_experiment_strategy',
  description: 'A minimal RIFT initial experiment strategy that RIFT will validate and map to persisted worlds.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'hypothesis', 'selectedDimensions', 'worlds'],
    properties: {
      summary: { type: 'string', minLength: 1, maxLength: 500 },
      hypothesis: { type: 'string', minLength: 1, maxLength: 500 },
      selectedDimensions: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'reason'],
          properties: {
            key: { type: 'string', minLength: 1, maxLength: 80 },
            reason: { type: 'string', minLength: 1, maxLength: 240 },
          },
        },
      },
      worlds: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'purpose', 'hypothesis', 'dimensions', 'expectedObservation'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            purpose: { type: 'string', minLength: 1, maxLength: 300 },
            hypothesis: { type: 'string', minLength: 1, maxLength: 300 },
            dimensions: {
              type: 'object',
              additionalProperties: {
                anyOf: [
                  { type: 'string', maxLength: 120 },
                  { type: 'number' },
                  { type: 'boolean' },
                ],
              },
              maxProperties: 12,
            },
            expectedObservation: { type: 'string', minLength: 1, maxLength: 300 },
          },
        },
      },
    },
  },
};

function compactAiAndSystemPrompt(): string {
  return 'You are RIFT’s experiment planner. Return only valid JSON matching the schema. Create concise, executable initial checkout test worlds. Deterministic RIFT validation remains authoritative.';
}

function compactAiAndInput(request: PlannerRequest) {
  const invariant = request.invariants.map((item) => item.description ? `${item.name}: ${item.description}` : item.name).join('; ');
  return {
    objective: request.scenarioPrompt,
    invariant,
    target: {
      project: request.project.name,
      environment: request.environment.name,
      origin: request.environment.origin,
    },
    environmentContext: request.environment.intelligence ? {
      provider: request.environment.intelligence.provider,
      title: request.environment.intelligence.title,
      headings: request.environment.intelligence.headings,
      controls: request.environment.intelligence.controls,
      detectedJourneys: request.environment.intelligence.detectedJourneys,
      visibleTextSummary: request.environment.intelligence.visibleTextSummary,
      note: 'Observed public page context from Oxylabs; incomplete and non-authoritative.',
    } : undefined,
    allowed: {
      worlds: request.controls.maximumWorlds,
      browsers: request.controls.allowedBrowsers,
      viewports: request.controls.allowedViewports,
      networkProfiles: request.controls.allowedNetworkProfiles,
      userProfiles: ['normal', 'impatient'],
      paymentDelayMs: { min: 0, max: 10_000 },
      doubleSubmitIntervalMs: { min: 0, max: 5_000 },
      expectedOutcome: ['PASS', 'INVARIANT_VIOLATION', 'OBSERVE'],
    },
    safety: request.safety ? {
      domainAllowlist: request.safety.domainAllowlist,
      allowedHttpMethods: request.safety.allowedHttpMethods,
      permitCheckoutSubmission: request.safety.permitCheckoutSubmission,
      permitMockPayment: request.safety.permitMockPayment,
      prohibitedActions: request.safety.prohibitedActions,
    } : undefined,
    output: 'Exactly four worlds. Include one healthy baseline and varied delay/repeated-submit/mobile combinations.',
  };
}

function mapMinimalOutputToGeneratedPlan(minimal: AiAndMinimalPlannerOutput, request: PlannerRequest) {
  const output = {
    objective: minimal.summary,
    explanation: minimal.hypothesis,
    assumptions: ['RIFT supplied authoritative environment, Journey, invariant, and safety constraints.'],
    variables: minimal.selectedDimensions.slice(0, 6).map((dimension, index) => ({
      name: dimension.key,
      reason: dimension.reason,
      priority: index < 2 ? 'HIGH' : index < 4 ? 'MEDIUM' : 'LOW',
    })),
    worlds: minimal.worlds.map((world, index) => {
      const dimensions = world.dimensions;
      const value = (key: string): unknown => dimensions[key];
      const expected = typeof value('expectedOutcome') === 'string' ? String(value('expectedOutcome')) : expectedOutcomeFromObservation(world.expectedObservation);
      return {
        name: world.name,
        purpose: world.purpose,
        browser: stringDimension(value('browser'), request.controls.allowedBrowsers[0] ?? 'chromium'),
        viewport: stringDimension(value('viewport'), request.controls.allowedViewports[index % Math.max(1, request.controls.allowedViewports.length)] ?? 'desktop-1440x900'),
        networkProfile: stringDimension(value('networkProfile'), request.controls.allowedNetworkProfiles[0] ?? 'normal'),
        userProfile: stringDimension(value('userProfile'), booleanDimension(value('doubleSubmit'), false) ? 'impatient' : 'normal'),
        paymentDelayMs: numberDimension(value('paymentDelayMs'), 0),
        duplicateSubmissionBug: booleanDimension(value('duplicateSubmissionBug'), expected === 'INVARIANT_VIOLATION'),
        doubleSubmit: booleanDimension(value('doubleSubmit'), /repeat|double|multiple/i.test(world.purpose)),
        doubleSubmitIntervalMs: numberDimension(value('doubleSubmitIntervalMs'), booleanDimension(value('doubleSubmit'), false) ? 100 : 0),
        expectedOutcome: ['PASS', 'INVARIANT_VIOLATION', 'OBSERVE'].includes(expected) ? expected : 'OBSERVE',
        reason: `${world.hypothesis} Expected: ${world.expectedObservation}`.slice(0, 1_000),
      };
    }),
    warnings: [],
  };
  return generatedExperimentPlanSchema.parse(output);
}

function stringDimension(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length ? value.trim() : fallback;
}

function numberDimension(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function booleanDimension(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function expectedOutcomeFromObservation(value: string): 'PASS' | 'INVARIANT_VIOLATION' | 'OBSERVE' {
  if (/violation|duplicate|fail/i.test(value)) return 'INVARIANT_VIOLATION';
  if (/pass|single|accepted at most once|no duplicate/i.test(value)) return 'PASS';
  return 'OBSERVE';
}
