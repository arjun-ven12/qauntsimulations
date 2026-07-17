import express from 'express';
import request from 'supertest';
import { demoCreateInvestigationInput, investigationProgressSchema } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import type { AuthTokenService } from '../../auth/auth-token.service.js';
import { requireAuth, requireOrganisation } from '../../auth/auth.middleware.js';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { InvestigationPlanningService } from '../../experiments/services/investigation-planning.service.js';
import { InvestigationController } from '../investigations.controller.js';
import { createInvestigationRouter } from '../investigations.routes.js';
import { InvestigationService } from '../investigations.service.js';

function application() {
  const progressRecord = { id: 'investigation_api_test', status: 'PLANNING', worlds: [], experiments: [], events: [], findingsCount: 0 };
  const createdAt = new Date('2026-07-17T00:00:00.000Z');
  const repository = {
    validateCreationScope: async (_organisationId: string, input: typeof demoCreateInvestigationInput) => input.projectId === 'project_demo_checkout' && input.environmentId === 'environment_demo_local' && input.journeyId === 'journey_checkout' && input.invariantIds.includes('invariant_single_checkout_submission') ? { organisationId: 'organisation_demo_taskos', scenarioId: 'scenario_duplicate_submission', environmentBaseUrl: 'http://localhost:5174', projectName: 'TaskOS Demo Commerce', environmentName: 'Demo', journeyName: 'Checkout', invariantIds: input.invariantIds, invariants: [{ id: 'invariant_single_checkout_submission', name: 'Single checkout submission' }] } : null,
    create: async () => progressRecord.id,
    persistPlan: async () => 'plan_api_test',
    progress: async (_organisationId: string, id: string) => id === progressRecord.id ? progressRecord : null,
    listWorlds: async () => [], listExperiments: async () => [], listWorkers: async () => [], listEvidence: async () => [], listFindings: async () => [],
    getFinding: async (_organisationId: string, _id: string, findingId: string) => findingId === 'finding_api_test' ? {
      id: 'finding_api_test',
      fingerprint: 'finding_api_test_fingerprint',
      organisationId: 'organisation_demo_taskos',
      projectId: 'project_demo_checkout',
      investigationId: progressRecord.id,
      title: 'Duplicate payment',
      summary: 'Repeated checkout created duplicate commerce operations.',
      severity: 'CRITICAL' as const,
      confidence: 'CONFIRMED' as const,
      reproductionCount: 2,
      causalConditions: { minimisation: { retainedConditions: { paymentDelayMs: 1200 }, removedConditions: { viewport: 'desktop' } } },
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      evidence: [{ findingId: 'finding_api_test', artifactId: 'evidence_final_report', artifact: { id: 'evidence_final_report', experimentId: 'experiment_api_test', executionAttemptId: null, storageProvider: 'local', type: 'FINAL_REPORT' as const, storageKey: 'reports/investigation_api_test/final-report.json', mimeType: 'application/json', sizeBytes: 1234n, checksum: 'sha256:test', redacted: true, createdAt, metadata: { path: '/Users/example/private/final-report.json', reportVersion: 1 } } }],
      reproductions: [{ id: 'reproduction_api_test', findingId: 'finding_api_test', experimentId: 'experiment_api_test', reproduced: true, createdAt }],
      minimalReproduction: { id: 'minimal_api_test', findingId: 'finding_api_test', journeySteps: [], worldConfiguration: {}, scriptArtifactId: null, createdAt, updatedAt: createdAt },
    } : null,
    cancel: async () => { progressRecord.status = 'CANCELLED'; return true; },
    orchestrationContext: async () => null,
    failInvestigation: async () => { progressRecord.status = 'FAILED'; },
  };
  const service = new InvestigationService(repository, new InvestigationPlanningService({ requestedProvider: 'deterministic', fallbackEnabled: true, maximumWorlds: 8, maximumVariables: 6, maximumAssumptions: 10, maximumWarnings: 20, timeoutMs: 30_000, maxProviderAttempts: 1, maxOutputTokens: 3_000 }), { start: () => undefined });
  const tokens: AuthTokenService = {
    issueAccessToken: () => '', issueRefreshToken: () => '', verifyRefreshToken: () => { throw new Error('unused'); }, hashToken: () => '',
    verifyAccessToken: (token) => { if (token !== 'valid') throw new Error('invalid'); return { userId: 'user_test', organisationId: 'organisation_demo_taskos', role: 'OWNER', tokenVersion: 0, issuedAt: 1, expiry: 2 }; },
  };
  const app = express(); app.use(express.json()); app.use(requireAuth(tokens), requireOrganisation); app.use('/api/investigations', createInvestigationRouter(new InvestigationController(service))); app.use(errorHandler); return app;
}

describe('investigation API', () => {
  it('creates a schema-valid progress response from the canonical input', async () => {
    const response = await request(application()).post('/api/investigations').set('authorization', 'Bearer valid').send(demoCreateInvestigationInput);
    expect(response.status).toBe(201);
    expect(investigationProgressSchema.parse(response.body).status).toBe('PLANNING');
  });
  it('rejects invalid scope and missing invariants', async () => {
    const invalidProject = await request(application()).post('/api/investigations').set('authorization', 'Bearer valid').send({ ...demoCreateInvestigationInput, projectId: 'missing' });
    expect(invalidProject.status).toBe(404);
    const invalidEnvironment = await request(application()).post('/api/investigations').set('authorization', 'Bearer valid').send({ ...demoCreateInvestigationInput, environmentId: 'missing' });
    expect(invalidEnvironment.status).toBe(404);
    const invalidJourney = await request(application()).post('/api/investigations').set('authorization', 'Bearer valid').send({ ...demoCreateInvestigationInput, journeyId: 'missing' });
    expect(invalidJourney.status).toBe(404);
    const missingInvariant = await request(application()).post('/api/investigations').set('authorization', 'Bearer valid').send({ ...demoCreateInvestigationInput, invariantIds: ['missing'] });
    expect(missingInvariant.status).toBe(404);
  });
  it('requires authentication', async () => {
    expect((await request(application()).post('/api/investigations').send(demoCreateInvestigationInput)).status).toBe(401);
  });
  it('returns canonical terminal progress when cancellation is accepted', async () => {
    const response = await request(application()).post('/api/investigations/investigation_api_test/cancel').set('authorization', 'Bearer valid');
    expect(response.status).toBe(200);
    expect(investigationProgressSchema.parse(response.body).status).toBe('FAILED');
  });
  it('returns finding detail with relative evidence paths and minimisation metadata', async () => {
    const response = await request(application()).get('/api/investigations/investigation_api_test/findings/finding_api_test').set('authorization', 'Bearer valid');
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('finding_api_test');
    expect(response.body.evidence[0]).toMatchObject({ type: 'FINAL_REPORT', path: 'reports/investigation_api_test/final-report.json', redacted: true });
    expect(response.body.evidence[0].path).not.toContain('/Users/');
    expect(response.body.evidence[0].metadata.path).toBeUndefined();
    expect(response.body.causalConditions.minimisation.retainedConditions.paymentDelayMs).toBe(1200);
    expect(response.body.minimalReproduction.id).toBe('minimal_api_test');
  });
  it('returns not found for missing finding detail', async () => {
    const response = await request(application()).get('/api/investigations/investigation_api_test/findings/missing').set('authorization', 'Bearer valid');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('FINDING_NOT_FOUND');
  });
});
