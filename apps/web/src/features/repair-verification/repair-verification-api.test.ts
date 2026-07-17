import { describe, expect, it, vi } from 'vitest';
import { repairVerificationInputSchema } from './repair-verification-api.js';

describe('Repair Verification Product contract', () => {
  it('requires an acknowledged target Environment before preflight or queueing', () => {
    expect(() => repairVerificationInputSchema.parse({ environmentId: '', acknowledgement: true })).toThrow();
    expect(() => repairVerificationInputSchema.parse({ environmentId: 'environment-1', acknowledgement: false })).toThrow();
    expect(repairVerificationInputSchema.parse({ environmentId: 'environment-1', acknowledgement: true })).toMatchObject({ environmentId: 'environment-1', acknowledgement: true });
  });

  it('uses the canonical preflight and idempotent create paths', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ eligibility: { findingId: 'finding-1', status: 'ELIGIBLE', issues: [], warnings: [], planPreview: { version: 1, environmentId: 'environment-1', maximumWorldCount: 6, journey: { id: 'journey', name: 'Journey' }, invariants: [{ id: 'invariant', type: 'NO_DUPLICATE_PAYMENT', severity: 'CRITICAL' }], worlds: [{ key: 'world', purpose: 'REPAIR_MINIMAL_REPRODUCTION', reason: 'Replay', configuration: {} }] } }, requestFingerprint: 'fingerprint' }))
      .mockResolvedValueOnce(response({ repairVerificationId: 'verification-1', verificationInvestigationId: 'investigation-1', executionStatus: 'QUEUED', verificationResult: null }));
    vi.stubGlobal('fetch', fetchMock);
    const { repairVerificationApi } = await import('./repair-verification-api.js');
    await repairVerificationApi.preflight('finding-1', { environmentId: 'environment-1', acknowledgement: true });
    await repairVerificationApi.create('finding-1', { environmentId: 'environment-1', acknowledgement: true }, 'idempotency-1');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/findings/finding-1/repair-verifications/preflight');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/findings/finding-1/repair-verifications');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({ 'Idempotency-Key': 'idempotency-1' });
    vi.unstubAllGlobals();
  });
});

function response(body: unknown) { return { ok: true, status: 200, json: async () => body } as Response; }
