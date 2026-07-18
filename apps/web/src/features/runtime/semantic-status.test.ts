import { describe, expect, it } from 'vitest';
import {
  businessOutcomeTone,
  conditionRoleTone,
  confidenceTone,
  executionStatusTone,
  findingSeverityTone,
  plannerStatusTone,
  repairVerificationTone,
  businessResultStatus,
  findingStateStatus,
  investigationPhaseStatus,
  invariantReadinessStatus,
  projectReadinessStatus,
  setupStatus,
  validationStatus,
  worldExecutionStatus,
} from './semantic-status.js';

describe('Investigation semantic status system', () => {
  it('distinguishes execution lifecycle without colouring unknown states', () => {
    expect(executionStatusTone('COMPLETED')).toBe('pass');
    expect(executionStatusTone('RUNNING')).toBe('running');
    expect(executionStatusTone('QUEUED')).toBe('pending');
    expect(executionStatusTone('FAILED')).toBe('fail');
    expect(executionStatusTone('CANCELLED')).toBe('neutral');
  });

  it('maps business outcomes, severity, and confidence independently', () => {
    expect(businessOutcomeTone('PASS')).toBe('pass');
    expect(businessOutcomeTone('FAIL')).toBe('fail');
    expect(businessOutcomeTone('INCONCLUSIVE')).toBe('pending');
    expect(findingSeverityTone('CRITICAL')).toBe('fail');
    expect(findingSeverityTone('MEDIUM')).toBe('pending');
    expect(confidenceTone('CONFIRMED')).toBe('pass');
    expect(confidenceTone('POSSIBLE')).toBe('pending');
  });

  it('reserves warning colour for planner fallback and uncertain conditions', () => {
    expect(plannerStatusTone('FALLBACK_USED', true)).toBe('pending');
    expect(plannerStatusTone('ACCEPTED')).toBe('pass');
    expect(conditionRoleTone('retained')).toBe('fail');
    expect(conditionRoleTone('removed')).toBe('pass');
    expect(conditionRoleTone('inconclusive')).toBe('pending');
  });

  it('uses the verification result before its execution status', () => {
    expect(repairVerificationTone('COMPLETED', 'REPAIR_VERIFIED')).toBe('pass');
    expect(repairVerificationTone('COMPLETED', 'REGRESSION_DETECTED')).toBe('fail');
    expect(repairVerificationTone('RUNNING', null)).toBe('running');
  });

  it('keeps world execution and business results independent', () => {
    expect(worldExecutionStatus('COMPLETED')).toMatchObject({ tone: 'pass', label: 'Completed' });
    expect(businessResultStatus('FAIL')).toMatchObject({ tone: 'fail', label: 'Fail' });
    expect(businessResultStatus(undefined)).toMatchObject({ tone: 'neutral', label: 'No business result' });
  });

  it('maps readiness, validation, setup, finding, and phase states', () => {
    expect(invariantReadinessStatus('READY').tone).toBe('pass');
    expect(validationStatus('WARNING').tone).toBe('pending');
    expect(validationStatus('SKIPPED').tone).toBe('neutral');
    expect(projectReadinessStatus(false).tone).toBe('pending');
    expect(setupStatus('optional').tone).toBe('neutral');
    expect(setupStatus('invalid').tone).toBe('fail');
    expect(findingStateStatus('REPRODUCED').tone).toBe('fail');
    expect(investigationPhaseStatus('completed').tone).toBe('pass');
    expect(investigationPhaseStatus('active').tone).toBe('running');
    expect(investigationPhaseStatus('future').tone).toBe('neutral');
  });

  it('uses a readable neutral fallback for unknown values', () => {
    expect(validationStatus('DEPLOYMENT_MANAGED')).toEqual({
      tone: 'neutral',
      label: 'Deployment Managed',
      accessibleText: 'Deployment Managed status',
    });
  });
});
