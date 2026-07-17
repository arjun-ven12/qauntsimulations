import { logger } from '../../core/logging/logger.js';
import type { SandboxHandle, SandboxProvider } from '../../integrations/daytona/daytona.types.js';
import type { DaytonaActiveExecutionRegistry } from './daytona-active-execution-registry.js';

export interface DaytonaOrphanCleanupOptions {
  olderThanMinutes: number;
  dryRun: boolean;
}

export interface DaytonaOrphanCleanupResult {
  dryRun: boolean;
  candidates: Array<{ sandboxId: string; name: string; createdAt?: string }>;
  deleted: string[];
  failed: Array<{ sandboxId: string; error: string }>;
  skippedActive: string[];
}

export class DaytonaOrphanCleanupService {
  constructor(
    private readonly provider: SandboxProvider,
    private readonly registry?: DaytonaActiveExecutionRegistry,
  ) {}

  async run(options: DaytonaOrphanCleanupOptions): Promise<DaytonaOrphanCleanupResult> {
    if (!this.provider.listSandboxes) throw new Error('Sandbox provider does not support listing sandboxes');
    const cutoff = Date.now() - options.olderThanMinutes * 60_000;
    const result: DaytonaOrphanCleanupResult = { dryRun: options.dryRun, candidates: [], deleted: [], failed: [], skippedActive: [] };
    for await (const sandbox of this.provider.listSandboxes({ project: 'taskos-worldlab', purpose: 'isolated-playwright-world' })) {
      if (this.registry?.isActive(sandbox.id)) {
        result.skippedActive.push(sandbox.id);
        continue;
      }
      if (!this.isStale(sandbox, cutoff)) continue;
      result.candidates.push({ sandboxId: sandbox.id, name: sandbox.name, ...(sandbox.createdAt ? { createdAt: sandbox.createdAt } : {}) });
      logger.warn({ sandboxId: sandbox.id, name: sandbox.name, dryRun: options.dryRun }, 'TaskOS Daytona orphan sandbox detected');
      if (options.dryRun) continue;
      try {
        await this.provider.deleteSandbox(sandbox);
        result.deleted.push(sandbox.id);
        logger.warn({ sandboxId: sandbox.id }, 'TaskOS Daytona orphan sandbox deleted');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown orphan cleanup error';
        result.failed.push({ sandboxId: sandbox.id, error: message });
        logger.error({ err: error, sandboxId: sandbox.id }, 'TaskOS Daytona orphan sandbox cleanup failed');
      }
    }
    return result;
  }

  private isStale(sandbox: SandboxHandle, cutoff: number): boolean {
    if (!sandbox.createdAt) return true;
    const createdAt = Date.parse(sandbox.createdAt);
    return Number.isFinite(createdAt) && createdAt <= cutoff;
  }
}
