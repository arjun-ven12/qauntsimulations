import { OpenAIClient, OpenAIExperimentPlanner } from '@taskos/ai-providers';
import { demoCreateInvestigationInput } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import { InvestigationPlanningService } from '../investigation-planning.service.js';

const enabled = process.env.RUN_OPENAI_PLANNER_INTEGRATION_TESTS === 'true'
  && process.env.OPENAI_API_KEY
  && (process.env.OPENAI_PLANNER_MODEL || process.env.OPENAI_MODEL_PLANNER);
const suite = enabled ? describe : describe.skip;

suite('live OpenAI experiment planner', () => {
  it('returns a schema-valid, policy-valid initial checkout plan', { timeout: 90_000 }, async () => {
    const model = process.env.OPENAI_PLANNER_MODEL ?? process.env.OPENAI_MODEL_PLANNER;
    if (!process.env.OPENAI_API_KEY || !model) throw new Error('OpenAI planner configuration is missing');
    const planner = new OpenAIExperimentPlanner(
      new OpenAIClient({
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
        timeoutMs: Number(process.env.OPENAI_PLANNER_TIMEOUT_MS ?? 30_000),
        maxRetries: Number(process.env.OPENAI_PLANNER_MAX_RETRIES ?? 1),
      }),
      model,
    );
    const service = new InvestigationPlanningService(
      {
        requestedProvider: 'openai',
        fallbackEnabled: true,
        maximumWorlds: 8,
        maximumVariables: 6,
        maximumAssumptions: 10,
        maximumWarnings: 20,
        timeoutMs: Number(process.env.OPENAI_PLANNER_TIMEOUT_MS ?? 30_000),
        maxProviderAttempts: Number(process.env.OPENAI_PLANNER_MAX_RETRIES ?? 1) + 1,
        maxOutputTokens: Number(process.env.OPENAI_PLANNER_MAX_OUTPUT_TOKENS ?? 3_000),
        model,
      },
      undefined,
      planner,
    );
    const result = await service.plan(
      {
        ...demoCreateInvestigationInput,
        scenario: {
          ...demoCreateInvestigationInput.scenario,
          prompt: 'Test whether impatient repeated checkout actions during delayed payment responses can create duplicate payments or orders. Include a healthy baseline and controlled comparisons.',
        },
      },
      {
        projectId: 'project_demo_checkout',
        projectName: 'TaskOS Demo Commerce',
        environmentId: 'environment_demo_local',
        environmentName: 'Local demo',
        journeyId: 'journey_checkout',
        journeyName: 'Checkout',
        scenarioId: 'scenario_duplicate_submission',
        invariantIds: ['invariant_single_checkout_submission'],
        invariants: [{ id: 'invariant_single_checkout_submission', name: 'Single checkout submission' }],
      },
    );
    expect(['OPENAI', 'FALLBACK']).toContain(result.effectiveProvider);
    expect(result.validation.accepted).toBe(true);
    expect(result.plan.worlds.length).toBeGreaterThan(0);
    expect(result.plan.worlds.some((world) => !world.duplicateSubmissionBug && !world.doubleSubmit && world.paymentDelayMs === 0)).toBe(true);
    console.log(JSON.stringify({
      effectiveProvider: result.effectiveProvider,
      plannerStatus: result.plannerStatus,
      model: result.generation?.model,
      usage: result.generation?.usage,
      acceptedWorlds: result.validation.acceptedWorlds.length,
      rejectedWorlds: result.validation.rejectedWorlds.length,
      warnings: result.validation.warnings,
      fallbackReason: result.fallbackReason,
    }, null, 2));
  });
});
