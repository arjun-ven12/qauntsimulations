import type { InvariantEvaluationResult, WorkerResult } from '@taskos/execution-contracts';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeInvariantDefinition } from '../../invariants/invariants.types.js';
import {
  correlateInvariantEvaluations,
  InvariantEvaluationCorrelationError,
} from '../invariant-evaluation-correlation.js';
import { InvestigationRepository } from '../investigations.repository.js';
import type { PersistedWorldExecution } from '../investigations.types.js';

const selectedInvariants: RuntimeInvariantDefinition[] = [
  {
    id: 'invariant-payment',
    type: 'NO_DUPLICATE_PAYMENT',
    severity: 'CRITICAL',
    config: { requestPatterns: ['/api/payments'], methods: ['POST'] },
  },
  {
    id: 'invariant-order',
    type: 'NO_DUPLICATE_ORDER',
    severity: 'HIGH',
    config: { requestPatterns: ['/api/orders'], methods: ['POST'] },
  },
];

function evaluation(
  invariantId: string,
  type: 'NO_DUPLICATE_PAYMENT' | 'NO_DUPLICATE_ORDER',
  passed: boolean,
): InvariantEvaluationResult {
  return {
    invariantId,
    type,
    passed,
    expected: { maximum: 1 },
    observed: { count: passed ? 1 : 2 },
    confidence: 1,
    evidenceReferences: [],
    explanation: passed ? 'Passed' : 'Failed',
  };
}

const payment = (passed: boolean) =>
  evaluation('invariant-payment', 'NO_DUPLICATE_PAYMENT', passed);
const order = (passed: boolean) =>
  evaluation('invariant-order', 'NO_DUPLICATE_ORDER', passed);

describe('multi-Invariant evaluation correlation', () => {
  it.each([
    ['both passing', [payment(true), order(true)]],
    ['payment failing and order passing', [payment(false), order(true)]],
    ['payment passing and order failing', [payment(true), order(false)]],
    ['both failing', [payment(false), order(false)]],
    ['different worker order', [order(true), payment(false)]],
  ])('correlates %s by persisted Invariant ID', (_name, evaluations) => {
    expect(
      correlateInvariantEvaluations(selectedInvariants, evaluations).map(
        ({ invariant, evaluation: item }) => [invariant.id, item.invariantId, item.passed],
      ),
    ).toEqual(evaluations.map((item) => [item.invariantId, item.invariantId, item.passed]));
  });

  it('rejects missing evaluation output', () => {
    expect(() => correlateInvariantEvaluations(selectedInvariants, [payment(true)]))
      .toThrow(InvariantEvaluationCorrelationError);
  });

  it('rejects duplicate evaluator output', () => {
    expect(() => correlateInvariantEvaluations(selectedInvariants, [payment(true), payment(false), order(true)]))
      .toThrow(/duplicate output/);
  });

  it('rejects an unknown persisted Invariant ID', () => {
    expect(() => correlateInvariantEvaluations(selectedInvariants, [
      payment(true),
      evaluation('invariant-unknown', 'NO_DUPLICATE_ORDER', true),
    ])).toThrow(/unknown Invariant ID/);
  });

  it('rejects a mismatched evaluator identifier for a known Invariant', () => {
    expect(() => correlateInvariantEvaluations(selectedInvariants, [
      evaluation('invariant-payment', 'NO_DUPLICATE_ORDER', true),
      order(true),
    ])).toThrow(/does not match persisted Invariant/);
  });
});

describe('InvestigationRepository multi-Invariant persistence', () => {
  it.each([
    ['both passing', [payment(true), order(true)], []],
    ['payment failing', [payment(false), order(true)], ['invariant-payment']],
    ['order failing', [payment(true), order(false)], ['invariant-order']],
    ['both failing in reverse output order', [order(false), payment(false)], ['invariant-order', 'invariant-payment']],
  ])('persists the correct source Invariant when %s', async (_name, evaluations, expectedFailedIds) => {
    const fixture = persistenceFixture();
    const repository = new InvestigationRepository(fixture.database as never);

    await repository.completeExecution(completedInput(evaluations));

    expect(fixture.evaluationCreates.map(({ invariantId, passed }) => ({ invariantId, passed })))
      .toEqual(evaluations.map((item) => ({ invariantId: item.invariantId, passed: item.passed })));
    expect(fixture.evaluationCreates.every((item) => item.invariantId !== 'legacy-first-invariant'))
      .toBe(true);
    if (expectedFailedIds.length) {
      expect(fixture.findingCreates).toHaveLength(1);
      expect(fixture.findingCreates[0]?.causalConditions).toMatchObject({
        failedInvariantIds: expectedFailedIds,
      });
    } else {
      expect(fixture.findingCreates).toHaveLength(0);
    }
  });

  it.each([
    ['missing', [payment(true)]],
    ['duplicate', [payment(true), payment(false), order(true)]],
    ['unknown', [payment(true), evaluation('invariant-unknown', 'NO_DUPLICATE_ORDER', true)]],
  ])('persists nothing for %s evaluation output', async (_name, evaluations) => {
    const fixture = persistenceFixture();
    const repository = new InvestigationRepository(fixture.database as never);

    await expect(repository.completeExecution(completedInput(evaluations))).rejects
      .toBeInstanceOf(InvariantEvaluationCorrelationError);

    expect(fixture.transaction).not.toHaveBeenCalled();
    expect(fixture.evaluationCreates).toEqual([]);
    expect(fixture.findingCreates).toEqual([]);
  });
});

