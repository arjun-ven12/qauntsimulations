import type { WorkerResult } from '@taskos/execution-contracts';
import { describe, expect, it } from 'vitest';
import type { SandboxHandle, SandboxProvider } from '../../../integrations/daytona/daytona.types.js';
import { DaytonaActiveExecutionRegistry } from '../daytona-active-execution-registry.js';
import { DaytonaFleetCapacityManager } from '../daytona-fleet-capacity-manager.js';
import type { FleetJob } from '../daytona-fleet.types.js';
import { DaytonaOrphanCleanupService } from '../daytona-orphan-cleanup.service.js';
import { retryDelayMs } from '../daytona-retry-classifier.js';
import { DaytonaWorkerFleet } from '../daytona-worker-fleet.service.js';

const result = (status: WorkerResult['status']): WorkerResult => ({
  workerId: 'worker',
  experimentId: 'experiment',
  worldId: 'world',
  status,
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:01.000Z',
  durationMs: 1_000,
  journey: { completed: true, completedSteps: 1, totalSteps: 1 },
  invariantEvaluations: status === 'INVARIANT_VIOLATION' ? [{
    invariantId: 'invariant',
    type: 'NO_DUPLICATE_PAYMENT',
    passed: false,
    expected: { maximumPaymentRequests: 1 },
    observed: { paymentRequests: 2 },
    confidence: 1,
    evidenceReferences: [],
    explanation: 'Duplicate payment request observed.',
  }] : [],
  metrics: {
    requestCount: 1,
    failedRequestCount: 0,
    checkoutInteractionCount: 1,
    paymentRequestCount: status === 'INVARIANT_VIOLATION' ? 2 : 1,
    successfulPaymentResponseCount: status === 'INVARIANT_VIOLATION' ? 2 : 1,
    orderRequestCount: status === 'INVARIANT_VIOLATION' ? 2 : 1,
    successfulOrderResponseCount: status === 'INVARIANT_VIOLATION' ? 2 : 1,
    consoleErrorCount: 0,
  },
  evidence: { manifestPath: '/tmp/manifest.json', screenshotPaths: [] },
  appliedFaults: [],
});

const options = {
  investigationId: 'investigation',
  maximumConcurrency: 2,
  retryPolicy: {
    maximumAttempts: 2,
    baseDelayMs: 0,
    maximumDelayMs: 0,
    retryableErrorCodes: ['DAYTONA_SANDBOX_CREATION_FAILED', 'DAYTONA_RATE_LIMITED'],
  },
  maximumTotalSandboxCreations: 8,
  maximumDurationMs: 60_000,
};

function job(index: number, execute: FleetJob['executeAttempt']): FleetJob {
  return {
    investigationId: 'investigation',
    worldId: `world-${index}`,
    experimentId: `experiment-${index}`,
    workerId: `worker-${index}`,
    creationOrder: index,
    executeAttempt: execute,
  };
}

