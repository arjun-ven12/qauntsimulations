import type { ChatCompletion } from 'openai/resources/chat/completions';
import { describe, expect, it } from 'vitest';
import type { PlannerRequest } from '../contracts/experiment-planner.types.js';
import { KimiClient, type KimiCompletionRequest } from '../providers/kimi/kimi.client.js';
import { KimiExperimentPlanner, extractJson } from '../providers/kimi/kimi-experiment-planner.js';

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
  objective: 'Test a safe checkout baseline.', explanation: 'One bounded control world.', assumptions: ['Local fixture is available.'],
  variables: [{ name: 'browser', reason: 'Establish a browser control.', priority: 'HIGH' }], warnings: [],
  worlds: [{ name: 'Baseline', purpose: 'Healthy control.', browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: 'normal', userProfile: 'normal', paymentDelayMs: 0, duplicateSubmissionBug: false, doubleSubmit: false, doubleSubmitIntervalMs: 100, expectedOutcome: 'PASS', reason: 'Establish healthy behavior.' }],
};

function completion(content: string): ChatCompletion {
  return { id: 'completion', created: 0, model: 'kimi-k2.6', object: 'chat.completion', choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content, refusal: null, annotations: [] } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
}

describe('KimiExperimentPlanner', () => {
  it('constructs a bounded OpenAI-compatible request and accepts validated JSON', async () => {
    let captured: KimiCompletionRequest | undefined;
    const client = new KimiClient({ apiKey: 'constructor-only-secret', baseUrl: 'https://api.moonshot.cn/v1' }, async (input) => {
      captured = input;
      return completion(JSON.stringify(plan));
    });
    const result = await new KimiExperimentPlanner(client, 'sponsor-model').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 60_000, maxOutputTokens: 3_000, maxAttempts: 1 });
    expect(result).toMatchObject({ provider: 'KIMI', status: 'VALIDATING', model: 'sponsor-model', usage: { providerRequestCount: 1 } });
    expect(captured).toMatchObject({ model: 'sponsor-model', temperature: 0, max_tokens: 3_000, response_format: { type: 'json_object' } });
    const serializedMessages = JSON.stringify(captured?.messages);
    expect(serializedMessages).toContain('maximumWorlds');
    expect(serializedMessages).toContain('domainAllowlist');
    expect(serializedMessages).not.toContain('constructor-only-secret');
  });

  it('accepts an exact JSON fence but rejects surrounding prose', () => {
    expect(extractJson(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)).toBe(JSON.stringify(plan));
    expect(() => extractJson(`Here is the plan: ${JSON.stringify(plan)}`)).toThrow('single JSON object');
  });

  it.each([
    ['authentication', { status: 401 }, 'AUTHENTICATION_ERROR'],
    ['rate limit', { status: 429 }, 'RATE_LIMITED'],
    ['timeout', { name: 'APIConnectionTimeoutError' }, 'TIMEOUT'],
    ['provider outage', { status: 500 }, 'PROVIDER_UNAVAILABLE'],
  ])('normalizes %s without leaking raw provider data', async (_label, providerError, expectedCode) => {
    const client = new KimiClient({ apiKey: 'never-leak-me', baseUrl: 'https://api.moonshot.cn/v1' }, async () => { throw { ...providerError, body: 'never-leak-me raw body' }; });
    const result = await new KimiExperimentPlanner(client, 'kimi-k2.6').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1 });
    expect(result.error?.code).toBe(expectedCode);
    expect(JSON.stringify(result)).not.toContain('never-leak-me');
  });

  it.each([
    ['', 'MALFORMED_RESPONSE'],
    ['not json', 'MALFORMED_RESPONSE'],
    ['{"objective":true}', 'PLAN_SCHEMA_INVALID'],
  ])('rejects invalid output safely', async (content, expectedCode) => {
    const client = new KimiClient({ apiKey: 'test', baseUrl: 'https://api.moonshot.cn/v1' }, async () => completion(content));
    const result = await new KimiExperimentPlanner(client, 'kimi-k2.6').generatePlan(request, { plannerVersion: 'v1', timeoutMs: 1_000, maxOutputTokens: 500, maxAttempts: 1 });
    expect(result.error?.code).toBe(expectedCode);
  });
});
