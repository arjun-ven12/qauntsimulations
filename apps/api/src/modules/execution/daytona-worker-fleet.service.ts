import { logger } from '../../core/logging/logger.js';
import { DaytonaActiveExecutionRegistry } from './daytona-active-execution-registry.js';
import type { DaytonaFleetCapacityManager } from './daytona-fleet-capacity-manager.js';
import type {
  DaytonaFleetSnapshot,
  FleetEvent,
  FleetExecutionOptions,
  FleetExecutionSummary,
  FleetJob,
  FleetJobResult,
} from './daytona-fleet.types.js';
import { cancellableDelay, classifyFleetError, retryDelayMs } from './daytona-retry-classifier.js';

export class DaytonaWorkerFleet {
  private totalStarted = 0;
  private totalCompleted = 0;
  private totalRetries = 0;
  private cleanupFailures = 0;
  private peakConcurrency = 0;

  constructor(
    private readonly capacity: DaytonaFleetCapacityManager,
    private readonly registry = new DaytonaActiveExecutionRegistry(),
  ) {}

  async executeMany(jobs: FleetJob[], options: FleetExecutionOptions): Promise<FleetExecutionSummary> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    options.cancellationSignal?.addEventListener('abort', abortFromParent, { once: true });
    const signal = controller.signal;
    const maximumConcurrency = Math.max(1, Math.min(options.maximumConcurrency, jobs.length || 1));
    let nextIndex = 0;
    let sandboxCreations = 0;
    const results: Array<FleetJobResult | undefined> = Array.from({ length: jobs.length });

    await this.emit(options, {
      phase: 'fleet_created',
      message: 'Daytona fleet created.',
      metadata: {
        totalJobs: jobs.length,
        effectiveConcurrency: maximumConcurrency,
        maximumAttempts: options.retryPolicy.maximumAttempts,
        serverFleetCapacity: this.capacity.snapshot().maximum,
      },
    });

    const consume = async (): Promise<void> => {
      while (!signal.aborted) {
        if (Date.now() - startedAt > options.maximumDurationMs) {
          controller.abort();
          return;
        }
        const index = nextIndex++;
        if (index >= jobs.length) return;
        const job = jobs[index]!;
        results[index] = await this.executeJob(job, options, signal, () => {
          sandboxCreations++;
          if (sandboxCreations > options.maximumTotalSandboxCreations) {
            throw new Error('DAYTONA_MAX_TOTAL_SANDBOX_CREATIONS_PER_INVESTIGATION exceeded');
          }
        });
      }
    };

    await Promise.all(Array.from({ length: maximumConcurrency }, consume));

    if (signal.aborted) {
      for (let index = 0; index < jobs.length; index++) {
        if (!results[index]) {
          await jobs[index]?.cancelUnstarted?.();
          results[index] = {
            investigationId: jobs[index]!.investigationId,
            worldId: jobs[index]!.worldId,
            experimentId: jobs[index]!.experimentId,
            attempts: 0,
            status: 'CANCELLED',
            provider: 'DAYTONA',
            cleanupFailed: false,
            errorCode: 'CANCELLED',
            errorMessage: 'Investigation was cancelled before this world started.',
          };
        }
      }
    }

