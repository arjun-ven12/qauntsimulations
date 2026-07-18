import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions';
import type { Response, ResponseCreateParamsNonStreaming, ResponseFormatTextConfig } from 'openai/resources/responses/responses';
import type { ResponseFormatJSONSchema } from 'openai/resources/shared';

export interface AiAndClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface AiAndCompletionOptions {
  maxCompletionTokens: number;
  timeoutMs: number;
  idleTimeoutMs?: number;
  reasoningEffort?: AiAndReasoningEffort;
  responseFormat?: AiAndResponseFormat;
  signal?: AbortSignal;
}

export type AiAndReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';
export type AiAndApiSurface = 'CHAT_COMPLETIONS' | 'RESPONSES';
export type AiAndResponseFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: ResponseFormatJSONSchema.JSONSchema };

export interface AiAndResponseDiagnostics {
  responseId: string | null;
  resolvedModel: string | null;
  apiSurface: AiAndApiSurface;
  responseStatus: string | null;
  choiceCount: number;
  finishReason: string | null;
  contentType: 'string' | 'array' | 'null' | 'empty' | 'unknown';
  contentLength: number;
  refusalPresent: boolean;
  toolCallCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  streamEventCount?: number;
  visibleDeltaCount?: number;
  timeToFirstEventMs?: number | null;
  timeToFirstVisibleTokenMs?: number | null;
  durationMs?: number;
  streaming?: boolean;
}

