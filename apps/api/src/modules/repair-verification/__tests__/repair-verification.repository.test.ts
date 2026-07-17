import { describe, expect, it, vi } from 'vitest';
import { PrismaRepairVerificationReadRepository } from '../repair-verification.repository.js';
import type { PreparedRepairVerificationPersistence } from '../repair-verification.types.js';

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

  it('persists Scenario, queued Investigation, plan, and Repair Verification in one transaction', async () => {
    const createdAt = new Date('2026-07-17T00:00:00.000Z');
    const transactionClient = {
      scenario: { create: vi.fn() },
      investigation: { create: vi.fn() },
      experimentPlan: { create: vi.fn() },
      repairVerification: {
        create: vi.fn().mockResolvedValue({
          id: 'repair', organisationId: 'organisation', projectId: 'project', findingId: 'finding',
          originalInvestigationId: 'original', verificationInvestigationId: 'verification-investigation', environmentId: 'environment',
          createdByUserId: 'user', cancelledByUserId: null, notes: null,
          executionStatus: 'QUEUED', verificationResult: null, originalBusinessOutcome: 'FAIL',
          repairedBusinessOutcome: null, regressionControlOutcome: null, planSnapshot: { repairVerification: { deploymentVersion: 'v2' } }, comparisonSnapshot: null,
          idempotencyKey: 'idempotency', requestFingerprint: 'fingerprint', failureCode: null, failureMessage: null,
          inconclusiveReason: null, cancellationReason: null, startedAt: null, completedAt: null, cancelledAt: null, createdAt, updatedAt: createdAt,
        }),
      },
    };
    const database = { $transaction: vi.fn(async (callback: (client: typeof transactionClient) => unknown) => callback(transactionClient)) };
    const repository = new PrismaRepairVerificationReadRepository(database as never);

    const record = await repository.createPrepared(preparedPersistence());

    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.scenario.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.investigation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'QUEUED' }) }));
    expect(transactionClient.experimentPlan.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.repairVerification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ executionStatus: 'QUEUED', originalBusinessOutcome: 'FAIL' }),
    }));
    expect(record).toMatchObject({ id: 'repair', executionStatus: 'QUEUED', deploymentVersion: 'v2' });
  });
});

function preparedPersistence(): PreparedRepairVerificationPersistence {
  return {
    repairVerificationId: 'repair', verificationInvestigationId: 'verification-investigation',
    scenario: { id: 'scenario', name: 'Repair scenario', prompt: 'Verify', controls: {} },
    investigation: { name: 'Repair verification', journeyId: 'journey', safetyPolicyId: 'safety' },
    experimentPlan: { plan: { worlds: [] }, planningExplanation: 'Prepared', estimatedComputeUnits: 2 },
    repairVerification: {
      organisationId: 'organisation', projectId: 'project', findingId: 'finding', originalInvestigationId: 'original', environmentId: 'environment',
      createdByUserId: 'user', planSnapshot: { repairVerification: { deploymentVersion: 'v2' } }, idempotencyKey: 'idempotency', requestFingerprint: 'fingerprint',
    },
  };
}
