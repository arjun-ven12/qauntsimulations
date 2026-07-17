import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { requireAuth, requireOrganisation } from '../../auth/auth.middleware.js';
import type { AuthTokenService } from '../../auth/auth-token.service.js';
import { RepairVerificationController } from '../repair-verification.controller.js';
import type { RepairVerificationReadRepository } from '../repair-verification.repository.js';
import { createFindingRepairVerificationRouter, createRepairVerificationRouter } from '../repair-verification.routes.js';
import { RepairVerificationDomainService } from '../repair-verification.service.js';
import type {
  PreparedRepairVerificationPersistence,
  RepairVerificationEligibilityContext,
  RepairVerificationRecord,
} from '../repair-verification.types.js';

describe('Repair Verification HTTP contract', () => {
  it('preflights and atomically queues a prepared Investigation without starting runtime execution', async () => {
    const fixture = repository('OWNER');
    const app = application(fixture.repository);
    const input = { environmentId: 'environment-repaired', deploymentVersion: 'release-2', notes: 'Fix deployed', acknowledgement: true };

    const preflight = await request(app)
      .post('/api/findings/finding/repair-verifications/preflight')
      .set('authorization', 'Bearer owner')
      .send(input);
    expect(preflight.status).toBe(200);
    expect(preflight.body.eligibility.status).toBe('ELIGIBLE');
    expect(preflight.body.eligibility.planPreview.worlds).toHaveLength(6);

    const created = await request(app)
      .post('/api/findings/finding/repair-verifications')
      .set('authorization', 'Bearer owner')
      .set('Idempotency-Key', 'create-repair-1')
      .send(input);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ executionStatus: 'QUEUED', verificationResult: null });
    expect(fixture.prepared).toHaveLength(1);
    const persisted = fixture.prepared[0]!;
    expect(persisted.experimentPlan.plan).toMatchObject({
      executionMode: 'REPAIR_VERIFICATION',
      worlds: expect.arrayContaining([
        expect.objectContaining({ repairVerification: expect.objectContaining({ purpose: 'REPAIR_MINIMAL_REPRODUCTION' }) }),
        expect.objectContaining({ repairVerification: expect.objectContaining({ purpose: 'REPAIR_PASSING_CONTROL' }) }),
      ]),
    });
    expect((persisted.experimentPlan.plan.worlds as unknown[])).toHaveLength(6);
    expect(fixture.runtimeStarts).not.toHaveBeenCalled();
  });

  it('replays the same idempotent request and rejects a mismatched reuse', async () => {
    const fixture = repository('OWNER');
    const app = application(fixture.repository);
    const input = { environmentId: 'environment-repaired', acknowledgement: true };
    const first = await request(app).post('/api/findings/finding/repair-verifications').set('authorization', 'Bearer owner').set('Idempotency-Key', 'replay-key').send(input);
    const replay = await request(app).post('/api/findings/finding/repair-verifications').set('authorization', 'Bearer owner').set('Idempotency-Key', 'replay-key').send(input);
    const mismatch = await request(app).post('/api/findings/finding/repair-verifications').set('authorization', 'Bearer owner').set('Idempotency-Key', 'replay-key').send({ ...input, notes: 'different' });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(fixture.prepared).toHaveLength(1);
  });

  it('enforces permissions, authentication, and tenant-neutral missing-resource responses', async () => {
    const owner = repository('OWNER');
    const viewer = repository('VIEWER');
    const app = application(owner.repository, viewer.repository);
    const input = { environmentId: 'environment-repaired', acknowledgement: true };
    expect((await request(app).post('/api/findings/finding/repair-verifications/preflight').send(input)).status).toBe(401);
    const forbidden = await request(app).post('/api/findings/finding/repair-verifications/preflight').set('authorization', 'Bearer viewer').send(input);
    expect(forbidden.status).toBe(403);
    const missing = await request(app).get('/api/repair-verifications/missing').set('authorization', 'Bearer owner');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('REPAIR_VERIFICATION_NOT_FOUND');
  });

  it('lists tenant-scoped records and only cancels queued verification records', async () => {
    const fixture = repository('OWNER');
    const app = application(fixture.repository);
    const created = await request(app).post('/api/findings/finding/repair-verifications').set('authorization', 'Bearer owner').set('Idempotency-Key', 'cancel-key').send({ environmentId: 'environment-repaired', acknowledgement: true });
    const id = created.body.repairVerificationId;
    const listed = await request(app).get('/api/findings/finding/repair-verifications').set('authorization', 'Bearer owner');
    const cancelled = await request(app).post(`/api/repair-verifications/${id}/cancel`).set('authorization', 'Bearer owner').send({ reason: 'No longer needed' });
    const repeated = await request(app).post(`/api/repair-verifications/${id}/cancel`).set('authorization', 'Bearer owner');
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ executionStatus: 'CANCELLED', verificationResult: 'INCONCLUSIVE' });
    expect(repeated.status).toBe(409);
  });
});

