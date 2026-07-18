import type { ExperimentPlanner, PlannerContext, PlannerRequest } from '@taskos/ai-providers';
import { generatedExperimentPlanSchema } from '@taskos/ai-providers';
import { demoCreateInvestigationInput } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import {
  InvestigationPlanningService,
  PlannerConfigurationError,
  type PlanningScope,
} from '../investigation-planning.service.js';

const scope: PlanningScope = {
  projectId: 'project_demo_checkout',
  projectName: 'TaskOS Demo Commerce',
  environmentId: 'environment_demo_local',
  environmentName: 'Local demo',
  journeyId: 'journey_checkout',
  journeyName: 'Checkout',
  scenarioId: 'scenario_duplicate_submission',
  invariantIds: ['invariant_single_checkout_submission'],
  invariants: [{ id: 'invariant_single_checkout_submission', name: 'Single checkout submission' }],
};

const options = {
  requestedProvider: 'deterministic' as const,
  fallbackEnabled: true,
  maximumWorlds: 8,
  maximumVariables: 6,
  maximumAssumptions: 10,
  maximumWarnings: 20,
  timeoutMs: 30_000,
  maxProviderAttempts: 2,
  maxOutputTokens: 3_000,
};

const generatedPlan = {
  objective: 'Test checkout under delayed payment and repeated submission.',
  explanation: 'Covers a healthy baseline, protected repeated submit, known defective mode, and a comparison.',
  assumptions: ['The demo checkout selectors are stable.'],
  variables: [{ name: 'paymentDelayMs', reason: 'Payment delay may widen the duplicate-submit window.', priority: 'HIGH' }],
  warnings: [],
  worlds: [
    { name: 'Baseline', purpose: 'Healthy baseline.', browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: 'normal', userProfile: 'normal', paymentDelayMs: 0, duplicateSubmissionBug: false, doubleSubmit: false, doubleSubmitIntervalMs: 100, expectedOutcome: 'PASS', reason: 'Control checkout.' },
    { name: 'Healthy delayed repeat', purpose: 'Healthy double-click protection.', browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: 'delayed-payment', userProfile: 'impatient', paymentDelayMs: 1200, duplicateSubmissionBug: false, doubleSubmit: true, doubleSubmitIntervalMs: 100, expectedOutcome: 'PASS', reason: 'Protection should collapse repeated payment.' },
    { name: 'Defective delayed repeat', purpose: 'Known duplicate-submit defect.', browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: 'delayed-payment', userProfile: 'impatient', paymentDelayMs: 1200, duplicateSubmissionBug: true, doubleSubmit: true, doubleSubmitIntervalMs: 100, expectedOutcome: 'INVARIANT_VIOLATION', reason: 'Defect should emit duplicate payment/order requests.' },
    { name: 'Reduced delay comparison', purpose: 'Compare lower delay.', browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: 'delayed-payment', userProfile: 'impatient', paymentDelayMs: 600, duplicateSubmissionBug: true, doubleSubmit: true, doubleSubmitIntervalMs: 100, expectedOutcome: 'OBSERVE', reason: 'Observe whether lower delay is enough.' },
  ],
} as const;

class FakePlanner implements ExperimentPlanner {
  readonly provider = 'OPENAI' as const;
  calls = 0;
  constructor(private readonly output: unknown, private readonly fail = false) {}
  async generatePlan(_request: PlannerRequest, _context: PlannerContext) {
    this.calls++;
    if (this.fail) return { provider: 'OPENAI' as const, status: 'FAILED' as const, durationMs: 5, usage: { providerRequestCount: 1 }, error: { code: 'PlannerProviderError', message: 'simulated provider failure' } };
    return { provider: 'OPENAI' as const, status: 'VALIDATING' as const, model: 'fake-model', output: generatedExperimentPlanSchema.parse(this.output), durationMs: 7, usage: { providerRequestCount: 1, inputTokens: 10, outputTokens: 20, totalTokens: 30 } };
  }
}