    options.cancellationSignal?.removeEventListener('abort', abortFromParent);
    const settled = results.filter((result): result is FleetJobResult => Boolean(result));
    const summary: FleetExecutionSummary = {
      total: jobs.length,
      succeeded: settled.filter(({ status }) => status === 'PASSED').length,
      invariantViolations: settled.filter(({ status }) => status === 'INVARIANT_VIOLATION').length,
      executionFailures: settled.filter(({ status }) => status === 'EXECUTION_FAILED').length,
      cancelled: settled.filter(({ status }) => status === 'CANCELLED').length,
      cleanupFailures: settled.filter(({ cleanupFailed }) => cleanupFailed).length,
      results: settled,
    };
    await this.emit(options, { phase: 'fleet_completed', message: 'Daytona fleet completed.', metadata: { ...summary } });
    return summary;
  }

  async cancelInvestigation(investigationId: string): Promise<void> {
    await this.registry.cancelInvestigation(investigationId);
  }

  getSnapshot(): DaytonaFleetSnapshot {
    return {
      activeSandboxes: this.registry.snapshot().length,
      waitingJobs: this.capacity.snapshot().waiting,
      totalStarted: this.totalStarted,
      totalCompleted: this.totalCompleted,
      totalRetries: this.totalRetries,
      cleanupFailures: this.cleanupFailures,
      peakConcurrency: Math.max(this.peakConcurrency, this.capacity.snapshot().peak),
    };
  }

  isSandboxActive(sandboxId: string): boolean {
    return this.registry.isActive(sandboxId);
  }

  private async executeJob(
    job: FleetJob,
    options: FleetExecutionOptions,
    signal: AbortSignal,
    beforeAttempt: () => void,
  ): Promise<FleetJobResult> {
    let attemptNumber = 0;
    let cleanupFailed = false;
    let lastErrorCode: string | undefined;
    let lastErrorMessage: string | undefined;

    while (!signal.aborted && attemptNumber < options.retryPolicy.maximumAttempts) {
      attemptNumber++;
      let permit;
      let sandboxId: string | undefined;
      const attemptController = new AbortController();
      const abortAttempt = () => attemptController.abort();
      signal.addEventListener('abort', abortAttempt, { once: true });
      try {
        permit = await this.acquire(job, options, signal);
        beforeAttempt();
        this.totalStarted++;
        this.peakConcurrency = Math.max(this.peakConcurrency, this.capacity.snapshot().active);
        await this.emit(options, {
          phase: attemptNumber === 1 ? 'world_attempt_started' : 'world_retry_started',
          message: `${job.worldId} attempt ${attemptNumber} started.`,
          worldId: job.worldId,
          experimentId: job.experimentId,
          workerId: job.workerId,
          metadata: { attemptNumber, maximumAttempts: options.retryPolicy.maximumAttempts },
        });
        const response = await job.executeAttempt({
          attemptNumber,
          maximumAttempts: options.retryPolicy.maximumAttempts,
          signal: attemptController.signal,
          emitEvent: async (event) => {
            sandboxId = event.sandboxId ?? sandboxId;
            if (event.sandboxId && event.phase === 'sandbox_ready') {
              this.registry.register({
                investigationId: job.investigationId,
                worldId: job.worldId,
                experimentId: job.experimentId,
                workerId: event.workerId ?? job.workerId,
                sandboxId: event.sandboxId,
                startedAt: new Date(),
                cancel: async () => attemptController.abort(),
              });
            }
            if (event.sandboxId && (event.phase === 'sandbox_deleted' || event.phase === 'sandbox_cleanup_failed')) {
              this.registry.unregister(event.sandboxId);
            }
            await this.emit(options, event);
          },
        });
        cleanupFailed = cleanupFailed || response.providerMetadata.cleanupOutcome === 'FAILED';
        if (cleanupFailed) this.cleanupFailures++;
        this.totalCompleted++;
        await this.emit(options, {
          phase: 'world_attempt_completed',
          message: `${job.worldId} attempt ${attemptNumber} completed.`,
          worldId: job.worldId,
          experimentId: job.experimentId,
          workerId: job.workerId,
          sandboxId,
          metadata: {
            attemptNumber,
            workerStatus: response.result.status,
            cleanupOutcome: response.providerMetadata.cleanupOutcome,
          },
        });
        const status = response.result.status === 'INVARIANT_VIOLATION' ? 'INVARIANT_VIOLATION' : response.result.status === 'PASSED' ? 'PASSED' : 'EXECUTION_FAILED';
        return { investigationId: job.investigationId, worldId: job.worldId, experimentId: job.experimentId, attempts: attemptNumber, status, provider: response.providerMetadata.provider, cleanupFailed };
      } catch (error) {
        const classification = classifyFleetError(error);
        lastErrorCode = classification.code;
        lastErrorMessage = classification.message;
        await this.emit(options, {
          phase: 'world_attempt_failed',
          message: `${job.worldId} attempt ${attemptNumber} failed.`,
          worldId: job.worldId,
          experimentId: job.experimentId,
          workerId: job.workerId,
          sandboxId,
          metadata: { attemptNumber, errorCode: classification.code, errorMessage: classification.message },
        });
        const canRetry =
          classification.retryable &&
          options.retryPolicy.retryableErrorCodes.includes(classification.code) &&
          attemptNumber < options.retryPolicy.maximumAttempts &&
          !signal.aborted;
        if (!canRetry) break;
        this.totalRetries++;
        const delayMs = retryDelayMs(attemptNumber, options.retryPolicy.baseDelayMs, options.retryPolicy.maximumDelayMs);
        await this.emit(options, {
          phase: 'world_retry_scheduled',
          message: `${job.worldId} retry scheduled.`,
          worldId: job.worldId,
          experimentId: job.experimentId,
          workerId: job.workerId,
          metadata: { attemptNumber, nextAttemptNumber: attemptNumber + 1, retryDelayMs: delayMs, retryReason: classification.code },
        });
        try {
          await cancellableDelay(delayMs, signal);
        } catch (delayError) {
          if (signal.aborted) break;
          throw delayError;
        }
      } finally {
        signal.removeEventListener('abort', abortAttempt);
        if (sandboxId) this.registry.unregister(sandboxId);
        permit?.release();
      }
    }

    return {
      investigationId: job.investigationId,
      worldId: job.worldId,
      experimentId: job.experimentId,
      attempts: attemptNumber,
      status: signal.aborted ? 'CANCELLED' : 'EXECUTION_FAILED',
      provider: 'DAYTONA',
      cleanupFailed,
      ...(lastErrorCode ? { errorCode: lastErrorCode } : {}),
      ...(lastErrorMessage ? { errorMessage: lastErrorMessage } : {}),
    };
  }

  private async acquire(job: FleetJob, options: FleetExecutionOptions, signal: AbortSignal) {
    const snapshot = this.capacity.snapshot();
    if (snapshot.active >= snapshot.maximum) {
      await this.emit(options, {
        phase: 'fleet_capacity_waiting',
        message: 'Waiting for Daytona fleet capacity.',
        worldId: job.worldId,
        experimentId: job.experimentId,
        workerId: job.workerId,
        metadata: snapshot,
      });
    }
    const permit = await this.capacity.acquire(signal);
    await this.emit(options, {
      phase: 'fleet_capacity_acquired',
      message: 'Daytona fleet capacity acquired.',
      worldId: job.worldId,
      experimentId: job.experimentId,
      workerId: job.workerId,
      metadata: this.capacity.snapshot(),
    });
    return permit;
  }

  private async emit(options: FleetExecutionOptions, event: FleetEvent): Promise<void> {
    logger.info({ investigationId: options.investigationId, ...event.metadata, phase: event.phase, worldId: event.worldId, experimentId: event.experimentId, workerId: event.workerId, sandboxId: event.sandboxId }, event.message);
    await options.emitEvent?.(event);
  }
}
