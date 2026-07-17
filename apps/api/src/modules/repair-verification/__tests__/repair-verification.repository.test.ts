import { describe, expect, it, vi } from 'vitest';
import { PrismaRepairVerificationReadRepository } from '../repair-verification.repository.js';

describe('Repair Verification read repository', () => {
  it('tenant-scopes Finding, Environment, active verification, detail, and list reads', async () => {
    const database = {
      organisationMember: { findFirst: vi.fn().mockResolvedValue(null) },
      finding: { findFirst: vi.fn().mockResolvedValue(null) },
      environment: { findFirst: vi.fn().mockResolvedValue(null) },
      repairVerification: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new PrismaRepairVerificationReadRepository(database as never);
    await repository.loadEligibilityContext({ organisationId: 'organisation', userId: 'user', findingId: 'finding', environmentId: 'environment' });
    expect(database.finding.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'finding', organisationId: 'organisation', deletedAt: null },
    }));
    expect(database.environment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'environment', project: { organisationId: 'organisation' } },
    }));
    expect(database.repairVerification.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organisationId: 'organisation', findingId: 'finding' }),
    }));
    await repository.findById('organisation', 'verification');
    expect(database.repairVerification.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'verification', organisationId: 'organisation' },
    });
    await repository.listForFinding('organisation', 'finding');
    expect(database.repairVerification.findMany).toHaveBeenCalledWith({
      where: { organisationId: 'organisation', findingId: 'finding' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
