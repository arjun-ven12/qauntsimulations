import { describe, expect, it, vi } from 'vitest';
import { RepairVerificationExecutionService } from '../repair-verification-execution.service.js';
import type { RepairVerificationReadRepository } from '../repair-verification.repository.js';
import type { RepairVerificationRecord } from '../repair-verification.types.js';

const record = (): RepairVerificationRecord => ({
  id: 'verification', organisationId: 'organisation', projectId: 'project', findingId: 'finding',
  originalInvestigationId: 'original', verificationInvestigationId: 'verification-investigation', environmentId: 'environment', deploymentVersion: null,
  createdByUserId: 'user', cancelledByUserId: null, notes: null, executionStatus: 'RUNNING', verificationResult: null,
  originalBusinessOutcome: 'FAIL', repairedBusinessOutcome: null, regressionControlOutcome: null,
  planSnapshot: {}, comparisonSnapshot: null, idempotencyKey: 'key', requestFingerprint: 'fingerprint',
  failureCode: null, failureMessage: null, inconclusiveReason: null, cancellationReason: null,
  startedAt: new Date(), completedAt: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(),
});

describe('Repair Verification execution bridge', () => {
  it('marks a prepared verification RUNNING before starting its existing Investigation runtime', async () => {
    const starter = { start: vi.fn() };
    const repository = fakeRepository({ beginExecution: vi.fn().mockResolvedValue(record()) });
    const service = new RepairVerificationExecutionService(repository, starter);
    await service.start('verification', 'verification-investigation');
    expect(repository.beginExecution).toHaveBeenCalledWith('verification');
    expect(starter.start).toHaveBeenCalledWith('verification-investigation');
  });

  it('does not start an already cancelled or terminal verification', async () => {
    const starter = { start: vi.fn() };
    const service = new RepairVerificationExecutionService(fakeRepository({ beginExecution: vi.fn().mockResolvedValue(null) }), starter);
    await service.start('verification', 'verification-investigation');
    expect(starter.start).not.toHaveBeenCalled();
  });

  it('derives and persists FIX_CONFIRMED from only the prepared verification Worlds', async () => {
    const persisted = vi.fn().mockResolvedValue(record());
    const service = new RepairVerificationExecutionService(fakeRepository({
      terminalExecutionEvidence: vi.fn().mockResolvedValue({
        verification: record(), investigationStatus: 'COMPLETED', worlds: [
          { id: 'minimal', configuration: {}, repairVerificationPurpose: 'REPAIR_MINIMAL_REPRODUCTION', executionState: 'COMPLETED', businessOutcome: 'PASS' },
          { id: 'control', configuration: {}, repairVerificationPurpose: 'REPAIR_PASSING_CONTROL', executionState: 'COMPLETED', businessOutcome: 'PASS' },
          { id: 'boundary', configuration: {}, repairVerificationPurpose: 'REPAIR_BOUNDARY_REGRESSION', executionState: 'COMPLETED', businessOutcome: 'PASS' },
        ],
      }),
      persistTerminalResult: persisted,
    }), { start: vi.fn() });
    await service.synchronize('verification-investigation');
    expect(persisted).toHaveBeenCalledWith(expect.objectContaining({
      verificationId: 'verification', executionStatus: 'COMPLETED', verificationResult: 'FIX_CONFIRMED',
      repairedBusinessOutcome: 'PASS', regressionControlOutcome: 'PASS',
    }));
  });
});

function fakeRepository(overrides: Partial<RepairVerificationReadRepository>): RepairVerificationReadRepository {
  return {
    loadEligibilityContext: vi.fn(), findById: vi.fn(), listForFinding: vi.fn(), findByIdempotencyKey: vi.fn(),
    findMembershipRole: vi.fn(), findFindingProjectId: vi.fn(), createPrepared: vi.fn(), cancelQueued: vi.fn(),
    beginExecution: vi.fn().mockResolvedValue(null), terminalExecutionEvidence: vi.fn().mockResolvedValue(null),
    persistTerminalResult: vi.fn().mockResolvedValue(null), ...overrides,
  } as RepairVerificationReadRepository;
}
