import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { WorkerJobFactoryService } from '../worker-job-factory.service.js';
import type { PersistedLaunchSnapshot } from '../../investigations/investigations.types.js';

const launch: PersistedLaunchSnapshot = {
  inputSource: 'PERSISTED_CONFIGURATION',
  actorUserId: 'user-owner',
  launchedAt: '2026-07-17T00:00:00.000Z',
  scenario: {
    prompt: 'Verify persisted checkout configuration.',
    controls: {
      browsers: ['chromium'],
      viewports: ['desktop-1440x900'],
      networkProfiles: ['normal'],
      maximumWorlds: 1,
      maximumConcurrentWorkers: 1,
    },
  },
  environment: {
    id: 'environment-ready',
    name: 'Demo',
    type: 'DEMO',
    baseUrl: 'http://localhost:5174',
    reset: { mode: 'HTTP_ENDPOINT', endpoint: '/api/test/reset', method: 'POST', beforeEachWorld: true },
    payment: { mode: 'MOCK' },
    allowedActions: ['PERFORM_CHECKOUT', 'SUBMIT_MOCK_PAYMENT', 'CREATE_TEST_ORDER'],
  },
  journey: {
    id: 'journey-persisted',
    name: 'Persisted checkout',
    steps: [
      { type: 'goto', path: '/products/test-product' },
      { type: 'click', selector: '[data-testid="pay-button"]', name: 'Persisted pay' },
    ],
    successCondition: { type: 'visible', selector: '[data-testid="order-confirmation"]' },
  },
  invariants: [
    {
      id: 'payment-invariant',
      type: 'NO_DUPLICATE_PAYMENT',
      severity: 'CRITICAL',
      config: { requestPatterns: ['/persisted/payments'], methods: ['POST'] },
    },
    {
      id: 'order-invariant',
      type: 'NO_DUPLICATE_ORDER',
      severity: 'HIGH',
      config: { requestPatterns: ['/persisted/orders'], methods: ['POST'] },
    },
  ],
  safety: {
    domainAllowlist: ['localhost'],
    allowedHttpMethods: ['GET', 'POST'],
    permitCheckoutSubmission: true,
    permitMockPayment: true,
    permitTestOrderCreation: true,
    prohibitedActions: [],
  },
  validation: { status: 'READY', warnings: [] },
};

describe('WorkerJobFactoryService persisted launch inputs', () => {
  let evidenceRoot: string | undefined;

  afterEach(async () => {
    if (evidenceRoot) await rm(evidenceRoot, { recursive: true, force: true });
    evidenceRoot = undefined;
  });

  it('constructs WorkerJob from persisted Journey and Invariant snapshots', async () => {
    evidenceRoot = await mkdtemp(join(tmpdir(), 'taskos-worker-job-'));
    const job = await new WorkerJobFactoryService(evidenceRoot).create({
      investigationId: 'investigation',
      worldId: 'world',
      experimentId: 'experiment',
      workerId: 'worker',
      environmentBaseUrl: launch.environment.baseUrl,
      invariantId: 'unused-legacy-id',
      world: {
        key: 'baseline',
        name: 'Baseline',
        browser: 'chromium',
        viewport: 'desktop-1440x900',
        networkProfile: 'normal',
        userProfile: 'impatient',
        paymentDelayMs: 1200,
        duplicateSubmissionBug: false,
        doubleSubmit: true,
        doubleSubmitIntervalMs: 100,
        expectedOutcome: 'PASS',
        reason: 'Persisted launch worker job test.',
        randomSeed: 1,
        creationOrder: 0,
      },
      journey: launch.journey,
      invariants: launch.invariants,
      launch,
    });

    expect(job.journey.id).toBe('journey-persisted');
    expect(job.journey.steps[1]).toMatchObject({ type: 'submitPayment', selector: '[data-testid="pay-button"]' });
    expect(job.invariants.map(({ id }) => id)).toEqual(['payment-invariant', 'order-invariant']);
    expect(job.world.paymentUrlPatterns).toEqual(['/persisted/payments']);
    expect(job.world.orderUrlPatterns).toEqual(['/persisted/orders']);
    expect(job.testSetup).toMatchObject({
      reset: { method: 'POST', path: '/api/test/reset' },
      configuration: { method: 'POST', path: '/api/test/config' },
    });
    expect(JSON.stringify(job)).not.toContain('checkout-journey.json');
  });

  it('fails closed when no persisted snapshots or explicit fixture path are available', async () => {
    evidenceRoot = await mkdtemp(join(tmpdir(), 'taskos-worker-job-'));
    await expect(
      new WorkerJobFactoryService(evidenceRoot).create({
        investigationId: 'investigation',
        worldId: 'world',
        experimentId: 'experiment',
        workerId: 'worker',
        environmentBaseUrl: 'http://localhost:5174',
        invariantId: 'invariant',
        world: {
          key: 'baseline',
          name: 'Baseline',
          browser: 'chromium',
          viewport: 'desktop-1440x900',
          networkProfile: 'normal',
          userProfile: 'normal',
          paymentDelayMs: 0,
          duplicateSubmissionBug: false,
          doubleSubmit: false,
          doubleSubmitIntervalMs: 100,
          expectedOutcome: 'PASS',
          reason: 'Missing persisted launch worker job test.',
          randomSeed: 1,
          creationOrder: 0,
        },
      }),
    ).rejects.toThrow('Persisted launch Journey snapshot is missing');
  });
});
