import type { WorkerResult } from '@taskos/execution-contracts';
import { logger } from '../../core/logging/logger.js';
import type { LocalEvidenceMetadataService } from '../evidence/local-evidence-metadata.service.js';
import type { InvestigationRepository } from '../investigations/investigations.repository.js';
import type { CreatedWorldRecord, InvestigationOrchestrationContext, PersistedWorldExecution } from '../investigations/investigations.types.js';
import { ExecutionConcurrencyService } from './execution-concurrency.service.js';
import type { WorkerExecutionEvent, WorkerExecutor } from './worker-executor.types.js';
import type { WorkerJobFactoryService } from './worker-job-factory.service.js';

type OrchestrationRepository = Pick<InvestigationRepository, 'orchestrationContext' | 'queueInitialWorlds' | 'transitionToRunning' | 'beginWorld' | 'completeExecution' | 'failExecution' | 'finishInvestigation' | 'failInvestigation' | 'isCancelled' | 'recordExecutionEvent'>;

export class InvestigationOrchestratorService {
  private readonly active = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: OrchestrationRepository,
    private readonly executor: WorkerExecutor,
    private readonly jobs: WorkerJobFactoryService,
    private readonly evidence: LocalEvidenceMetadataService,
    private readonly concurrency = new ExecutionConcurrencyService(2),
  ) {}

  start(investigationId: string): void {
    if (this.active.has(investigationId)) return;
    const task = this.run(investigationId)
      .catch(async (error) => {
        logger.error({ err: error, investigationId, provider: this.executor.provider, status: 'FAILED' }, 'Investigation orchestration failed');
        await this.repository.failInvestigation(investigationId, error);
      })
      .finally(() => this.active.delete(investigationId));
    this.active.set(investigationId, task);
  }

  isActive(investigationId: string): boolean { return this.active.has(investigationId); }

  private async run(investigationId: string): Promise<void> {
    if (await this.repository.isCancelled(investigationId)) return;
    const context = await this.repository.orchestrationContext(investigationId);
    if (!context) throw new Error('Persisted investigation plan is missing');
    const worlds = await this.repository.queueInitialWorlds(context);
    await this.repository.transitionToRunning(investigationId);
    const maximumConcurrency = this.executor.provider === 'DAYTONA' ? 1 : context.plan.maximumConcurrentWorkers;
    logger.info({ investigationId, provider: this.executor.provider, worldCount: worlds.length, maximumConcurrency, status: 'RUNNING' }, 'Investigation started');

    const executions = [];
    const batches = [worlds.slice(0, 1), worlds.slice(1, 2), worlds.slice(2)].filter((batch) => batch.length > 0);
    for (const batch of batches) executions.push(...await this.concurrency.run(batch, maximumConcurrency, (world) => this.executeWorld(context, world), () => this.repository.isCancelled(investigationId)));

    if (await this.repository.isCancelled(investigationId)) return;
    if (executions.length > 0 && executions.every(({ result }) => result === false)) throw new Error('All local workers failed to produce a processable result');
    await this.repository.finishInvestigation(investigationId);
    logger.info({ investigationId, provider: this.executor.provider, status: 'COMPLETED' }, 'Investigation completed');
  }

  private async executeWorld(context: InvestigationOrchestrationContext, world: CreatedWorldRecord): Promise<boolean> {
    let execution: PersistedWorldExecution | null = null;
    try {
      execution = await this.repository.beginWorld(context, world, this.executor.provider);
      if (!execution) return false;
      const job = await this.jobs.create({ investigationId: context.id, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, environmentBaseUrl: execution.environmentBaseUrl, invariantId: execution.invariantId, world: execution.world });
      const response = await this.executor.execute(job, {
        investigationId: context.id,
        worldId: execution.worldId,
        experimentId: execution.experimentId,
        workerId: execution.workerId,
        evidenceDirectory: job.evidence.outputDirectory,
        isCancelled: () => this.repository.isCancelled(context.id),
        emitEvent: (event: WorkerExecutionEvent) => this.repository.recordExecutionEvent(execution!, event),
      });
      const artifacts = await this.evidence.collect(response.result);
      await this.repository.completeExecution({
        execution,
        result: response.result,
        exitCode: response.exitCode,
        artifacts,
        providerMetadata: response.providerMetadata,
        ...(response.stdoutSummary ? { stdoutSummary: response.stdoutSummary } : {}),
        ...(response.stderrSummary ? { stderrSummary: response.stderrSummary } : {}),
      });
      this.logCompletion(execution, response.result);
      return response.result.status === 'PASSED' || response.result.status === 'INVARIANT_VIOLATION';
    } catch (error) {
      if (execution) await this.repository.failExecution(execution, error);
      logger.error({ err: error, investigationId: context.id, worldId: world.id, experimentId: world.experimentId, workerId: execution?.workerId, provider: this.executor.provider, status: 'FAILED' }, 'Worker failed');
      return false;
    }
  }

  private logCompletion(execution: PersistedWorldExecution, result: WorkerResult): void {
    logger.info({ investigationId: execution.investigationId, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, provider: execution.provider, status: result.status, durationMs: result.durationMs }, 'Worker completed');
  }
}
