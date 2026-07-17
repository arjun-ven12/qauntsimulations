import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

export interface KimiClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface KimiCompletionOptions {
  maxOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface KimiChatCompletionExtraBody {
  thinking: {
    type: 'disabled';
  };
}

// The OpenAI Node SDK serializes additional POST parameters directly into the
// request body (the equivalent of `extra_body` in other OpenAI SDKs).
export type KimiCompletionRequest = ChatCompletionCreateParamsNonStreaming & KimiChatCompletionExtraBody;
export type KimiCompletionTransport = (
  request: KimiCompletionRequest,
  options: { timeout: number; signal?: AbortSignal },
) => Promise<ChatCompletion>;

export class KimiClient {
  private readonly createCompletion: KimiCompletionTransport;

  constructor(readonly config: KimiClientConfig, transport?: KimiCompletionTransport) {
    if (transport) {
      this.createCompletion = transport;
      return;
    }
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries ?? 0,
    });
    this.createCompletion = (request, options) => client.chat.completions.create(request, options);
  }

  async createPlanCompletion(
    model: string,
    instructions: string,
    input: unknown,
    options: KimiCompletionOptions,
  ): Promise<{ content: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }> {
    const completion = await this.createCompletion(
      {
        model,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: JSON.stringify(input) },
        ],
        max_completion_tokens: options.maxOutputTokens,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
      },
      { timeout: options.timeoutMs, ...(options.signal ? { signal: options.signal } : {}) },
    );
    const content = completion.choices[0]?.message.content;
    if (!content) throw new KimiResponseError('MALFORMED_RESPONSE', 'Kimi returned an empty completion.');
    return {
      content,
      ...(completion.usage ? { usage: {
        inputTokens: completion.usage.prompt_tokens,
        outputTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } } : {}),
    };
  }
}

export class KimiResponseError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'KimiResponseError';
  }
}
