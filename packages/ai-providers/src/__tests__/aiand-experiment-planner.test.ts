import type { ChatCompletion } from 'openai/resources/chat/completions';
import type { Response } from 'openai/resources/responses/responses';
import { describe, expect, it } from 'vitest';
import type { PlannerRequest } from '../contracts/experiment-planner.types.js';
import { AiAndClient, extractVisibleAssistantText, extractVisibleResponseText, type AiAndCompletionRequest, type AiAndResponsesRequest } from '../providers/aiand/aiand.client.js';
import { AiAndExperimentPlanner, extractAiAndJson } from '../providers/aiand/aiand-experiment-planner.js';

const request: PlannerRequest = {
  scenarioPrompt: 'Explore duplicate checkout submission.',
  project: { id: 'project', name: 'Demo' },
  environment: { id: 'environment', name: 'Local', origin: 'http://localhost:5174', capabilities: { allowedActions: ['checkout'] } },
  journey: { id: 'journey', name: 'Checkout', supportedVariables: ['browser'], supportedActionTypes: ['goto', 'click'], steps: [{ type: 'goto', path: '/checkout' }] },
  controls: { allowedBrowsers: ['chromium'], allowedViewports: ['desktop-1440x900'], allowedNetworkProfiles: ['normal'], maximumWorlds: 4, maximumConcurrentWorkers: 2 },
  invariants: [{ id: 'invariant', name: 'No duplicate payment' }],
  supportedFaults: [{ id: 'delay', type: 'PAYMENT_DELAY', allowedValues: { min: 0, max: 10_000 } }],
  safety: { domainAllowlist: ['localhost'], allowedHttpMethods: ['GET', 'POST'], permitCheckoutSubmission: true, permitMockPayment: true, permitTestOrderCreation: true, prohibitedActions: ['external network'] },
};

const plan = {
  summary: 'Test checkout under delayed payment and repeated submission.',
  hypothesis: 'Payment delay, repeated submission, and mobile viewport may expose duplicate payment attempts.',
  selectedDimensions: [
    { key: 'paymentDelayMs', reason: 'Payment delay may widen the duplicate-submit window.' },
    { key: 'doubleSubmit', reason: 'Repeated submit is the user action under test.' },
    { key: 'viewport', reason: 'Mobile layout can affect repeated tap behavior.' },
  ],
  worlds: [
    { name: 'Baseline', purpose: 'Healthy control checkout.', hypothesis: 'A normal checkout should accept payment once.', dimensions: { browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: 'normal', userProfile: 'normal', paymentDelayMs: 0, duplicateSubmissionBug: false, doubleSubmit: false, doubleSubmitIntervalMs: 0, expectedOutcome: 'PASS' }, expectedObservation: 'One payment is accepted.' },
    { name: 'Healthy delayed repeat', purpose: 'Healthy double-click protection.', hypothesis: 'Protection should collapse repeated payment attempts.', dimensions: { browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: 'normal', userProfile: 'impatient', paymentDelayMs: 1200, duplicateSubmissionBug: false, doubleSubmit: true, doubleSubmitIntervalMs: 100, expectedOutcome: 'PASS' }, expectedObservation: 'Repeated submit still accepts payment once.' },
    { name: 'Defective delayed repeat', purpose: 'Known duplicate-submit defect.', hypothesis: 'The defect can accept payment more than once.', dimensions: { browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: 'normal', userProfile: 'impatient', paymentDelayMs: 1200, duplicateSubmissionBug: true, doubleSubmit: true, doubleSubmitIntervalMs: 100, expectedOutcome: 'INVARIANT_VIOLATION' }, expectedObservation: 'Duplicate payment violates the invariant.' },
    { name: 'Mobile delayed repeat', purpose: 'Mobile repeated tap comparison.', hypothesis: 'Mobile taps plus delay may reproduce duplicate payment.', dimensions: { browser: 'chromium', viewport: 'mobile-390x844', networkProfile: 'normal', userProfile: 'impatient', paymentDelayMs: 1200, duplicateSubmissionBug: true, doubleSubmit: true, doubleSubmitIntervalMs: 100, expectedOutcome: 'OBSERVE' }, expectedObservation: 'Observe whether mobile repeated submit duplicates payment.' },
  ],
};

