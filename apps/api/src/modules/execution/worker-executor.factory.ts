import type { WorkerExecutor } from './worker-executor.types.js';

export type WorkerExecutionProviderSetting = 'local' | 'daytona';

export class WorkerExecutorFactory {
  constructor(
    private readonly localExecutor: WorkerExecutor,
    private readonly daytonaExecutor: () => WorkerExecutor,
  ) {}

  create(provider: WorkerExecutionProviderSetting): WorkerExecutor {
    if (provider === 'local') return this.localExecutor;
    if (provider === 'daytona') return this.daytonaExecutor();
    throw new Error(`Unsupported worker execution provider: ${String(provider)}`);
  }
}