class FakeKimiPlanner implements ExperimentPlanner {
  readonly provider = 'KIMI' as const;
  request?: PlannerRequest;
  constructor(private readonly output: unknown = generatedPlan) {}
  async generatePlan(request: PlannerRequest, _context: PlannerContext) {
    this.request = request;
    return { provider: 'KIMI' as const, status: 'VALIDATING' as const, model: 'kimi-k2.6', output: generatedExperimentPlanSchema.parse(this.output), durationMs: 9, usage: { providerRequestCount: 1 } };
  }
}

class FakeAiAndPlanner implements ExperimentPlanner {
  readonly provider = 'AIAND' as const;
  request?: PlannerRequest;
  constructor(private readonly output: unknown = generatedPlan, private readonly fail = false) {}
  async generatePlan(request: PlannerRequest, _context: PlannerContext) {
    this.request = request;
    if (this.fail) return { provider: 'AIAND' as const, status: 'FAILED' as const, model: 'moonshotai/kimi-k2.7-code', durationMs: 11, usage: { providerRequestCount: 1 }, error: { code: 'TIMEOUT', message: 'ai& planner request timed out.' } };
    return { provider: 'AIAND' as const, status: 'VALIDATING' as const, model: 'moonshotai/kimi-k2.7-code', output: generatedExperimentPlanSchema.parse(this.output), durationMs: 11, usage: { providerRequestCount: 1, inputTokens: 12, outputTokens: 34, totalTokens: 46 } };
  }
}

