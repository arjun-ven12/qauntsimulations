import { describe, expect, it } from 'vitest';
import { canonicalJson, repairVerificationRequestFingerprint } from '../request-fingerprint.js';

describe('Repair Verification request fingerprinting', () => {
  const base = {
    organisationId: 'organisation', findingId: 'finding',
    target: { environmentId: 'environment', acknowledgement: true as const, notes: 'note' },
  };

  it('is deterministic and independent of object key insertion order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } }))
      .toBe(canonicalJson({ a: { x: 3, y: 2 }, z: 1 }));
    expect(repairVerificationRequestFingerprint(base)).toBe(repairVerificationRequestFingerprint({ ...base }));
    expect(repairVerificationRequestFingerprint(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes for tenant, Finding, Environment, version, or notes changes', () => {
    const fingerprint = repairVerificationRequestFingerprint(base);
    expect(repairVerificationRequestFingerprint({ ...base, organisationId: 'other' })).not.toBe(fingerprint);
    expect(repairVerificationRequestFingerprint({ ...base, findingId: 'other' })).not.toBe(fingerprint);
    expect(repairVerificationRequestFingerprint({ ...base, target: { ...base.target, environmentId: 'other' } })).not.toBe(fingerprint);
    expect(repairVerificationRequestFingerprint({ ...base, target: { ...base.target, deploymentVersion: 'v2' } })).not.toBe(fingerprint);
    expect(repairVerificationRequestFingerprint({ ...base, target: { ...base.target, notes: 'other' } })).not.toBe(fingerprint);
  });
});
