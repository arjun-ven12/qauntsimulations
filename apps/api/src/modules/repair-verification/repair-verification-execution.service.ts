import type { RepairVerificationBusinessOutcome, RepairVerificationExecutionStatus, RepairVerificationResult } from '@taskos/database';
import { logger } from '../../core/logging/logger.js';
import { RepairVerificationResultDerivationService } from './result-derivation.service.js';
import type { RepairVerificationReadRepository } from './repair-verification.repository.js';

export interface PreparedInvestigationStarter {
  start(investigationId: string): void;
}

/** Bridges the persisted prepared plan to the existing Investigation runtime. */
export class RepairVerificationExecutionService {
  constructor(
    private readonly repository: RepairVerificationReadRepository,
    private readonly starter: PreparedInvestigationStarter,
    private readonly results = new RepairVerificationResultDerivationService(),
  ) {}

  schedule(verificationId: string, investigationId: string): void {
    setImmediate(() => void this.start(verificationId, investigationId));
  }

  async start(verificationId: string, investigationId: string): Promise<void> {
    const verification = await this.repository.beginExecution(verificationId);
    if (!verification) return;
    this.starter.start(investigationId);
  }

  async synchronize(investigationId: string): Promise<void> {
    const evidence = await this.repository.terminalExecutionEvidence(investigationId);
    if (!evidence) return;
    const derived = this.results.derive({
      investigationStatus: evidence.investigationStatus,
      worlds: evidence.worlds.map((world) => ({
        purpose: world.repairVerificationPurpose ?? 'REPAIR_BOUNDARY_REGRESSION',
        executionState: world.executionState === 'INCOMPLETE' ? 'FAILED' : world.executionState,
        businessOutcome: world.businessOutcome,
      })),
    });
    const comparisonSnapshot = {
      originalBusinessOutcome: derived.originalBusinessOutcome,
      repairedBusinessOutcome: derived.repairedBusinessOutcome,
      regressionControlOutcome: derived.regressionControlOutcome,
      verificationResult: derived.verificationResult,
      reason: derived.reason,
    };
    await this.repository.persistTerminalResult({
      verificationId: evidence.verification.id,
      executionStatus: derived.executionStatus as RepairVerificationExecutionStatus,
      verificationResult: derived.verificationResult as RepairVerificationResult,
      repairedBusinessOutcome: derived.repairedBusinessOutcome as RepairVerificationBusinessOutcome,
      regressionControlOutcome: derived.regressionControlOutcome as RepairVerificationBusinessOutcome,
      comparisonSnapshot,
      ...(derived.verificationResult === 'INCONCLUSIVE' ? { inconclusiveReason: derived.reason ?? 'Verification evidence was inconclusive.' } : {}),
      ...(derived.executionStatus === 'FAILED' ? { failureCode: 'VERIFICATION_EXECUTION_FAILED', failureMessage: derived.reason ?? 'Verification execution failed.' } : {}),
    });
  }

  async synchronizeSafely(investigationId: string): Promise<void> {
    try {
      await this.synchronize(investigationId);
    } catch (error) {
      logger.error({ err: error, investigationId }, 'Repair Verification completion synchronization failed');
    }
  }
}