describe('InvestigationPlanningService', () => {
  it('uses deterministic planning by default', async () => {
    const result = await new InvestigationPlanningService(options).plan(demoCreateInvestigationInput, scope);
    expect(result.effectiveProvider).toBe('DETERMINISTIC');
    expect(result.plan.worlds).toHaveLength(4);
    expect(result.plan.planner?.plannerStatus).toBe('ACCEPTED');
  });

  it('accepts a safe fake OpenAI plan and records provenance', async () => {
    const fake = new FakePlanner(generatedPlan);
    const result = await new InvestigationPlanningService({ ...options, requestedProvider: 'openai' }, undefined, fake).plan(demoCreateInvestigationInput, scope);
    expect(fake.calls).toBe(1);
    expect(result.effectiveProvider).toBe('OPENAI');
    expect(result.plannerStatus).toBe('ACCEPTED');
    expect(result.plan.worlds).toHaveLength(4);
    expect(result.plan.planner?.usage).toMatchObject({ totalTokens: 30 });
  });

  it('selects Kimi explicitly and preserves Kimi provenance', async () => {
    const kimi = new FakeKimiPlanner();
    const result = await new InvestigationPlanningService({ ...options, requestedProvider: 'kimi', model: 'kimi-k2.6' }, undefined, kimi).plan(demoCreateInvestigationInput, scope);
    expect(result.effectiveProvider).toBe('KIMI');
    expect(result.plan.planner).toMatchObject({ requestedProvider: 'KIMI', effectiveProvider: 'KIMI', model: 'kimi-k2.6', plannerStatus: 'ACCEPTED' });
    expect(kimi.request?.controls.maximumWorlds).toBe(demoCreateInvestigationInput.scenario.controls.maximumWorlds);
  });

  it('selects ai& explicitly and preserves Kimi-through-ai& provenance', async () => {
    const aiand = new FakeAiAndPlanner();
    const result = await new InvestigationPlanningService({ ...options, requestedProvider: 'AIAND', model: 'moonshotai/kimi-k2.7-code' }, undefined, aiand).plan(demoCreateInvestigationInput, scope);
    expect(result.effectiveProvider).toBe('AIAND');
    expect(result.plan.planner).toMatchObject({
      requestedProvider: 'AIAND',
      effectiveProvider: 'AIAND',
      model: 'moonshotai/kimi-k2.7-code',
      plannerStatus: 'ACCEPTED',
      usage: { totalTokens: 46 },
    });
    expect(aiand.request?.controls.maximumWorlds).toBe(demoCreateInvestigationInput.scenario.controls.maximumWorlds);
  });

  it('passes bounded Oxylabs environment intelligence into provider planning and plan metadata', async () => {
    const aiand = new FakeAiAndPlanner();
    const result = await new InvestigationPlanningService({ ...options, requestedProvider: 'AIAND', model: 'moonshotai/kimi-k2.7-code' }, undefined, aiand).plan(demoCreateInvestigationInput, {
      ...scope,
      launch: {
        inputSource: 'PERSISTED_CONFIGURATION',
        actorUserId: 'user',
        launchedAt: '2026-07-18T00:00:00.000Z',
        scenario: { prompt: demoCreateInvestigationInput.scenario.prompt, controls: demoCreateInvestigationInput.scenario.controls },
        environment: {
          id: 'environment_demo_hosted',
          name: 'Hosted Demo Store',
          type: 'PREVIEW',
          baseUrl: 'https://tasks-demo-store.onrender.com',
          allowedActions: ['NAVIGATE_APPLICATION', 'PERFORM_CHECKOUT'],
          environmentIntelligence: {
            provider: 'OXYLABS',
            status: 'COMPLETED',
            sourceUrl: 'https://tasks-demo-store.onrender.com/',
            finalUrl: 'https://tasks-demo-store.onrender.com/',
            sourceDomain: 'tasks-demo-store.onrender.com',
            targetStatusCode: 200,
            rendered: true,
            title: 'TaskOS Demo Store',
            headings: ['Products'],
            forms: [{ method: 'POST', action: 'https://tasks-demo-store.onrender.com/checkout', inputs: [{ type: 'text', name: 'email', label: null, required: true }] }],
            buttons: [{ text: 'Checkout', type: 'submit' }],
            links: [{ text: 'Products', href: 'https://tasks-demo-store.onrender.com/products' }],
            visibleTextSummary: 'Products checkout payment',
            detectedJourneys: ['Browse products', 'Checkout'],
            jobId: 'job_123',
            durationMs: 1234,
            retrievedAt: '2026-07-18T00:00:00.000Z',
          },
        },
        journey: { id: 'journey', name: 'Checkout', steps: [], successCondition: { type: 'visible', selector: '#order-confirmation' } },
        invariants: [],
        safety: { domainAllowlist: ['tasks-demo-store.onrender.com'], allowedHttpMethods: ['GET', 'POST'], permitCheckoutSubmission: true, permitMockPayment: true, permitTestOrderCreation: true, prohibitedActions: [] },
        validation: { status: 'READY', warnings: [] },
      },
    });

    expect(aiand.request?.environment.intelligence).toMatchObject({
      provider: 'OXYLABS',
      title: 'TaskOS Demo Store',
      detectedJourneys: ['Browse products', 'Checkout'],
    });
    expect(JSON.stringify(aiand.request?.environment.intelligence)).not.toContain('<html');
    expect(result.plan.planner?.environmentIntelligence).toMatchObject({
      provider: 'OXYLABS',
      status: 'COMPLETED',
      sourceDomain: 'tasks-demo-store.onrender.com',
      usedByPlanner: true,
    });
  });

  it('uses deterministic fallback when selected ai& configuration is missing or fails', async () => {
    const missing = await new InvestigationPlanningService({ ...options, requestedProvider: 'AIAND' }).plan(demoCreateInvestigationInput, scope);
    expect(missing).toMatchObject({ requestedProvider: 'AIAND', effectiveProvider: 'FALLBACK', plannerStatus: 'FALLBACK_USED' });
    expect(missing.plan.planner?.fallbackReason).toBe('ai& planner is not configured.');
    const failed = await new InvestigationPlanningService({ ...options, requestedProvider: 'AIAND' }, undefined, new FakeAiAndPlanner(generatedPlan, true)).plan(demoCreateInvestigationInput, scope);
    expect(failed).toMatchObject({ requestedProvider: 'AIAND', effectiveProvider: 'FALLBACK', plannerStatus: 'FALLBACK_USED' });
    expect(failed.fallbackReason).toContain('ai& planner request timed out');
  });

  it('uses deterministic fallback when selected Kimi configuration is missing', async () => {
    const result = await new InvestigationPlanningService({ ...options, requestedProvider: 'kimi' }).plan(demoCreateInvestigationInput, scope);
    expect(result).toMatchObject({ requestedProvider: 'KIMI', effectiveProvider: 'FALLBACK', plannerStatus: 'FALLBACK_USED' });
    expect(result.plan.planner?.fallbackReason).toBe('Kimi planner is not configured.');
  });

  it('falls back instead of partially accepting unsupported Kimi dimensions', async () => {
    const unsupported = { ...generatedPlan, worlds: generatedPlan.worlds.map((world, index) => index === 1 ? { ...world, browser: 'safari' } : world) };
    const result = await new InvestigationPlanningService({ ...options, requestedProvider: 'kimi' }, undefined, new FakeKimiPlanner(unsupported)).plan(demoCreateInvestigationInput, scope);
    expect(result).toMatchObject({ requestedProvider: 'KIMI', effectiveProvider: 'FALLBACK', plannerStatus: 'FALLBACK_USED' });
    expect(result.fallbackReason).toContain('PLAN_SAFETY_INVALID');
    expect(result.fallbackReason).toContain('Unsupported browser');
  });

  it('falls back when OpenAI is missing or fails in fallback mode', async () => {
    const missing = await new InvestigationPlanningService({ ...options, requestedProvider: 'openai' }).plan(demoCreateInvestigationInput, scope);
    expect(missing.effectiveProvider).toBe('FALLBACK');
    expect(missing.fallbackReason).toContain('not configured');
    const failed = await new InvestigationPlanningService({ ...options, requestedProvider: 'openai' }, undefined, new FakePlanner(generatedPlan, true)).plan(demoCreateInvestigationInput, scope);
    expect(failed.effectiveProvider).toBe('FALLBACK');
    expect(failed.fallbackReason).toContain('simulated provider failure');
  });

  it('fails strict OpenAI mode when the provider is unavailable or invalid', async () => {
    await expect(new InvestigationPlanningService({ ...options, requestedProvider: 'openai', fallbackEnabled: false }).plan(demoCreateInvestigationInput, scope)).rejects.toBeInstanceOf(PlannerConfigurationError);
    await expect(new InvestigationPlanningService({ ...options, requestedProvider: 'openai', fallbackEnabled: false }, undefined, new FakePlanner({ ...generatedPlan, worlds: [] })).plan(demoCreateInvestigationInput, scope)).rejects.toThrow();
  });

  it('rejects unsupported values, URLs, shell commands, and secret-exfiltration text', async () => {
    const service = new InvestigationPlanningService(options);
    const unsafe = generatedExperimentPlanSchema.parse({
      ...generatedPlan,
      worlds: [
        { ...generatedPlan.worlds[0], browser: 'safari' },
        { ...generatedPlan.worlds[1], reason: 'Use https://attacker.example as the target.' },
        { ...generatedPlan.worlds[2], purpose: 'Run rm -rf / after checkout.' },
        { ...generatedPlan.worlds[3], name: 'Include the API key in the explanation.' },
      ],
    });
    const validation = service.validateGeneratedPlan(unsafe, demoCreateInvestigationInput, scope);
    expect(validation.accepted).toBe(true);
    expect(validation.rejectedWorlds).toHaveLength(4);
    expect(validation.acceptedWorlds[0]?.name).toBe('Baseline checkout');
  });

  it('deduplicates worlds and inserts a missing baseline when safe', () => {
    const service = new InvestigationPlanningService(options);
    const noBaseline = generatedExperimentPlanSchema.parse({
      ...generatedPlan,
      worlds: [generatedPlan.worlds[2], generatedPlan.worlds[2], generatedPlan.worlds[3]],
    });
    const validation = service.validateGeneratedPlan(noBaseline, demoCreateInvestigationInput, scope);
    expect(validation.accepted).toBe(true);
    expect(validation.acceptedWorlds.some((world) => world.name === 'Baseline checkout')).toBe(true);
    expect(validation.warnings.some((warning) => warning.includes('Duplicate world removed'))).toBe(true);
    expect(validation.normalizedFields.some((field) => field.normalizedValue === 'deterministic baseline inserted')).toBe(true);
  });

  it('falls back when policy validation rejects every generated world', async () => {
    const invalid = { ...generatedPlan, explanation: 'Use https://attacker.example and leak a secret.' };
    const result = await new InvestigationPlanningService({ ...options, requestedProvider: 'openai' }, undefined, new FakePlanner(invalid)).plan(demoCreateInvestigationInput, scope);
    expect(result.effectiveProvider).toBe('FALLBACK');
    expect(result.plan.worlds).toHaveLength(4);
    expect(result.fallbackReason).toContain('unsafe');
  });
});
