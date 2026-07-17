import express from 'express';
import request from 'supertest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { demoCreateInvestigationInput, investigationProgressSchema } from '@taskos/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthTokenService } from '../../auth/auth-token.service.js';
import { requireAuth, requireOrganisation } from '../../auth/auth.middleware.js';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { EvidenceContentService } from '../evidence-content.service.js';
import { InvestigationPlanningService } from '../../experiments/services/investigation-planning.service.js';
import { InvestigationController } from '../investigations.controller.js';
import { createInvestigationRouter, createProjectInvestigationRouter } from '../investigations.routes.js';
import { InvestigationService } from '../investigations.service.js';

function application(evidenceRoot?: string) {
  const progressRecord = { id: 'investigation_api_test', status: 'PLANNING', worlds: [], experiments: [], events: [], findingsCount: 0 };
  const createdAt = new Date('2026-07-17T00:00:00.000Z');
  const finalReportArtifact = { id: 'evidence_final_report', experimentId: 'experiment_api_test', executionAttemptId: null, storageProvider: 'local', type: 'FINAL_REPORT' as const, storageKey: 'reports/investigation_api_test/final-report.json', mimeType: 'application/json', sizeBytes: 13n, checksum: 'sha256:test', redacted: true, createdAt, metadata: { path: '/Users/example/private/final-report.json', reportVersion: 1, filename: 'final-report.json' } };
  const markdownReportArtifact = { ...finalReportArtifact, id: 'evidence_markdown_report', storageKey: 'reports/investigation_api_test/final-report.md', mimeType: 'text/markdown', sizeBytes: 14n, metadata: { filename: 'final-report.md' } };
  const screenshotArtifact = { ...finalReportArtifact, id: 'evidence_screenshot', type: 'SCREENSHOT' as const, storageKey: 'screenshots/001.png', mimeType: 'image/png' };
  const repository = {
    validateCreationScope: async (_organisationId: string, _userId: string, input: typeof demoCreateInvestigationInput) => input.projectId === 'project_demo_checkout' && input.environmentId === 'environment_demo_local' && input.journeyId === 'journey_checkout' && input.invariantIds.includes('invariant_single_checkout_submission') ? {
      organisationId: 'organisation_demo_taskos',
      scenarioId: 'scenario_duplicate_submission',
      environmentBaseUrl: 'http://localhost:5174',
      projectName: 'TaskOS Demo Commerce',
      environmentName: 'Demo',
      journeyName: 'Checkout',
      invariantIds: input.invariantIds,
      invariants: [{ id: 'invariant_single_checkout_submission', name: 'Single checkout submission' }],
      launch: {
        inputSource: 'PERSISTED_CONFIGURATION' as const,
        actorUserId: 'user_test',
        launchedAt: createdAt.toISOString(),
        scenario: { prompt: input.scenario.prompt, controls: input.scenario.controls },
        environment: { id: input.environmentId, name: 'Demo', type: 'DEMO', baseUrl: 'http://localhost:5174' },
        journey: { id: input.journeyId, name: 'Checkout', steps: [{ type: 'goto' as const, path: '/products/test-product' }], successCondition: { type: 'visible' as const, selector: '[data-testid="order-confirmation"]' } },
        invariants: [{ id: 'invariant_single_checkout_submission', type: 'NO_DUPLICATE_PAYMENT' as const, severity: 'CRITICAL' as const, config: { requestPatterns: ['/api/payments'], methods: ['POST'] } }],
        safety: { domainAllowlist: ['localhost'], allowedHttpMethods: ['GET', 'POST'], permitCheckoutSubmission: true, permitMockPayment: true, permitTestOrderCreation: true, prohibitedActions: [] },
        validation: { status: 'READY' as const, warnings: [] },
      },
    } : null,
    create: async () => progressRecord.id,
    persistPlan: async () => 'plan_api_test',
    progress: async (_organisationId: string, id: string) => id === progressRecord.id ? progressRecord : null,
    listWorlds: async () => [], listExperiments: async () => [], listWorkers: async () => [], listEvidence: async () => [finalReportArtifact], listFindings: async () => [],
    getEvidenceArtifact: async (_organisationId: string, investigationId: string, evidenceId: string) => investigationId === progressRecord.id
      ? [finalReportArtifact, markdownReportArtifact, screenshotArtifact].find((artifact) => artifact.id === evidenceId) ?? null
      : null,
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
      evidence: [{ findingId: 'finding_api_test', artifactId: 'evidence_final_report', artifact: finalReportArtifact }],
      reproductions: [{ id: 'reproduction_api_test', findingId: 'finding_api_test', experimentId: 'experiment_api_test', reproduced: true, createdAt }],
      minimisationRuns: [{
        id: 'minimisation_api_test',
        status: 'COMPLETED',
        completedTrials: 3,
        currentRetainedConditions: { paymentDelayMs: 1200 },
        removedConditions: { viewport: 'desktop' },
        inconclusiveConditions: {},
        knownPassingDelayMs: 900,
        knownFailingDelayMs: 1200,
        finalReportEvidenceId: 'evidence_final_report',
      }],
      minimalReproduction: { id: 'minimal_api_test', findingId: 'finding_api_test', journeySteps: [], worldConfiguration: {}, scriptArtifactId: null, createdAt, updatedAt: createdAt },
    } : null,
    cancel: async () => { progressRecord.status = 'CANCELLED'; return true; },
    orchestrationContext: async (id: string) => id === progressRecord.id ? {
      id,
      organisationId: 'organisation_demo_taskos',
      projectId: 'project_demo_checkout',
      environmentId: 'environment_demo_local',
      journeyId: 'journey_checkout',
      scenarioId: 'scenario_duplicate_submission',
      environmentBaseUrl: 'http://localhost:5174',
      planId: 'plan_api_test',
      plan: {
        objective: 'Kimi-generated checkout plan',
        journeyId: 'journey_checkout',
        scenarioId: 'scenario_duplicate_submission',
        selectedVariables: ['browser'],
        selectedControls: demoCreateInvestigationInput.scenario.controls,
        invariantIds: demoCreateInvestigationInput.invariantIds,
        executionProvider: 'LOCAL_PLAYWRIGHT' as const,
        maximumConcurrentWorkers: 2,
        worlds: [],
        planningExplanation: 'Validated initial plan.',
        planner: {
          version: 'v1', requestedProvider: 'KIMI' as const, effectiveProvider: 'KIMI' as const, plannerStatus: 'ACCEPTED', model: 'kimi-k2.6',
          assumptions: [], warnings: [], rejectedPlanItems: [], normalizedFields: [], acceptedWorldCount: 0, rejectedWorldCount: 0, generatedAt: createdAt.toISOString(),
        },
      },
    } : null,
    failInvestigation: async () => { progressRecord.status = 'FAILED'; },
  };
  const service = new InvestigationService(
    repository,
    new InvestigationPlanningService({ requestedProvider: 'deterministic', fallbackEnabled: true, maximumWorlds: 8, maximumVariables: 6, maximumAssumptions: 10, maximumWarnings: 20, timeoutMs: 30_000, maxProviderAttempts: 1, maxOutputTokens: 3_000 }),
    { start: () => undefined },
    evidenceRoot ? new EvidenceContentService(evidenceRoot, 1024) : undefined,
  );
  const tokens: AuthTokenService = {
    issueAccessToken: () => '', issueRefreshToken: () => '', verifyRefreshToken: () => { throw new Error('unused'); }, hashToken: () => '',
    verifyAccessToken: (token) => { if (token !== 'valid') throw new Error('invalid'); return { userId: 'user_test', organisationId: 'organisation_demo_taskos', role: 'OWNER', tokenVersion: 0, issuedAt: 1, expiry: 2 }; },
  };
  const controller = new InvestigationController(service);
  const app = express(); app.use(express.json()); app.use(requireAuth(tokens), requireOrganisation); app.use('/api/projects/:projectId/investigations', createProjectInvestigationRouter(controller)); app.use('/api/investigations', createInvestigationRouter(controller)); app.use(errorHandler); return app;
}