function completedInput(invariantEvaluations: InvariantEvaluationResult[]) {
  const failed = invariantEvaluations.some(({ passed }) => !passed);
  const now = '2026-07-17T00:00:00.000Z';
  const result: WorkerResult = {
    workerId: 'worker', experimentId: 'experiment', worldId: 'world',
    status: failed ? 'INVARIANT_VIOLATION' : 'PASSED',
    startedAt: now, completedAt: now, durationMs: 10,
    journey: { completed: true, completedSteps: 1, totalSteps: 1 },
    invariantEvaluations,
    metrics: {
      requestCount: 2, failedRequestCount: 0, checkoutInteractionCount: 1,
      paymentRequestCount: 1, successfulPaymentResponseCount: 1,
      orderRequestCount: 1, successfulOrderResponseCount: 1, consoleErrorCount: 0,
    },
    evidence: { manifestPath: 'evidence/manifest.json', screenshotPaths: [] },
    appliedFaults: [],
  };
  return {
    execution: execution(), result, exitCode: failed ? 2 : 0, artifacts: [],
    providerMetadata: { provider: 'LOCAL' },
  } as never;
}

function execution(): PersistedWorldExecution {
  return {
    investigationId: 'investigation', organisationId: 'organisation', projectId: 'project',
    environmentBaseUrl: 'http://localhost:5174',
    invariantId: 'legacy-first-invariant',
    journey: {
      id: 'journey', name: 'Journey',
      steps: [{ type: 'goto', path: '/' }],
      successCondition: { type: 'visible', selector: '#done' },
    },
    invariants: selectedInvariants,
    launch: {
      inputSource: 'PERSISTED_CONFIGURATION', actorUserId: 'user',
      launchedAt: '2026-07-17T00:00:00.000Z',
      scenario: { prompt: 'Test', controls: { browsers: ['chromium'], viewports: ['desktop'], networkProfiles: ['normal'], maximumWorlds: 1, maximumConcurrentWorkers: 1 } },
      environment: { id: 'environment', name: 'Environment', type: 'LOCAL', baseUrl: 'http://localhost:5174' },
      journey: { id: 'journey', name: 'Journey', steps: [{ type: 'goto', path: '/' }], successCondition: { type: 'visible', selector: '#done' } },
      invariants: selectedInvariants,
      safety: { domainAllowlist: ['localhost'], allowedHttpMethods: ['GET', 'POST'], permitCheckoutSubmission: true, permitMockPayment: true, permitTestOrderCreation: true, prohibitedActions: [] },
      validation: { status: 'READY', warnings: [] },
    },
    worldId: 'world', experimentId: 'experiment', workerId: 'worker', attemptId: 'attempt',
    world: {
      key: 'world', name: 'World', browser: 'chromium', viewport: 'desktop-1440x900',
      networkProfile: 'normal', userProfile: 'normal', paymentDelayMs: 1000,
      duplicateSubmissionBug: true, doubleSubmit: true, doubleSubmitIntervalMs: 100,
      expectedOutcome: 'OBSERVE', reason: 'Test', randomSeed: 1, creationOrder: 0,
    },
    provider: 'LOCAL', attemptNumber: 1, maximumAttempts: 1,
  };
}

function persistenceFixture() {
  const evaluationCreates: Array<{ invariantId: string; passed: boolean }> = [];
  const findingCreates: Array<{ causalConditions: Record<string, unknown> }> = [];
  let evaluationSequence = 0;
  const transactionClient = {
    executionAttempt: { update: vi.fn() },
    worker: { update: vi.fn() },
    experiment: { update: vi.fn() },
    world: { update: vi.fn() },
    evidenceArtifact: { create: vi.fn() },
    invariantEvaluation: {
      create: vi.fn(async ({ data }: { data: { invariantId: string; passed: boolean } }) => {
        evaluationCreates.push(data);
        return { id: `evaluation-${++evaluationSequence}` };
      }),
    },
    investigationEvent: { create: vi.fn() },
    finding: {
      upsert: vi.fn(async ({ create }: { create: { causalConditions: Record<string, unknown> } }) => {
        findingCreates.push(create);
        return { id: 'finding', reproductionCount: 1 };
      }),
    },
    findingEvidence: { createMany: vi.fn() },
  };
  const transaction = vi.fn(async (callback: (client: typeof transactionClient) => unknown) => callback(transactionClient));
  return {
    database: { $transaction: transaction },
    transaction,
    evaluationCreates,
    findingCreates,
  };
}
