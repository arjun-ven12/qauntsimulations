import type { WorkerResult } from '@taskos/execution-contracts';
import { logger } from '../../core/logging/logger.js';
import type { LocalEvidenceMetadataService } from '../evidence/local-evidence-metadata.service.js';
import type { InvestigationRepository } from '../investigations/investigations.repository.js';
import type { CreatedWorldRecord, InvestigationOrchestrationContext, PersistedWorldExecution } from '../investigations/investigations.types.js';
import { ExecutionConcurrencyService } from './execution-concurrency.service.js';
import type { WorkerExecutor } from './local-worker-executor.service.js';
import type { WorkerJobFactoryService } from './worker-job-factory.service.js';

type OrchestrationRepository = Pick<InvestigationRepository, 'orchestrationContext' | 'queueInitialWorlds' | 'transitionToRunning' | 'beginWorld' | 'completeExecution' | 'failExecution' | 'finishInvestigation' | 'failInvestigation' | 'isCancelled'>;

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
        logger.error({ err: error, investigationId, status: 'FAILED' }, 'Local investigation orchestration failed');
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
    logger.info({ investigationId, worldCount: worlds.length, maximumConcurrency: context.plan.maximumConcurrentWorkers, status: 'RUNNING' }, 'Local investigation started');

    const executions = [];
    const batches = [worlds.slice(0, 1), worlds.slice(1, 2), worlds.slice(2)].filter((batch) => batch.length > 0);
    for (const batch of batches) executions.push(...await this.concurrency.run(batch, context.plan.maximumConcurrentWorkers, (world) => this.executeWorld(context, world), () => this.repository.isCancelled(investigationId)));

    if (await this.repository.isCancelled(investigationId)) return;
    if (executions.length > 0 && executions.every(({ result }) => result === false)) throw new Error('All local workers failed to produce a processable result');
    await this.repository.finishInvestigation(investigationId);
    logger.info({ investigationId, status: 'COMPLETED' }, 'Local investigation completed');
  }

  private async executeWorld(context: InvestigationOrchestrationContext, world: CreatedWorldRecord): Promise<boolean> {
    let execution: PersistedWorldExecution | null = null;
    try {
      execution = await this.repository.beginWorld(context, world);
      if (!execution) return false;
      const job = await this.jobs.create({ investigationId: context.id, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, environmentBaseUrl: execution.environmentBaseUrl, invariantId: execution.invariantId, world: execution.world });
      const response = await this.executor.execute(job);
      const artifacts = await this.evidence.collect(response.result);
      await this.repository.completeExecution({ execution, result: response.result, exitCode: response.exitCode, artifacts });
      this.logCompletion(execution, response.result);
      return response.result.status === 'PASSED' || response.result.status === 'INVARIANT_VIOLATION';
    } catch (error) {
      if (execution) await this.repository.failExecution(execution, error);
      logger.error({ err: error, investigationId: context.id, worldId: world.id, experimentId: world.experimentId, workerId: execution?.workerId, status: 'FAILED' }, 'Local worker failed');
      return false;
    }
  }

  private logCompletion(execution: PersistedWorldExecution, result: WorkerResult): void {
    logger.info({ investigationId: execution.investigationId, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, status: result.status, durationMs: result.durationMs }, 'Local worker completed');
  }
}
