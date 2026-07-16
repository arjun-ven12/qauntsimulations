import { logger } from '../../core/logging/logger.js';
import type { InvestigationRepository } from '../investigations/investigations.repository.js';

type CleanupRepository = Pick<InvestigationRepository, 'markStaleLocalExecutions'>;

export class ExecutionCleanupService {
  constructor(private readonly repository: CleanupRepository, private readonly staleAfterMs = 10 * 60_000) {}
  async run(): Promise<number> {
    const count = await this.repository.markStaleLocalExecutions(new Date(Date.now() - this.staleAfterMs));
    if (count) logger.warn({ count, provider: 'LOCAL', status: 'FAILED' }, 'Marked stale local executions failed');
    return count;
  }
}
