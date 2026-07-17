import type {
  RepairVerificationBusinessOutcome,
  RepairVerificationComparison,
  RepairVerificationExecutionStatus,
  RepairVerificationResult,
} from './repair-verification.schema.js';
import { repairVerificationComparisonSchema } from './repair-verification.schema.js';

export interface VerificationWorldResult {
  purpose: 'REPAIR_MINIMAL_REPRODUCTION' | 'REPAIR_PASSING_CONTROL' | 'REPAIR_BOUNDARY_REGRESSION';
  executionState: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  businessOutcome: RepairVerificationBusinessOutcome;
}

export interface DerivedRepairVerificationResult extends RepairVerificationComparison {
  executionStatus: RepairVerificationExecutionStatus;
}

export class RepairVerificationResultDerivationService {
  derive(input: {
    investigationStatus: string;
    worlds: VerificationWorldResult[];
  }): DerivedRepairVerificationResult {
    const minimal = input.worlds.filter(({ purpose }) => purpose === 'REPAIR_MINIMAL_REPRODUCTION');
    const controls = input.worlds.filter(({ purpose }) => purpose === 'REPAIR_PASSING_CONTROL');
    const cancelled = input.investigationStatus === 'CANCELLED'
      || input.worlds.some(({ executionState }) => executionState === 'CANCELLED');
    if (cancelled) return result('CANCELLED', 'INCONCLUSIVE', 'INCONCLUSIVE', 'INCONCLUSIVE', 'Verification was cancelled.');

    const technicalFailure = input.investigationStatus === 'FAILED'
      || input.worlds.some(({ executionState }) => executionState === 'FAILED');
    if (technicalFailure) return result('FAILED', 'INCONCLUSIVE', 'INCONCLUSIVE', 'INCONCLUSIVE', 'Required verification execution failed.');

    if (minimal.length !== 1 || !controls.length
      || input.worlds.some(({ businessOutcome }) => businessOutcome === 'INCONCLUSIVE')) {
      return result('COMPLETED', 'INCONCLUSIVE', 'INCONCLUSIVE', 'INCONCLUSIVE', 'Verification evidence was incomplete or ambiguous.');
    }

    const minimalOutcome = minimal[0]!.businessOutcome;
    const controlOutcome = aggregateControls(controls);
    if (minimalOutcome === 'FAIL') {
      return result('COMPLETED', 'DEFECT_STILL_PRESENT', 'FAIL', controlOutcome, 'The minimal reproduction still violates a selected Invariant.');
    }
    if (minimalOutcome === 'PASS' && controlOutcome === 'FAIL') {
      return result('COMPLETED', 'REGRESSION_DETECTED', 'PASS', 'FAIL', 'A previously passing required control now violates a selected Invariant.');
    }
    if (minimalOutcome === 'PASS' && controlOutcome === 'PASS') {
      return result('COMPLETED', 'FIX_CONFIRMED', 'PASS', 'PASS', 'The minimal reproduction passes and required passing controls remain passing.');
    }
    return result('COMPLETED', 'INCONCLUSIVE', 'INCONCLUSIVE', 'INCONCLUSIVE', 'Verification evidence was insufficient.');
  }
}

function aggregateControls(controls: VerificationWorldResult[]): RepairVerificationBusinessOutcome {
  if (!controls.length || controls.some(({ businessOutcome }) => businessOutcome === 'INCONCLUSIVE')) return 'INCONCLUSIVE';
  return controls.some(({ businessOutcome }) => businessOutcome === 'FAIL') ? 'FAIL' : 'PASS';
}

function result(
  executionStatus: RepairVerificationExecutionStatus,
  verificationResult: RepairVerificationResult,
  repairedBusinessOutcome: RepairVerificationBusinessOutcome,
  regressionControlOutcome: RepairVerificationBusinessOutcome,
  reason: string,
): DerivedRepairVerificationResult {
  const comparison = repairVerificationComparisonSchema.parse({
    originalBusinessOutcome: 'FAIL',
    repairedBusinessOutcome,
    regressionControlOutcome,
    verificationResult,
    reason,
  });
  if (executionStatus === 'FAILED' && repairedBusinessOutcome === 'PASS') {
    throw new Error('Repair Verification cannot derive FAILED execution with PASS business outcome');
  }
  return { executionStatus, ...comparison };
}
