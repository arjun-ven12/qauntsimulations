import { describe, expect, it } from 'vitest';
import {
  repairVerificationCreateResponseSchema,
  repairVerificationDetailSchema,
  repairVerificationTargetInputSchema,
} from '../repair-verification.schema.js';

describe('Repair Verification local DTO validation', () => {
  it('accepts only the persisted Environment target contract', () => {
    expect(repairVerificationTargetInputSchema.parse({
      environmentId: ' environment-repaired ',
      deploymentVersion: ' release-42 ',
      notes: ' verified mock deployment ',
      acknowledgement: true,
    })).toEqual({
      environmentId: 'environment-repaired',
      deploymentVersion: 'release-42',
      notes: 'verified mock deployment',
      acknowledgement: true,
    });
  });

  const invalidTargets: Array<[input: unknown, reason: string]> = [
    [{ environmentId: '', acknowledgement: true }, 'missing Environment'],
    [{ environmentId: 'environment' }, 'missing acknowledgement'],
    [{ environmentId: 'environment', acknowledgement: false }, 'false acknowledgement'],
    [{ environmentId: 'environment', deploymentUrl: 'https://unsafe.example', acknowledgement: true }, 'arbitrary URL'],
    [{ environmentId: 'environment', deploymentVersion: 'x'.repeat(201), acknowledgement: true }, 'long version'],
    [{ environmentId: 'environment', notes: 'x'.repeat(2_001), acknowledgement: true }, 'long notes'],
  ];
  it.each(invalidTargets)('rejects %s (%s)', (input) => {
    expect(repairVerificationTargetInputSchema.safeParse(input).success).toBe(false);
  });

  it('validates local create and detail response shapes without shared contracts', () => {
    const create = repairVerificationCreateResponseSchema.parse({
      repairVerificationId: 'verification',
      verificationInvestigationId: 'investigation-verification',
      executionStatus: 'QUEUED',
      verificationResult: null,
    });
    expect(create.executionStatus).toBe('QUEUED');
    expect(repairVerificationDetailSchema.safeParse({
      ...create,
      findingId: 'finding', environmentId: 'environment', deploymentVersion: null,
      createdAt: '2026-07-17T00:00:00.000Z', startedAt: null, completedAt: null,
      organisationId: 'organisation', projectId: 'project', originalInvestigationId: 'original',
      notes: null, planSnapshot: {}, comparison: null, failure: null, cancellation: null,
    }).success).toBe(true);
  });
});
