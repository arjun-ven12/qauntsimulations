import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { z } from 'zod';

export interface OpenAIClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface StructuredOutputOptions {
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ParsedStructuredOutput<T> {
  output: T;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export class OpenAIClient {
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAIClientConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries ?? 0,
    });
  }

  async parseStructuredOutput<T>(
    model: string,
    instructions: string,
    input: unknown,
    schema: z.ZodType<T>,
    schemaName: string,
    options: StructuredOutputOptions = {},
  ): Promise<ParsedStructuredOutput<T>> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: instructions },
      { role: 'user', content: JSON.stringify(input) },
    ];
    const request = {
        model,
        messages,
        response_format: zodResponseFormat(schema, schemaName),
        ...(options.maxOutputTokens ? { max_completion_tokens: options.maxOutputTokens } : {}),
    };
    const completion = await this.client.chat.completions.parse(
      request,
      {
        ...(options.signal ? { signal: options.signal } : {}),
        ...(this.config.timeoutMs ? { timeout: this.config.timeoutMs } : {}),
      },
    );
    const choice = completion.choices[0];
    const parsed = choice?.message.parsed;
    if (!parsed) {
      const refusal = choice?.message.refusal;
      throw new Error(refusal ? `OpenAI refused structured output: ${refusal}` : 'OpenAI returned no parsed structured output');
    }
    return {
      output: parsed,
      ...(completion.usage
        ? {
            usage: {
              inputTokens: completion.usage.prompt_tokens,
              outputTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            },
          }
        : {}),
    };
  }

  async createStructuredOutput(model: string, instructions: string, input: unknown): Promise<unknown> {
    const completion = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: { type: 'json_object' },
    });
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error('OpenAI returned no structured output');
    return JSON.parse(content) as unknown;
  }
}
