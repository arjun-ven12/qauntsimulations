import { describe, expect, it, vi } from 'vitest';
import { ExecutionCleanupService } from '../execution-cleanup.service.js';

vi.mock('../../../core/logging/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ExecutionCleanupService', () => {
  it('marks stale local executions when the repository is available', async () => {
    const repository = { markStaleLocalExecutions: vi.fn().mockResolvedValue(2) };

    await expect(new ExecutionCleanupService(repository, 60_000).run()).resolves.toBe(2);
    expect(repository.markStaleLocalExecutions).toHaveBeenCalledWith(expect.any(Date));
  });

  it('does not abort API startup when cleanup cannot reach the database', async () => {
    const repository = {
      markStaleLocalExecutions: vi
        .fn()
        .mockRejectedValue(new Error('Cannot reach database server')),
    };

    await expect(new ExecutionCleanupService(repository, 60_000).run()).resolves.toBe(0);
  });
});
