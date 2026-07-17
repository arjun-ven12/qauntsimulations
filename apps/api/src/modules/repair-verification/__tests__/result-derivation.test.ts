import { describe, expect, it } from 'vitest';
import { RepairVerificationResultDerivationService, type VerificationWorldResult } from '../result-derivation.service.js';

const minimal = (businessOutcome: 'PASS' | 'FAIL' | 'INCONCLUSIVE'): VerificationWorldResult => ({
  purpose: 'REPAIR_MINIMAL_REPRODUCTION', executionState: 'COMPLETED', businessOutcome,
});
const control = (businessOutcome: 'PASS' | 'FAIL' | 'INCONCLUSIVE'): VerificationWorldResult => ({
  purpose: 'REPAIR_PASSING_CONTROL', executionState: 'COMPLETED', businessOutcome,
});
const boundary = (businessOutcome: 'PASS' | 'FAIL' | 'INCONCLUSIVE'): VerificationWorldResult => ({
  purpose: 'REPAIR_BOUNDARY_REGRESSION', executionState: 'COMPLETED', businessOutcome,
});

describe('Repair Verification result derivation', () => {
  const derive = (worlds: VerificationWorldResult[], investigationStatus = 'COMPLETED') =>
    new RepairVerificationResultDerivationService().derive({ investigationStatus, worlds });

  it('derives DEFECT_STILL_PRESENT for a conclusive minimal failure', () => {
    expect(derive([minimal('FAIL'), control('PASS')])).toMatchObject({
      executionStatus: 'COMPLETED', verificationResult: 'DEFECT_STILL_PRESENT',
      originalBusinessOutcome: 'FAIL', repairedBusinessOutcome: 'FAIL', regressionControlOutcome: 'PASS',
    });
  });

  it('derives REGRESSION_DETECTED when the minimal World passes but a required control fails', () => {
    expect(derive([minimal('PASS'), control('FAIL')])).toMatchObject({
      executionStatus: 'COMPLETED', verificationResult: 'REGRESSION_DETECTED',
      repairedBusinessOutcome: 'PASS', regressionControlOutcome: 'FAIL',
    });
  });

  it('treats a failing bounded adjacent World as a regression', () => {
    expect(derive([minimal('PASS'), control('PASS'), boundary('FAIL')])).toMatchObject({
      verificationResult: 'REGRESSION_DETECTED', repairedBusinessOutcome: 'PASS', regressionControlOutcome: 'FAIL',
    });
  });

  it('derives FIX_CONFIRMED only when the minimal World and all required controls pass', () => {
    expect(derive([minimal('PASS'), control('PASS'), control('PASS')])).toMatchObject({
      executionStatus: 'COMPLETED', verificationResult: 'FIX_CONFIRMED',
      repairedBusinessOutcome: 'PASS', regressionControlOutcome: 'PASS',
    });
  });

  it.each([
    ['missing control', [minimal('PASS')]],
    ['missing minimal', [control('PASS')]],
    ['inconclusive minimal', [minimal('INCONCLUSIVE'), control('PASS')]],
    ['inconclusive control', [minimal('PASS'), control('INCONCLUSIVE')]],
  ])('derives INCONCLUSIVE for %s', (_name, worlds) => {
    expect(derive(worlds)).toMatchObject({
      executionStatus: 'COMPLETED', verificationResult: 'INCONCLUSIVE',
      repairedBusinessOutcome: 'INCONCLUSIVE', regressionControlOutcome: 'INCONCLUSIVE',
    });
  });

  it('keeps technical failure separate from business outcome', () => {
    const failed = { ...minimal('PASS'), executionState: 'FAILED' as const };
    expect(derive([failed, control('PASS')], 'FAILED')).toMatchObject({
      executionStatus: 'FAILED', verificationResult: 'INCONCLUSIVE', repairedBusinessOutcome: 'INCONCLUSIVE',
    });
  });

  it('keeps cancellation separate from business outcome', () => {
    expect(derive([minimal('PASS'), control('PASS')], 'CANCELLED')).toMatchObject({
      executionStatus: 'CANCELLED', verificationResult: 'INCONCLUSIVE', repairedBusinessOutcome: 'INCONCLUSIVE',
    });
  });
});