function completion(content: string, finishReason: ChatCompletion.Choice['finish_reason'] = 'stop'): ChatCompletion {
  return { id: 'completion', created: 0, model: 'moonshotai/kimi-k2.7-code', object: 'chat.completion', choices: [{ index: 0, finish_reason: finishReason, logprobs: null, message: { role: 'assistant', content, refusal: null, annotations: [] } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, completion_tokens_details: { reasoning_tokens: 2 } } };
}

function response(content: string): Response {
  return {
    id: 'response',
    created_at: 0,
    model: 'moonshotai/kimi-k2.7-code',
    object: 'response',
    output_text: content,
    output: [{ id: 'message', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: content, annotations: [] }] }],
    status: 'completed',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    parallel_tool_calls: false,
    temperature: 0,
    tool_choice: 'auto',
    tools: [],
    top_p: null,
    usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 3 } },
  };
}

describe('AiAndExperimentPlanner', () => {
  it('constructs a portable OpenAI-compatible request and accepts validated JSON', async () => {
    let captured: AiAndCompletionRequest | undefined;
    const client = new AiAndClient({ apiKey: 'constructor-only-secret', baseUrl: 'https://api.aiand.com/v1' }, async (input) => {
      captured = input;
      return completion(JSON.stringify(plan));
    }, async () => [{ id: 'moonshotai/kimi-k2.7-code' }]);

    const modelIds = await client.listModelIds();
    const result = await new AiAndExperimentPlanner(client, 'moonshotai/kimi-k2.7-code').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 90_000, maxOutputTokens: 6_000, maxAttempts: 1, reasoningEffort: 'none' });

    expect(modelIds).toEqual(['moonshotai/kimi-k2.7-code']);
    expect(result).toMatchObject({ provider: 'AIAND', status: 'VALIDATING', model: 'moonshotai/kimi-k2.7-code', usage: { providerRequestCount: 1 } });
    expect(captured).toMatchObject({
      model: 'moonshotai/kimi-k2.7-code',
      max_completion_tokens: 6_000,
      temperature: 0,
      reasoning_effort: 'none',
      response_format: { type: 'json_schema' },
    });
    expect(captured?.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'rift_experiment_strategy', strict: true },
    });
    expect(captured).not.toHaveProperty('thinking');
    expect(captured).not.toHaveProperty('extra_body');
    expect(captured).not.toHaveProperty('max_tokens');
    expect(captured).not.toHaveProperty('top_p');
    expect(captured).not.toHaveProperty('presence_penalty');
    expect(captured).not.toHaveProperty('frequency_penalty');
    expect(captured).not.toHaveProperty('n');
    const serializedMessages = JSON.stringify(captured?.messages);
    expect(serializedMessages).toContain('worlds');
    expect(serializedMessages).toContain('domainAllowlist');
    expect(serializedMessages).not.toContain('constructor-only-secret');
    expect(result.providerDiagnostics).toMatchObject({
      responseId: 'completion',
      resolvedModel: 'moonshotai/kimi-k2.7-code',
      finishReason: 'stop',
      contentType: 'string',
      contentLength: expect.any(Number),
      reasoningTokens: 2,
    });
  });

  it('falls back once to JSON-object mode when strict JSON Schema is rejected', async () => {
    const captured: AiAndCompletionRequest[] = [];
    const client = new AiAndClient({ apiKey: 'test', baseUrl: 'https://api.aiand.com/v1' }, async (input) => {
      captured.push(input);
      if (input.response_format?.type === 'json_schema') throw { status: 400, message: 'response_format json_schema is unsupported' };
      return completion(JSON.stringify(plan));
    });

    const result = await new AiAndExperimentPlanner(client, 'moonshotai/kimi-k2.7-code').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1, reasoningEffort: 'none' });

    expect(result.status).toBe('VALIDATING');
    expect(result.usage?.providerRequestCount).toBe(2);
    expect(captured.map((item) => item.response_format?.type)).toEqual(['json_schema', 'json_object']);
    expect(captured[1]).toMatchObject({ reasoning_effort: 'none' });
  });

  it('extracts Chat Completions visible text content parts without reading hidden fields', () => {
    expect(extractVisibleAssistantText({ content: [{ type: 'text', text: '{"status":"ok"}' }] })).toBe('{"status":"ok"}');
    expect(extractVisibleAssistantText({ content: [{ type: 'reasoning', text: '{"hidden":true}' }] })).toBeNull();
    expect(extractVisibleAssistantText({ content: [{ type: 'output_text', text: { value: '{"status":"ok"}' } }] })).toBe('{"status":"ok"}');
  });

  it('extracts Responses visible output_text and output content items only', () => {
    expect(extractVisibleResponseText(response('{"status":"ok"}'))).toBe('{"status":"ok"}');
    expect(extractVisibleResponseText({ output_text: '', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"status":"ok"}' }] }] })).toBe('{"status":"ok"}');
    expect(extractVisibleResponseText({ output_text: '', output: [{ type: 'reasoning', content: [{ type: 'output_text', text: '{"hidden":true}' }] }] })).toBeNull();
  });

  it('can generate through the Responses API surface with structured output', async () => {
    let captured: AiAndResponsesRequest | undefined;
    const client = new AiAndClient(
      { apiKey: 'constructor-only-secret', baseUrl: 'https://api.aiand.com/v1' },
      async () => completion(JSON.stringify(plan)),
      async () => [{ id: 'moonshotai/kimi-k2.7-code' }],
      async (input) => {
        captured = input;
        return response(JSON.stringify(plan));
      },
    );

    const result = await new AiAndExperimentPlanner(client, 'moonshotai/kimi-k2.7-code', 'RESPONSES').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 90_000, maxOutputTokens: 6_000, maxAttempts: 1, reasoningEffort: 'none' });

    expect(result).toMatchObject({ provider: 'AIAND', status: 'VALIDATING', model: 'moonshotai/kimi-k2.7-code', usage: { providerRequestCount: 1 } });
    expect(captured).toMatchObject({
      model: 'moonshotai/kimi-k2.7-code',
      max_output_tokens: 6_000,
      temperature: 0,
      reasoning: { effort: 'none' },
      text: { format: { type: 'json_schema', name: 'rift_experiment_strategy', strict: true } },
      store: false,
    });
    expect(JSON.stringify(captured)).not.toContain('constructor-only-secret');
    expect(result.providerDiagnostics).toMatchObject({ apiSurface: 'RESPONSES', responseId: 'response', resolvedModel: 'moonshotai/kimi-k2.7-code', responseStatus: 'completed', reasoningTokens: 3 });
  });

  it('rejects Responses results with no visible output', async () => {
    const client = new AiAndClient(
      { apiKey: 'test', baseUrl: 'https://api.aiand.com/v1' },
      async () => completion(JSON.stringify(plan)),
      async () => [{ id: 'moonshotai/kimi-k2.7-code' }],
      async () => ({ ...response(''), output_text: '', output: [] }),
    );
    const result = await new AiAndExperimentPlanner(client, 'moonshotai/kimi-k2.7-code', 'RESPONSES').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1, reasoningEffort: 'none' });
    expect(result.error?.code).toBe('MALFORMED_RESPONSE');
    expect(result.error?.message).toContain('Responses API returned empty visible content');
  });

  it('accepts exact JSON fences but rejects surrounding prose', () => {
    expect(extractAiAndJson(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)).toBe(JSON.stringify(plan));
    expect(() => extractAiAndJson(`Here is the plan: ${JSON.stringify(plan)}`)).toThrow('single JSON object');
  });

  it.each([
    ['authentication', { status: 401 }, 'AUTHENTICATION_ERROR'],
    ['rate limit', { status: 429 }, 'RATE_LIMITED'],
    ['timeout', { name: 'APIConnectionTimeoutError' }, 'TIMEOUT'],
    ['strict response format rejection', { status: 400, message: 'response_format json_schema unsupported' }, 'RESPONSE_FORMAT_UNSUPPORTED'],
    ['model unavailable', { status: 404 }, 'MODEL_UNAVAILABLE'],
    ['provider outage', { status: 500 }, 'PROVIDER_UNAVAILABLE'],
  ])('normalizes %s without leaking raw provider data', async (_label, providerError, expectedCode) => {
    const client = new AiAndClient({ apiKey: 'never-leak-me', baseUrl: 'https://api.aiand.com/v1' }, async () => { throw { ...providerError, body: 'never-leak-me raw body' }; });
    const result = await new AiAndExperimentPlanner(client, 'moonshotai/kimi-k2.7-code').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1 });
    expect(result.error?.code).toBe(expectedCode);
    expect(JSON.stringify(result)).not.toContain('never-leak-me');
  });

  it.each([
    ['', 'MALFORMED_RESPONSE'],
    ['not json', 'MALFORMED_RESPONSE'],
    ['{"objective":true}', 'PLAN_SCHEMA_INVALID'],
  ])('rejects invalid output safely', async (content, expectedCode) => {
    const client = new AiAndClient({ apiKey: 'test', baseUrl: 'https://api.aiand.com/v1' }, async () => completion(content));
    const result = await new AiAndExperimentPlanner(client, 'moonshotai/kimi-k2.7-code').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1 });
    expect(result.error?.code).toBe(expectedCode);
  });

  it('reports safe diagnostics for empty visible completions', async () => {
    const client = new AiAndClient({ apiKey: 'test', baseUrl: 'https://api.aiand.com/v1' }, async () => completion('', 'length'));
    const result = await new AiAndExperimentPlanner(client, 'moonshotai/kimi-k2.7-code').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1, reasoningEffort: 'none' });
    expect(result.error?.code).toBe('MALFORMED_RESPONSE');
    expect(result.error?.message).toContain('finishReason=length');
    expect(result.error?.message).toContain('reasoningTokens=2');
    expect(result.providerDiagnostics).toMatchObject({ finishReason: 'length', contentType: 'empty' });
  });

  it('rejects refusal and tool-call-only responses', async () => {
    const refusalClient = new AiAndClient({ apiKey: 'test', baseUrl: 'https://api.aiand.com/v1' }, async () => ({
      ...completion(''),
      choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: '', refusal: 'No.', annotations: [] } }],
    }));
    const refusal = await new AiAndExperimentPlanner(refusalClient, 'moonshotai/kimi-k2.7-code').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1 });
    expect(refusal.error?.code).toBe('REFUSAL');

    const toolClient = new AiAndClient({ apiKey: 'test', baseUrl: 'https://api.aiand.com/v1' }, async () => ({
      ...completion(''),
      choices: [{ index: 0, finish_reason: 'tool_calls', logprobs: null, message: { role: 'assistant', content: null, refusal: null, annotations: [], tool_calls: [{ id: 'call', type: 'function', function: { name: 'noop', arguments: '{}' } }] } }],
    }));
    const tool = await new AiAndExperimentPlanner(toolClient, 'moonshotai/kimi-k2.7-code').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1 });
    expect(tool.error?.code).toBe('MALFORMED_RESPONSE');
    expect(tool.error?.message).toContain('tool calls');
  });
});