export type AiAndCompletionRequest = ChatCompletionCreateParamsNonStreaming;
export type AiAndCompletionTransport = (
  request: AiAndCompletionRequest,
  options: { timeout: number; signal?: AbortSignal },
) => Promise<ChatCompletion>;
export type AiAndStreamingCompletionRequest = ChatCompletionCreateParamsStreaming;
export type AiAndStreamingCompletionTransport = (
  request: AiAndStreamingCompletionRequest,
  options: { timeout: number; signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<AsyncIterable<ChatCompletionChunk>>;
export type AiAndResponsesRequest = ResponseCreateParamsNonStreaming;
export type AiAndResponsesTransport = (
  request: AiAndResponsesRequest,
  options: { timeout: number; signal?: AbortSignal },
) => Promise<Response>;

export type AiAndModelsTransport = () => Promise<Array<{ id: string }>>;

export class AiAndClient {
  private readonly createCompletion: AiAndCompletionTransport;
  private readonly createStreamingCompletion: AiAndStreamingCompletionTransport;
  private readonly createResponse: AiAndResponsesTransport;
  private readonly listModelsTransport: AiAndModelsTransport;

  constructor(
    readonly config: AiAndClientConfig,
    completionTransport?: AiAndCompletionTransport,
    modelsTransport?: AiAndModelsTransport,
    responsesTransport?: AiAndResponsesTransport,
    streamingCompletionTransport?: AiAndStreamingCompletionTransport,
  ) {
    if (completionTransport && modelsTransport && responsesTransport && streamingCompletionTransport) {
      this.createCompletion = completionTransport;
      this.listModelsTransport = modelsTransport;
      this.createResponse = responsesTransport;
      this.createStreamingCompletion = streamingCompletionTransport;
      return;
    }
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries ?? 0,
    });
    this.createCompletion = completionTransport ?? ((request, options) => client.chat.completions.create(request, options));
    this.createStreamingCompletion = streamingCompletionTransport ?? ((request, options) => client.chat.completions.create(request, options));
    this.createResponse = responsesTransport ?? ((request, options) => client.responses.create(request, options));
    this.listModelsTransport = modelsTransport ?? (async () => {
      const page = await client.models.list();
      return page.data.map((model) => ({ id: model.id }));
    });
  }

  async listModelIds(): Promise<string[]> {
    return (await this.listModelsTransport()).map((model) => model.id);
  }

  async createPlanCompletion(
    model: string,
    instructions: string,
    input: unknown,
    options: AiAndCompletionOptions,
  ): Promise<{
    content: string;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    diagnostics: AiAndResponseDiagnostics;
  }> {
    const responseFormat = options.responseFormat ?? { type: 'json_schema', json_schema: experimentPlanJsonSchemaResponse };
    const completion = await this.createCompletion(
      {
        model,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: JSON.stringify(input) },
        ],
        max_completion_tokens: options.maxCompletionTokens,
        temperature: 0,
        ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
        response_format: responseFormat,
      },
      { timeout: options.timeoutMs, ...(options.signal ? { signal: options.signal } : {}) },
    );
    const diagnostics = aiAndResponseDiagnostics(completion);
    const choice = completion.choices[0];
    const content = choice?.message ? extractVisibleAssistantText(choice.message as unknown) : null;
    if (choice?.message?.refusal) {
      throw new AiAndResponseError('REFUSAL', 'ai& refused to generate an experiment plan.', diagnostics);
    }
    if (!content) {
      if (diagnostics.toolCallCount > 0) {
        throw new AiAndResponseError('MALFORMED_RESPONSE', `ai& returned tool calls instead of visible JSON (${formatDiagnostics(diagnostics)}).`, diagnostics);
      }
      throw new AiAndResponseError('MALFORMED_RESPONSE', `ai& returned empty visible content (${formatDiagnostics(diagnostics)}).`, diagnostics);
    }
    return {
      content,
      diagnostics,
      ...(completion.usage ? { usage: {
        inputTokens: completion.usage.prompt_tokens,
        outputTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } } : {}),
    };
  }

  async createStreamingPlanCompletion(
    model: string,
    instructions: string,
    input: unknown,
    options: AiAndCompletionOptions,
  ): Promise<{
    content: string;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    diagnostics: AiAndResponseDiagnostics;
  }> {
    const started = Date.now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let idleTimedOut = false;
    const resetIdleTimer = () => {
      if (!options.idleTimeoutMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimedOut = true;
        controller.abort();
      }, options.idleTimeoutMs);
    };
    const responseFormat = options.responseFormat ?? { type: 'json_schema', json_schema: experimentPlanJsonSchemaResponse };
    const chunks: string[] = [];
    let responseId: string | null = null;
    let resolvedModel: string | null = null;
    let finishReason: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let totalTokens: number | null = null;
    let reasoningTokens: number | null = null;
    let eventCount = 0;
    let visibleDeltaCount = 0;
    let refusalPresent = false;
    let toolCallCount = 0;
    let timeToFirstEventMs: number | null = null;
    let timeToFirstVisibleTokenMs: number | null = null;
    try {
      resetIdleTimer();
      const stream = await this.createStreamingCompletion(
        {
          model,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: JSON.stringify(input) },
          ],
          max_completion_tokens: options.maxCompletionTokens,
          temperature: 0,
          ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
          response_format: responseFormat,
          stream: true,
          stream_options: { include_usage: true },
        },
        {
          timeout: options.timeoutMs,
          signal: controller.signal,
          headers: { 'X-Aiand-Metrics': 'true' },
        },
      );
      for await (const chunk of stream) {
        eventCount++;
        resetIdleTimer();
        timeToFirstEventMs ??= Date.now() - started;
        responseId ??= chunk.id;
        resolvedModel ??= chunk.model;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
          totalTokens = chunk.usage.total_tokens;
          const usage = chunk.usage as ChatCompletion['usage'] & { completion_tokens_details?: { reasoning_tokens?: number | null } };
          reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? null;
        }
        for (const choice of chunk.choices) {
          finishReason = choice.finish_reason ?? finishReason;
          if (choice.delta.refusal) refusalPresent = true;
          if (choice.delta.tool_calls?.length) toolCallCount += choice.delta.tool_calls.length;
          if (choice.delta.content) {
            chunks.push(choice.delta.content);
            visibleDeltaCount++;
            timeToFirstVisibleTokenMs ??= Date.now() - started;
          }
        }
      }
    } catch (error) {
      const diagnostics = streamingDiagnostics({
        responseId,
        resolvedModel,
        finishReason,
        inputTokens,
        outputTokens,
        totalTokens,
        reasoningTokens,
        eventCount,
        visibleDeltaCount,
        contentLength: chunks.join('').trim().length,
        refusalPresent,
        toolCallCount,
        timeToFirstEventMs,
        timeToFirstVisibleTokenMs,
        started,
      });
      if (idleTimedOut) throw new AiAndResponseError('STREAM_IDLE_TIMEOUT', 'ai& streaming planner request hit the idle timeout.', diagnostics);
      if (controller.signal.aborted || isAbortError(error)) throw new AiAndResponseError('OVERALL_TIMEOUT', 'ai& streaming planner request hit the overall timeout.', diagnostics);
      throw error;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      options.signal?.removeEventListener('abort', abort);
    }
    const content = chunks.join('').trim();
    const diagnostics = streamingDiagnostics({
      responseId,
      resolvedModel,
      finishReason,
      inputTokens,
      outputTokens,
      totalTokens,
      reasoningTokens,
      eventCount,
      visibleDeltaCount,
      contentLength: content.length,
      refusalPresent,
      toolCallCount,
      timeToFirstEventMs,
      timeToFirstVisibleTokenMs,
      started,
    });
    if (refusalPresent) throw new AiAndResponseError('REFUSAL', 'ai& refused to generate an experiment plan.', diagnostics);
    if (toolCallCount > 0) throw new AiAndResponseError('MALFORMED_RESPONSE', `ai& returned tool calls instead of visible JSON (${formatDiagnostics(diagnostics)}).`, diagnostics);
    if (!content) throw new AiAndResponseError('MALFORMED_RESPONSE', `ai& returned empty visible content (${formatDiagnostics(diagnostics)}).`, diagnostics);
    return {
      content,
      diagnostics,
      ...(inputTokens !== null || outputTokens !== null || totalTokens !== null ? { usage: {
        ...(inputTokens !== null ? { inputTokens } : {}),
        ...(outputTokens !== null ? { outputTokens } : {}),
        ...(totalTokens !== null ? { totalTokens } : {}),
      } } : {}),
    };
  }

  async createPlanResponse(
    model: string,
    instructions: string,
    input: unknown,
    options: AiAndCompletionOptions,
  ): Promise<{
    content: string;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    diagnostics: AiAndResponseDiagnostics;
  }> {
    const responseFormat = options.responseFormat ?? { type: 'json_schema', json_schema: experimentPlanJsonSchemaResponse };
    const response = await this.createResponse(
      {
        model,
        instructions,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify(input),
              },
            ],
          },
        ],
        max_output_tokens: options.maxCompletionTokens,
        temperature: 0,
        ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
        text: { format: responsesTextFormat(responseFormat) },
        store: false,
      },
      { timeout: options.timeoutMs, ...(options.signal ? { signal: options.signal } : {}) },
    );
    const diagnostics = aiAndResponsesDiagnostics(response);
    if (response.error) {
      throw new AiAndResponseError('PROVIDER_UNAVAILABLE', 'ai& Responses API returned an error.', diagnostics);
    }
    const content = extractVisibleResponseText(response);
    if (!content) {
      throw new AiAndResponseError('MALFORMED_RESPONSE', `ai& Responses API returned empty visible content (${formatDiagnostics(diagnostics)}).`, diagnostics);
    }
    return {
      content,
      diagnostics,
      ...(response.usage ? { usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens,
      } } : {}),
    };
  }
}

