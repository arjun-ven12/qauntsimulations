import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { workerJobSchema, type WorkerJob } from '@taskos/execution-contracts';
import type { DeterministicWorldDefinition } from '../experiments/services/deterministic-experiment-plan.service.js';

interface JobContext {
  investigationId: string;
  worldId: string;
  experimentId: string;
  workerId: string;
  environmentBaseUrl: string;
  invariantId: string;
  world: DeterministicWorldDefinition;
}

export class WorkerJobFactoryService {
  constructor(private readonly evidenceRoot: string, private readonly fixturePath: string) {}

  async create(context: JobContext): Promise<WorkerJob> {
    const fixture = JSON.parse(await readFile(this.fixturePath, 'utf8')) as Record<string, unknown>;
    const fixtureJourney = workerJobSchema.shape.journey.parse(fixture);
    const journey = workerJobSchema.shape.journey.parse({ ...fixtureJourney, steps: fixtureJourney.steps.map((step) => step.type === 'click' && step.selector === '[data-testid="pay-button"]' ? { ...step, type: 'submitPayment' as const, name: step.name ?? 'Submit payment' } : step) });
    const outputDirectory = resolve(this.evidenceRoot, context.investigationId, context.worldId, context.experimentId, 'attempt-1');
    return workerJobSchema.parse({
      workerId: context.workerId,
      experimentId: context.experimentId,
      worldId: context.worldId,
      target: { baseUrl: context.environmentBaseUrl, journeyPath: fixture.startPath },
      testSetup: {
        reset: { method: 'POST', path: '/api/test/reset' },
        configuration: { method: 'POST', path: '/api/test/config', body: { duplicateSubmissionBug: context.world.duplicateSubmissionBug, paymentDelayMs: context.world.paymentDelayMs } },
      },
      browser: { engine: context.world.browser, viewport: context.world.viewport.startsWith('mobile') ? 'mobile' : 'desktop', headless: true },
      journey,
      world: {
        userProfile: context.world.userProfile,
        networkProfile: 'normal',
        latencyMs: 0,
        doubleSubmit: context.world.doubleSubmit,
        doubleSubmitIntervalMs: context.world.doubleSubmitIntervalMs,
        clearStorageBeforeRun: true,
        paymentUrlPatterns: ['/api/payments'],
        orderUrlPatterns: ['/api/orders'],
        randomSeed: context.world.randomSeed,
        reason: context.world.reason,
      },
      invariants: [
        { id: context.invariantId, type: 'NO_DUPLICATE_PAYMENT', severity: 'CRITICAL', config: { requestPatterns: ['/api/payments'], methods: ['POST'] } },
        { id: context.invariantId, type: 'NO_DUPLICATE_ORDER', severity: 'CRITICAL', config: { requestPatterns: ['/api/orders'], methods: ['POST'], orderIdSelector: '[data-testid="order-id"]' } },
      ],
      evidence: { outputDirectory, screenshots: true, trace: true, console: true, network: true, video: false },
      limits: { timeoutMs: 45_000 },
    });
  }
}