function application(ownerRepository: RepairVerificationReadRepository, viewerRepository = ownerRepository) {
  const controller = new RepairVerificationController(new RepairVerificationDomainService({
    ...ownerRepository,
    findMembershipRole: async (organisationId, userId) => userId === 'viewer'
      ? viewerRepository.findMembershipRole(organisationId, userId)
      : ownerRepository.findMembershipRole(organisationId, userId),
  }));
  const tokens: AuthTokenService = {
    issueAccessToken: () => '', issueRefreshToken: () => '', hashToken: () => '',
    verifyRefreshToken: () => { throw new Error('unused'); },
    verifyAccessToken: (value) => {
      if (!['owner', 'viewer'].includes(value)) throw new Error('invalid');
      return { userId: value, organisationId: 'organisation', role: value === 'owner' ? 'OWNER' : 'VIEWER', tokenVersion: 0, issuedAt: 1, expiry: 2 };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(requireAuth(tokens), requireOrganisation);
  app.use('/api/findings/:findingId/repair-verifications', createFindingRepairVerificationRouter(controller));
  app.use('/api/repair-verifications', createRepairVerificationRouter(controller));
  app.use(errorHandler);
  return app;
}

function repository(role: 'OWNER' | 'VIEWER') {
  const records = new Map<string, RepairVerificationRecord>();
  const prepared: PreparedRepairVerificationPersistence[] = [];
  const runtimeStarts = vi.fn();
  const repository: RepairVerificationReadRepository = {
    loadEligibilityContext: async () => eligibilityContext(),
    findMembershipRole: async () => role,
    findFindingProjectId: async () => 'project',
    findById: async (_organisationId, id) => records.get(id) ?? null,
    listForFinding: async () => [...records.values()],
    findByIdempotencyKey: async (_organisationId, key) => [...records.values()].find((record) => record.idempotencyKey === key) ?? null,
    createPrepared: async (input) => {
      prepared.push(input);
      const now = new Date('2026-07-17T00:00:00.000Z');
      const record: RepairVerificationRecord = {
        id: input.repairVerificationId,
        organisationId: input.repairVerification.organisationId,
        projectId: input.repairVerification.projectId,
        findingId: input.repairVerification.findingId,
        originalInvestigationId: input.repairVerification.originalInvestigationId,
        verificationInvestigationId: input.verificationInvestigationId,
        environmentId: input.repairVerification.environmentId,
        deploymentVersion: (input.repairVerification.planSnapshot.repairVerification as { deploymentVersion?: string | null }).deploymentVersion ?? null,
        createdByUserId: input.repairVerification.createdByUserId,
        cancelledByUserId: null, notes: input.repairVerification.notes ?? null,
        executionStatus: 'QUEUED', verificationResult: null, originalBusinessOutcome: 'FAIL',
        repairedBusinessOutcome: null, regressionControlOutcome: null,
        planSnapshot: input.repairVerification.planSnapshot, comparisonSnapshot: null,
        requestFingerprint: input.repairVerification.requestFingerprint,
        failureCode: null, failureMessage: null, inconclusiveReason: null, cancellationReason: null,
        startedAt: null, completedAt: null, cancelledAt: null, createdAt: now, updatedAt: now,
        idempotencyKey: input.repairVerification.idempotencyKey,
      };
      records.set(record.id, record);
      return record;
    },
    cancelQueued: async ({ verificationId, cancelledByUserId, cancellationReason }) => {
      const current = records.get(verificationId);
      if (!current || current.executionStatus !== 'QUEUED') return null;
      const cancelled: RepairVerificationRecord = {
        ...current, executionStatus: 'CANCELLED', verificationResult: 'INCONCLUSIVE',
        repairedBusinessOutcome: 'INCONCLUSIVE', regressionControlOutcome: 'INCONCLUSIVE',
        cancelledByUserId, cancellationReason: cancellationReason ?? null,
        cancelledAt: new Date('2026-07-17T00:01:00.000Z'), completedAt: new Date('2026-07-17T00:01:00.000Z'),
      };
      records.set(verificationId, cancelled);
      return cancelled;
    },
  };
  return { repository, prepared, runtimeStarts };
}

function eligibilityContext(): RepairVerificationEligibilityContext {
  return {
    organisationId: 'organisation', actor: { userId: 'owner', role: 'OWNER' },
    finding: {
      id: 'finding', organisationId: 'organisation', projectId: 'project', investigationId: 'original',
      originalInvestigationOrganisationId: 'organisation', originalInvestigationProjectId: 'project', originalJourneyId: 'journey',
      confidence: 'CONFIRMED', causalStatus: 'SUPPORTED', originalInvestigationStatus: 'COMPLETED',
    },
    targetEnvironment: {
      id: 'environment-repaired', projectId: 'project', organisationId: 'organisation', name: 'Demo', type: 'DEMO', baseUrl: 'http://localhost:5174', validationStatus: 'READY', deletedAt: null,
      configuration: { payment: { mode: 'MOCK' }, reset: { endpoint: '/api/test/reset', method: 'POST' }, allowedActions: ['PERFORM_CHECKOUT', 'SUBMIT_MOCK_PAYMENT', 'CREATE_TEST_ORDER'] },
    },
    safetyPolicy: { id: 'safety', domainAllowlist: ['localhost'], blockedActions: [], configuration: { allowedHttpMethods: ['GET', 'POST'], permitCheckoutSubmission: true, permitMockPayment: true, permitOrderCreation: true } },
    launchSnapshot: {
      journey: { id: 'journey', name: 'Checkout', steps: [{ type: 'goto', path: '/' }], successCondition: { type: 'visible', selector: '#done' } },
      invariants: [{ id: 'payment', type: 'NO_DUPLICATE_PAYMENT', severity: 'CRITICAL', config: {} }],
      environment: { id: 'original-environment', name: 'Original', type: 'DEMO', baseUrl: 'http://localhost:5174' },
      safety: { domainAllowlist: ['localhost'], allowedHttpMethods: ['GET', 'POST'], permitCheckoutSubmission: true, permitMockPayment: true, permitTestOrderCreation: true },
    },
    minimalWorldConfiguration: { paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: true },
    boundedRange: { knownPassingDelayMs: 800, knownFailingDelayMs: 1100 },
    worlds: [
      { id: 'failing', configuration: { paymentDelayMs: 1200, doubleSubmit: true }, executionState: 'COMPLETED', businessOutcome: 'FAIL' },
      { id: 'control-one', configuration: { paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: false }, adaptivePurpose: 'BUG_FLAG_CONTROL', executionState: 'COMPLETED', businessOutcome: 'PASS' },
      { id: 'control-two', configuration: { paymentDelayMs: 1200, doubleSubmit: false, duplicateSubmissionBug: true }, adaptivePurpose: 'INTERACTION_CONTROL', executionState: 'COMPLETED', businessOutcome: 'PASS' },
    ],
    activeVerificationId: null,
  };
}