export class AiAndResponseError extends Error {
  constructor(readonly code: string, message: string, readonly diagnostics?: AiAndResponseDiagnostics) {
    super(message);
    this.name = 'AiAndResponseError';
  }
}

export function extractVisibleAssistantText(message: unknown): string | null {
  if (!isRecord(message)) return null;
  const content = message.content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length ? trimmed : null;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => visibleTextPart(part))
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join('');
    const trimmed = text.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

export function extractVisibleResponseText(response: unknown): string | null {
  if (!isRecord(response)) return null;
  if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) return response.output_text.trim();
  if (!Array.isArray(response.output)) return null;
  const text = response.output
    .flatMap((item) => isRecord(item) && item.type === 'message' && Array.isArray(item.content) ? item.content : [])
    .map((part) => isRecord(part) && part.type === 'output_text' && typeof part.text === 'string' ? part.text : null)
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('');
  const trimmed = text.trim();
  return trimmed.length ? trimmed : null;
}

function visibleTextPart(part: unknown): string | null {
  if (!isRecord(part)) return null;
  if (part.type !== undefined && part.type !== 'text' && part.type !== 'output_text') return null;
  if (typeof part.text === 'string') return part.text;
  if (isRecord(part.text) && typeof part.text.value === 'string') return part.text.value;
  return null;
}