describe('DaytonaWorkerFleet', () => {
  it('runs four jobs with concurrency two and releases slots after success', async () => {
    let active = 0;
    let peak = 0;
    const jobs = [0, 1, 2, 3].map((index) => job(index, async ({ emitEvent }) => {
      active++;
      peak = Math.max(peak, active);
      await emitEvent({ phase: 'sandbox_ready', message: 'ready', sandboxId: `sandbox-${index}` });
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      await emitEvent({ phase: 'sandbox_deleted', message: 'deleted', sandboxId: `sandbox-${index}` });
      return { result: result('PASSED'), exitCode: 0, providerMetadata: { provider: 'DAYTONA', cleanupOutcome: 'DELETED' } };
    }));
    const fleet = new DaytonaWorkerFleet(new DaytonaFleetCapacityManager(2));
    const summary = await fleet.executeMany(jobs, options);
    expect(peak).toBeLessThanOrEqual(2);
    expect(summary).toMatchObject({ total: 4, succeeded: 4, executionFailures: 0 });
    expect(fleet.getSnapshot()).toMatchObject({ activeSandboxes: 0, peakConcurrency: 2 });
  });

  it('continues after one failure and retries retryable infrastructure failures once', async () => {
    let attempts = 0;
    const fleet = new DaytonaWorkerFleet(new DaytonaFleetCapacityManager(2));
    const summary = await fleet.executeMany([
      job(1, async () => ({ result: result('PASSED'), exitCode: 0, providerMetadata: { provider: 'DAYTONA', cleanupOutcome: 'DELETED' } })),
      job(2, async () => {
        attempts++;
        if (attempts === 1) throw new Error('Unable to create Daytona EU sandbox');
        return { result: result('PASSED'), exitCode: 0, providerMetadata: { provider: 'DAYTONA', cleanupOutcome: 'DELETED' } };
      }),
      job(3, async () => ({ result: result('INVARIANT_VIOLATION'), exitCode: 2, providerMetadata: { provider: 'DAYTONA', cleanupOutcome: 'DELETED' } })),
      job(4, async () => { throw new Error('JOURNEY_SELECTOR_MISSING'); }),
    ], options);
    expect(attempts).toBe(2);
    expect(summary).toMatchObject({ succeeded: 2, invariantViolations: 1, executionFailures: 1 });
    expect(summary.results.map(({ attempts: count }) => count)).toEqual([1, 2, 1, 1]);
  });

  it('does not retry invariant violations or cleanup failures after a valid result', async () => {
    const fleet = new DaytonaWorkerFleet(new DaytonaFleetCapacityManager(1));
    const summary = await fleet.executeMany([
      job(1, async () => ({ result: result('INVARIANT_VIOLATION'), exitCode: 2, providerMetadata: { provider: 'DAYTONA', cleanupOutcome: 'FAILED', cleanupError: 'delete failed' } })),
    ], options);
    expect(summary).toMatchObject({ invariantViolations: 1, cleanupFailures: 1 });
    expect(summary.results[0]?.attempts).toBe(1);
  });

  it('interrupts queued jobs and retry delay on cancellation', async () => {
    const controller = new AbortController();
    const fleet = new DaytonaWorkerFleet(new DaytonaFleetCapacityManager(1));
    const summaryPromise = fleet.executeMany([
      job(1, async () => { throw new Error('Unable to create Daytona EU sandbox'); }),
      job(2, async () => ({ result: result('PASSED'), exitCode: 0, providerMetadata: { provider: 'DAYTONA' } })),
    ], {
      ...options,
      retryPolicy: { ...options.retryPolicy, baseDelayMs: 10_000, maximumDelayMs: 10_000 },
      cancellationSignal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    const summary = await summaryPromise;
    expect(summary.cancelled).toBeGreaterThanOrEqual(1);
  });

  it('bounds retry delay', () => {
    for (let index = 0; index < 10; index++) {
      expect(retryDelayMs(5, 1_000, 1_500)).toBeLessThanOrEqual(1_500);
    }
  });
});

class FakeProvider implements SandboxProvider {
  deleted: string[] = [];
  constructor(private readonly sandboxes: SandboxHandle[]) {}
  async *listSandboxes() { yield* this.sandboxes; }
  async deleteSandbox(sandbox: SandboxHandle) { this.deleted.push(sandbox.id); }
  async createSandbox(): Promise<SandboxHandle> { throw new Error('unused'); }
  async uploadFiles() { throw new Error('unused'); }
  async executeCommand() { throw new Error('unused'); return { exitCode: 1, stdout: '', stderr: '' }; }
  async startProcess() { throw new Error('unused'); return { processId: '', commandId: '' }; }
  async waitForProcess() { throw new Error('unused'); return { exitCode: 1, stdout: '', stderr: '' }; }
  async getProcessLogs() { throw new Error('unused'); return { exitCode: 1, stdout: '', stderr: '' }; }
  async downloadFiles() { throw new Error('unused'); }
  async stopProcess() { throw new Error('unused'); }
  async getSandboxStatus() { return 'READY' as const; }
}

describe('DaytonaOrphanCleanupService', () => {
  it('detects stale TaskOS sandboxes, skips active sandboxes, and supports dry-run', async () => {
    const registry = new DaytonaActiveExecutionRegistry();
    registry.register({ investigationId: 'i', worldId: 'w', experimentId: 'e', sandboxId: 'active', startedAt: new Date(), cancel: async () => undefined });
    const provider = new FakeProvider([
      { id: 'active', name: 'active', status: 'READY', target: 'eu', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'stale', name: 'stale', status: 'READY', target: 'eu', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const result = await new DaytonaOrphanCleanupService(provider, registry).run({ dryRun: true, olderThanMinutes: 1 });
    expect(result.candidates.map(({ sandboxId }) => sandboxId)).toEqual(['stale']);
    expect(result.skippedActive).toEqual(['active']);
    expect(provider.deleted).toEqual([]);
  });
});