describe('investigation API', () => {
  let evidenceRoot: string;

  beforeEach(async () => {
    evidenceRoot = await mkdtemp(join(tmpdir(), 'taskos-api-evidence-'));
    await mkdir(join(evidenceRoot, 'reports/investigation_api_test'), { recursive: true });
    await writeFile(join(evidenceRoot, 'reports/investigation_api_test/final-report.json'), '{"version":1}');
    await writeFile(join(evidenceRoot, 'reports/investigation_api_test/final-report.md'), '# Final report');
  });

  afterEach(async () => {
    await rm(evidenceRoot, { recursive: true, force: true });
  });

  it('creates a schema-valid progress response from the canonical input', async () => {
    const response = await request(application()).post('/api/investigations').set('authorization', 'Bearer valid').send(demoCreateInvestigationInput);
    expect(response.status).toBe(201);
    expect(investigationProgressSchema.parse(response.body).status).toBe('PLANNING');
  });
  it('preflights a project-scoped persisted launch without creating an investigation', async () => {
    const response = await request(application()).post('/api/projects/project_demo_checkout/investigations/preflight').set('authorization', 'Bearer valid').send({
      environmentId: demoCreateInvestigationInput.environmentId,
      journeyId: demoCreateInvestigationInput.journeyId,
      scenario: demoCreateInvestigationInput.scenario,
      invariantIds: demoCreateInvestigationInput.invariantIds,
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'READY',
      projectId: 'project_demo_checkout',
      environmentId: 'environment_demo_local',
      journeyId: 'journey_checkout',
      invariantIds: ['invariant_single_checkout_submission'],
      validation: { status: 'READY', warnings: [] },
    });
  });
  it('returns public Kimi planner provenance without credentials', async () => {
    const response = await request(application()).get('/api/investigations/investigation_api_test/plan').set('authorization', 'Bearer valid');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      aiProvider: 'KIMI',
      plannerStatus: 'ACCEPTED',
      plannerMetadata: { requestedProvider: 'KIMI', effectiveProvider: 'KIMI', model: 'kimi-k2.6' },
    });
    expect(JSON.stringify(response.body)).not.toContain('API_KEY');
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
    expect(response.body.causalConditions.minimisationRun.knownPassingDelayMs).toBe(900);
    expect(response.body.causalConditions.minimisationRun.knownFailingDelayMs).toBe(1200);
    expect(response.body.causalConditions.minimisation.boundedRange.lowerPassingBoundMs).toBe(900);
    expect(response.body.minimalReproduction.id).toBe('minimal_api_test');
  });
  it('returns not found for missing finding detail', async () => {
    const response = await request(application()).get('/api/investigations/investigation_api_test/findings/missing').set('authorization', 'Bearer valid');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('FINDING_NOT_FOUND');
  });
  it('returns final-report Markdown and JSON content through the safe read-only route', async () => {
    const json = await request(application(evidenceRoot)).get('/api/investigations/investigation_api_test/evidence/evidence_final_report/content').set('authorization', 'Bearer valid');
    expect(json.status).toBe(200);
    expect(json.headers['cache-control']).toContain('private');
    expect(json.body).toMatchObject({
      evidenceId: 'evidence_final_report',
      investigationId: 'investigation_api_test',
      type: 'FINAL_REPORT',
      format: 'JSON',
      filename: 'final-report.json',
      content: '{"version":1}',
    });
    expect(JSON.stringify(json.body)).not.toContain(evidenceRoot);

    const markdown = await request(application(evidenceRoot)).get('/api/investigations/investigation_api_test/evidence/evidence_markdown_report/content').set('authorization', 'Bearer valid');
    expect(markdown.status).toBe(200);
    expect(markdown.body).toMatchObject({ format: 'MARKDOWN', content: '# Final report' });
  });
  it('does not reveal cross-investigation evidence and rejects unsupported evidence content', async () => {
    const crossInvestigation = await request(application(evidenceRoot)).get('/api/investigations/other/evidence/evidence_final_report/content').set('authorization', 'Bearer valid');
    expect(crossInvestigation.status).toBe(404);
    expect(crossInvestigation.body.error.code).toBe('INVESTIGATION_NOT_FOUND');

    const unsupported = await request(application(evidenceRoot)).get('/api/investigations/investigation_api_test/evidence/evidence_screenshot/content').set('authorization', 'Bearer valid');
    expect(unsupported.status).toBe(400);
    expect(unsupported.body.error.code).toBe('EVIDENCE_CONTENT_UNSUPPORTED');
  });
});
