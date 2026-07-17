import type { ActiveDaytonaExecution } from './daytona-fleet.types.js';

export class DaytonaActiveExecutionRegistry {
  private readonly active = new Map<string, ActiveDaytonaExecution>();

  register(execution: ActiveDaytonaExecution): void {
    this.active.set(execution.sandboxId, execution);
  }

  unregister(sandboxId: string): void {
    this.active.delete(sandboxId);
  }

  isActive(sandboxId: string): boolean {
    return this.active.has(sandboxId);
  }

  byInvestigation(investigationId: string): ActiveDaytonaExecution[] {
    return [...this.active.values()].filter((execution) => execution.investigationId === investigationId);
  }

  snapshot() {
    return [...this.active.values()].map((execution) => ({
      investigationId: execution.investigationId,
      worldId: execution.worldId,
      experimentId: execution.experimentId,
      workerId: execution.workerId,
      sandboxId: execution.sandboxId,
      startedAt: execution.startedAt.toISOString(),
    }));
  }

  async cancelInvestigation(investigationId: string): Promise<void> {
    await Promise.allSettled(this.byInvestigation(investigationId).map((execution) => execution.cancel()));
  }
}