function aiAndResponseDiagnostics(completion: ChatCompletion): AiAndResponseDiagnostics {
  const choice = completion.choices[0];
  const content = (choice?.message as unknown as { content?: unknown } | undefined)?.content;
  const usage = completion.usage as ChatCompletion['usage'] & { completion_tokens_details?: { reasoning_tokens?: number | null } } | undefined;
  return {
    responseId: typeof completion.id === 'string' ? completion.id : null,
    resolvedModel: typeof completion.model === 'string' ? completion.model : null,
    apiSurface: 'CHAT_COMPLETIONS',
    responseStatus: null,
    choiceCount: completion.choices.length,
    finishReason: choice?.finish_reason ?? null,
    contentType: contentType(content),
    contentLength: contentLength(content),
    refusalPresent: typeof choice?.message?.refusal === 'string' && choice.message.refusal.length > 0,
    toolCallCount: choice?.message?.tool_calls?.length ?? 0,
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

function aiAndResponsesDiagnostics(response: Response): AiAndResponseDiagnostics {
  const usage = response.usage;
  return {
    responseId: typeof response.id === 'string' ? response.id : null,
    resolvedModel: typeof response.model === 'string' ? response.model : null,
    apiSurface: 'RESPONSES',
    responseStatus: response.status ?? null,
    choiceCount: response.output.length,
    finishReason: response.incomplete_details?.reason ?? response.status ?? null,
    contentType: response.output_text.trim().length ? 'string' : 'empty',
    contentLength: extractVisibleResponseText(response)?.length ?? 0,
    refusalPresent: response.output.some((item) => isRecord(item) && Array.isArray(item.content) && item.content.some((part) => isRecord(part) && part.type === 'refusal')),
    toolCallCount: response.output.filter((item) => isRecord(item) && item.type !== 'message' && item.type !== 'reasoning').length,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? null,
  };
}

function contentType(content: unknown): AiAndResponseDiagnostics['contentType'] {
  if (content === null || content === undefined) return 'null';
  if (typeof content === 'string') return content.trim().length ? 'string' : 'empty';
  if (Array.isArray(content)) return 'array';
  return 'unknown';
}

function contentLength(content: unknown): number {
  if (typeof content === 'string') return content.trim().length;
  if (Array.isArray(content)) return content.map((part) => visibleTextPart(part) ?? '').join('').trim().length;
  return 0;
}

function formatDiagnostics(diagnostics: AiAndResponseDiagnostics): string {
  return [
    `finishReason=${diagnostics.finishReason ?? 'unknown'}`,
    `completionTokens=${diagnostics.outputTokens ?? 'unknown'}`,
    `reasoningTokens=${diagnostics.reasoningTokens ?? 'unknown'}`,
    `contentType=${diagnostics.contentType}`,
    `contentLength=${diagnostics.contentLength}`,
    `choiceCount=${diagnostics.choiceCount}`,
  ].join(', ');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && /abort|timeout|timed out/i.test(`${error.name} ${error.message}`);
}

function streamingDiagnostics(input: {
  responseId: string | null;
  resolvedModel: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  eventCount: number;
  visibleDeltaCount: number;
  contentLength: number;
  refusalPresent: boolean;
  toolCallCount: number;
  timeToFirstEventMs: number | null;
  timeToFirstVisibleTokenMs: number | null;
  started: number;
}): AiAndResponseDiagnostics {
  return {
    responseId: input.responseId,
    resolvedModel: input.resolvedModel,
    apiSurface: 'CHAT_COMPLETIONS',
    responseStatus: 'stream',
    choiceCount: input.eventCount,
    finishReason: input.finishReason,
    contentType: input.contentLength > 0 ? 'string' : 'empty',
    contentLength: input.contentLength,
    refusalPresent: input.refusalPresent,
    toolCallCount: input.toolCallCount,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
    reasoningTokens: input.reasoningTokens,
    streamEventCount: input.eventCount,
    visibleDeltaCount: input.visibleDeltaCount,
    timeToFirstEventMs: input.timeToFirstEventMs,
    timeToFirstVisibleTokenMs: input.timeToFirstVisibleTokenMs,
    durationMs: Date.now() - input.started,
    streaming: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function responsesTextFormat(format: AiAndResponseFormat): ResponseFormatTextConfig {
  if (format.type === 'json_object') return { type: 'json_object' };
  return {
    type: 'json_schema',
    name: format.json_schema.name,
    ...(format.json_schema.description ? { description: format.json_schema.description } : {}),
    ...(format.json_schema.strict !== undefined ? { strict: format.json_schema.strict } : {}),
    schema: format.json_schema.schema ?? {},
  };
}

const experimentPlanJsonSchemaResponse: ResponseFormatJSONSchema.JSONSchema = {
  name: 'experiment_plan',
  description: 'A validated TaskOS initial experiment plan.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['objective', 'explanation', 'assumptions', 'variables', 'worlds', 'warnings'],
    properties: {
      objective: { type: 'string', minLength: 1, maxLength: 1_000 },
      explanation: { type: 'string', minLength: 1, maxLength: 3_000 },
      assumptions: { type: 'array', maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 500 } },
      variables: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'reason', 'priority'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            reason: { type: 'string', minLength: 1, maxLength: 500 },
            priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          },
        },
      },
      worlds: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'purpose', 'browser', 'viewport', 'networkProfile', 'userProfile', 'paymentDelayMs', 'duplicateSubmissionBug', 'doubleSubmit', 'doubleSubmitIntervalMs', 'expectedOutcome', 'reason'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 150 },
            purpose: { type: 'string', minLength: 1, maxLength: 500 },
            browser: { type: 'string', minLength: 1, maxLength: 80 },
            viewport: { type: 'string', minLength: 1, maxLength: 80 },
            networkProfile: { type: 'string', minLength: 1, maxLength: 80 },
            userProfile: { type: 'string', minLength: 1, maxLength: 80 },
            paymentDelayMs: { type: 'integer', minimum: 0, maximum: 10_000 },
            duplicateSubmissionBug: { type: 'boolean' },
            doubleSubmit: { type: 'boolean' },
            doubleSubmitIntervalMs: { type: 'integer', minimum: 0, maximum: 5_000 },
            expectedOutcome: { type: 'string', enum: ['PASS', 'INVARIANT_VIOLATION', 'OBSERVE'] },
            reason: { type: 'string', minLength: 1, maxLength: 1_000 },
          },
        },
      },
      warnings: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 500 } },
    },
  },
};
