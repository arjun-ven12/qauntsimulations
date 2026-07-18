import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { workerJobSchema, type WorkerJob } from '@taskos/execution-contracts';
import type { DeterministicWorldDefinition } from '../experiments/services/deterministic-experiment-plan.service.js';
import type { PersistedLaunchSnapshot } from '../investigations/investigations.types.js';
import type { RuntimeInvariantDefinition } from '../invariants/invariants.types.js';
import type { RuntimeJourney } from '../journeys/journeys.types.js';

interface JobContext {
  investigationId: string;
  worldId: string;
  experimentId: string;
  workerId: string;
  environmentBaseUrl: string;
  environmentApiBaseUrl?: string;
  invariantId: string;
  world: DeterministicWorldDefinition;
  journey?: RuntimeJourney;
  invariants?: RuntimeInvariantDefinition[];
  launch?: PersistedLaunchSnapshot;
}

export class WorkerJobFactoryService {
  constructor(private readonly evidenceRoot: string, private readonly fixturePath?: string) {}

  async create(context: JobContext): Promise<WorkerJob> {
    const journey = context.journey
      ? workerJobSchema.shape.journey.parse(withPaymentSubmit(context.journey))
      : await this.explicitFixtureJourney();
    const invariants = context.invariants?.length
      ? context.invariants
      : this.explicitFixtureInvariants(context.invariantId);
    const outputDirectory = resolve(this.evidenceRoot, context.investigationId, context.worldId, context.experimentId, 'attempt-1');
    return workerJobSchema.parse({
      workerId: context.workerId,
      experimentId: context.experimentId,
      worldId: context.worldId,
      target: {
        baseUrl: context.environmentBaseUrl,
        ...(context.environmentApiBaseUrl ? { apiBaseUrl: context.environmentApiBaseUrl } : {}),
        journeyPath: firstJourneyPath(journey),
      },
      ...testSetup(context),
      browser: { engine: context.world.browser, viewport: context.world.viewport.startsWith('mobile') ? 'mobile' : 'desktop', headless: true },
      journey,
      world: {
        userProfile: context.world.userProfile,
        networkProfile: 'normal',
        latencyMs: 0,
        paymentDelayMs: context.world.paymentDelayMs,
        doubleSubmit: context.world.doubleSubmit,
        doubleSubmitIntervalMs: context.world.doubleSubmitIntervalMs,
        clearStorageBeforeRun: true,
        paymentUrlPatterns: requestPatterns(invariants, 'NO_DUPLICATE_PAYMENT', ['/api/payments']),
        orderUrlPatterns: requestPatterns(invariants, 'NO_DUPLICATE_ORDER', ['/api/orders']),
        randomSeed: context.world.randomSeed,
        reason: context.world.reason,
      },
      invariants,
      evidence: { outputDirectory, screenshots: true, trace: true, console: true, network: true, video: false },
      limits: { timeoutMs: 45_000 },
    });
  }

  private async explicitFixtureJourney(): Promise<WorkerJob['journey']> {
    if (!this.fixturePath) throw new Error('Persisted launch Journey snapshot is missing');
    const fixture = JSON.parse(await readFile(this.fixturePath, 'utf8')) as Record<string, unknown>;
    const fixtureJourney = workerJobSchema.shape.journey.parse(fixture);
    return workerJobSchema.shape.journey.parse(withPaymentSubmit(fixtureJourney));
  }

  private explicitFixtureInvariants(invariantId: string): WorkerJob['invariants'] {
    if (!this.fixturePath) throw new Error('Persisted launch Invariant snapshots are missing');
    return [
      { id: invariantId, type: 'NO_DUPLICATE_PAYMENT', severity: 'CRITICAL', config: { requestPatterns: ['/api/payments'], methods: ['POST'] } },
      { id: invariantId, type: 'NO_DUPLICATE_ORDER', severity: 'CRITICAL', config: { requestPatterns: ['/api/orders'], methods: ['POST'], orderIdSelector: '[data-testid="order-id"]' } },
    ];
  }
}

function withPaymentSubmit(journey: WorkerJob['journey'] | RuntimeJourney): WorkerJob['journey'] {
  const steps = normaliseLegacyCartOrder(journey.steps);
  return workerJobSchema.shape.journey.parse({
    ...journey,
    steps: steps.map((step) =>
      step.type === 'click' && /pay|payment|submit/i.test(step.selector)
        ? { ...step, type: 'submitPayment' as const, name: step.name ?? 'Submit payment' }
        : step,
    ),
  });
}

function normaliseLegacyCartOrder(steps: Array<WorkerJob['journey']['steps'][number] | RuntimeJourney['steps'][number]>) {
  const normalised = [...steps];
  for (let index = 0; index < normalised.length - 1; index += 1) {
    const current = normalised[index];
    const next = normalised[index + 1];
    const currentWaitsForCartItem = current
      && (current.type === 'waitFor' || current.type === 'assertVisible')
      && current.selector === '[data-testid="cart-item"]';
    const nextOpensCart = next
      && next.type === 'click'
      && next.selector === '[data-testid="open-cart"]';
    if (currentWaitsForCartItem && nextOpensCart) {
      normalised[index] = next;
      normalised[index + 1] = current;
    }
  }
  return normalised;
}

function firstJourneyPath(journey: WorkerJob['journey']): string | undefined {
  return journey.steps.find((step) => step.type === 'goto')?.path;
}

function requestPatterns(
  invariants: WorkerJob['invariants'],
  type: 'NO_DUPLICATE_PAYMENT' | 'NO_DUPLICATE_ORDER',
  fallback: string[],
): string[] {
  const config = invariants.find((invariant) => invariant.type === type)?.config;
  const patterns = config && Array.isArray(config.requestPatterns)
    ? config.requestPatterns.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.length > 0)
    : [];
  return patterns.length ? patterns : fallback;
}

function testSetup(context: JobContext): { testSetup?: WorkerJob['testSetup'] } {
  const reset = context.launch?.environment.reset;
  const resetPath = pathOnly(reset?.endpoint);
  const canReset = reset?.method === 'POST' && resetPath === '/api/test/reset';
  const canConfigureDemo = context.launch?.environment.payment?.mode === 'MOCK';
  if (!canReset && !canConfigureDemo) return {};
  return {
    testSetup: {
      ...(canReset ? { reset: { method: 'POST', path: '/api/test/reset' } } : {}),
      ...(canConfigureDemo
        ? { configuration: { method: 'POST', path: '/api/test/config', body: { duplicateSubmissionBug: context.world.duplicateSubmissionBug, paymentDelayMs: context.world.paymentDelayMs } } }
        : {}),
    },
  };
}

function pathOnly(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return value.startsWith('/') ? value : new URL(value).pathname;
  } catch {
    return undefined;
  }
}
