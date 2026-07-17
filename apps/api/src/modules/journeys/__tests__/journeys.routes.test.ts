import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { JwtAuthTokenService } from '../../auth/auth-token.service.js';
import { requireAuth } from '../../auth/auth.middleware.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { tryParseSafetyConfiguration } from '../../projects/projects.mapper.js';
import { checkoutPurchaseFlowFixture } from '../checkout-purchase-flow.fixture.js';
import { JourneyController } from '../journeys.controller.js';
import { encodeSteps, toRuntimeJourney } from '../journeys.mapper.js';
import type { JourneyRepositoryContract } from '../journeys.repository.js';
import { createJourneyRouter } from '../journeys.routes.js';
import { JourneyService } from '../journeys.service.js';
import type {
  JourneyEnvironment,
  JourneyMembership,
  JourneyPersistenceInput,
  JourneyProject,
  JourneyRecord,
} from '../journeys.types.js';

describe('Journey HTTP contract', () => {
  let repository: MemoryJourneyRepository;
  let tokens: JwtAuthTokenService;
  let app: express.Express;
  let validJourney: ReturnType<typeof checkoutPurchaseFlowFixture>;

  beforeEach(() => {
    repository = new MemoryJourneyRepository();
    repository.projects.push(project('project-1', 'org-1'), project('project-2', 'org-2'));
    repository.environments.push(
      environment('environment-1', 'project-1'),
      environment('environment-2', 'project-2'),
    );
    repository.memberships.set('owner:org-1', { role: 'OWNER' });
    repository.memberships.set('admin:org-1', { role: 'ADMIN' });
    repository.memberships.set('member:org-1', { role: 'MEMBER' });
    repository.memberships.set('viewer:org-1', { role: 'VIEWER' });
    tokens = new JwtAuthTokenService({
      accessSecret: 'a'.repeat(48),
      refreshSecret: 'b'.repeat(48),
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    });
    const controller = new JourneyController(new JourneyService(repository));
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      '/api/projects/:projectId/journeys',
      requireAuth(tokens),
      createJourneyRouter(controller),
    );
    app.use(errorHandler);
    validJourney = checkoutPurchaseFlowFixture('environment-1');
  });

  it('creates, lists, and reads a complete project Journey', async () => {
    const created = await createJourney();
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Checkout Purchase Flow',
      environmentId: 'environment-1',
      startPath: '/products/test-product',
      validationStatus: 'DRAFT',
    });
    expect(created.body.steps).toHaveLength(12);
    expect(created.body.steps.map((step: { order: number }) => step.order)).toEqual(
      Array.from({ length: 12 }, (_, index) => index),
    );

    const listed = await request(app)
      .get('/api/projects/project-1/journeys')
      .set('Cookie', cookie('viewer', 'org-1', 'VIEWER'));
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);

    const read = await request(app)
      .get(`/api/projects/project-1/journeys/${created.body.id}`)
      .set('Cookie', cookie('member', 'org-1', 'MEMBER'));
    expect(read.status).toBe(200);
    expect(read.body.id).toBe(created.body.id);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/projects/project-1/journeys').expect(401);
  });

  it('updates a Journey by atomically replacing and normalising all ordered steps', async () => {
    const created = await createJourney();
    const originalIds = created.body.steps.map((step: { id: string }) => step.id);
    const response = await request(app)
      .patch(`/api/projects/project-1/journeys/${created.body.id}`)
      .set('Cookie', cookie('admin', 'org-1', 'ADMIN'))
      .send({
        name: 'Short checkout',
        steps: [
          step(9, 'ASSERT_VISIBLE', '[data-testid="order-id"]'),
          step(9, 'GOTO', null, '/products/test-product'),
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Short checkout');
    expect(response.body.steps.map((item: { order: number }) => item.order)).toEqual([0, 1]);
    expect(response.body.steps.map((item: { id: string }) => item.id)).not.toEqual(originalIds);
  });

  it('soft-deletes a Journey and then conceals it', async () => {
    const created = await createJourney();
    await request(app)
      .delete(`/api/projects/project-1/journeys/${created.body.id}`)
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'))
      .expect(204);
    await request(app)
      .get(`/api/projects/project-1/journeys/${created.body.id}`)
      .set('Cookie', cookie('viewer', 'org-1', 'VIEWER'))
      .expect(404);
  });

  it('duplicates with a derived name, draft status, and fresh Journey/step IDs', async () => {
    const created = await createJourney();
    const copy = await request(app)
      .post(`/api/projects/project-1/journeys/${created.body.id}/duplicate`)
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'));
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ name: 'Checkout Purchase Flow copy', state: 'DRAFT' });
    expect(copy.body.id).not.toBe(created.body.id);
    expect(copy.body.steps.map((step: { id: string }) => step.id)).not.toEqual(
      created.body.steps.map((step: { id: string }) => step.id),
    );
  });

  it('validates a ready Journey without executing runtime work', async () => {
    const created = await createJourney();
    const writesBefore = repository.validationWrites;
    const response = await request(app)
      .post(`/api/projects/project-1/journeys/${created.body.id}/validate`)
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('READY');
    expect(response.body.checks.every((check: { status: string }) => check.status === 'PASSED')).toBe(
      true,
    );
    expect(repository.validationWrites).toBe(writesBefore + 1);
    expect(repository.runtimeExecutions).toBe(0);
  });

  it.each([
    {
      label: 'unsupported action',
      mutate: (input: Record<string, unknown>) => ({
        ...input,
        steps: [step(0, 'CUSTOM', null, null)],
      }),
      status: 422,
    },
    {
      label: 'missing CLICK selector',
      mutate: (input: Record<string, unknown>) => ({ ...input, steps: [step(0, 'CLICK')] }),
      status: 422,
    },
    {
      label: 'missing FILL value',
      mutate: (input: Record<string, unknown>) => ({
        ...input,
        steps: [step(0, 'FILL', '[data-testid="email-input"]')],
      }),
      status: 422,
    },
    {
      label: 'unsafe GOTO URL',
      mutate: (input: Record<string, unknown>) => ({
        ...input,
        steps: [step(0, 'GOTO', null, 'javascript:alert(1)')],
      }),
      status: 422,
    },
  ])('rejects $label', async ({ mutate, status }) => {
    const response = await request(app)
      .post('/api/projects/project-1/journeys')
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'))
      .send(mutate(validJourney as unknown as Record<string, unknown>));
    expect(response.status).toBe(status);
    expect(repository.journeys).toHaveLength(0);
  });

  it('rejects an Environment belonging to another project', async () => {
    const response = await request(app)
      .post('/api/projects/project-1/journeys')
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'))
      .send({ ...validJourney, environmentId: 'environment-2' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ENVIRONMENT_NOT_FOUND');
  });

  it('enforces the canonical Project Safety checkout, mock-payment, and test-order toggles', async () => {
    const configuration = repository.projects[0]!.safetyPolicies[0]!
      .configuration as Record<string, unknown>;
    configuration.permitTestOrderCreation = false;
    const response = await createJourney();
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: 'JOURNEY_SAFETY_CONFLICT',
      message: 'Test-order creation is disabled by Project Safety.',
    });
  });

  it('rejects navigation to a host outside Project Safety', async () => {
    const response = await request(app)
      .post('/api/projects/project-1/journeys')
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'))
      .send({
        ...validJourney,
        steps: [step(0, 'GOTO', null, 'https://evil.example/products/test-product')],
      });
    expect(response.status).toBe(422);
    expect(response.body.error.message).toContain('not authorised');
  });

  it('conceals cross-organisation project and Journey access', async () => {
    const response = await request(app)
      .get('/api/projects/project-2/journeys/journey-other')
      .set('Cookie', cookie('viewer', 'org-1', 'VIEWER'));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it.each([
    ['member', 'MEMBER'],
    ['viewer', 'VIEWER'],
  ] as const)('returns 403 for %s mutation', async (userId, role) => {
    const response = await request(app)
      .post('/api/projects/project-1/journeys')
      .set('Cookie', cookie(userId, 'org-1', role))
      .send(validJourney);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('returns 409 for duplicate Journey names', async () => {
    await createJourney();
    const duplicate = await createJourney();
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('JOURNEY_NAME_CONFLICT');
  });

  it('maps the seeded checkout Journey to the exact worker contract', async () => {
    const created = await createJourney();
    const record = repository.journeys.find((journey) => journey.id === created.body.id)!;
    const runtime = toRuntimeJourney(record);
    expect(runtime.steps).toHaveLength(12);
    expect(runtime.steps.map((item) => item.type)).toEqual([
      'goto',
      'assertVisible',
      'click',
      'assertVisible',
      'click',
      'click',
      'assertVisible',
      'fill',
      'click',
      'waitFor',
      'waitFor',
      'assertVisible',
    ]);
    expect(runtime.steps[6]).toMatchObject({
      name: 'checkout-form-loaded',
      screenshotCheckpoint: true,
    });
    expect(runtime.steps[11]).toMatchObject({
      name: 'order-confirmation',
      screenshotCheckpoint: true,
    });
    expect(runtime.successCondition).toEqual({
      type: 'visible',
      selector: '[data-testid="order-id"]',
    });
  });

  function createJourney() {
    return request(app)
      .post('/api/projects/project-1/journeys')
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'))
      .send(validJourney);
  }

  function cookie(userId: string, organisationId: string, role: AuthContext['role']) {
    const token = tokens.issueAccessToken({ userId, organisationId, role, tokenVersion: 0 });
    return `taskos_access=${token}`;
  }
});

class MemoryJourneyRepository implements JourneyRepositoryContract {
  memberships = new Map<string, JourneyMembership>();
  projects: JourneyProject[] = [];
  environments: JourneyEnvironment[] = [];
  journeys: Array<JourneyRecord & { deletedAt: Date | null }> = [];
  validationWrites = 0;
  runtimeExecutions = 0;
  private nextJourney = 1;
  private nextStep = 1;

  async findMembership(userId: string, organisationId: string) {
    return this.memberships.get(`${userId}:${organisationId}`) ?? null;
  }

  async findProject(organisationId: string, projectId: string) {
    return (
      this.projects.find(
        (candidate) =>
          candidate.id === projectId && candidate.organisationId === organisationId,
      ) ?? null
    );
  }

  async findEnvironment(projectId: string, environmentId: string) {
    return (
      this.environments.find(
        (candidate) =>
          candidate.id === environmentId &&
          candidate.projectId === projectId &&
          candidate.deletedAt === null,
      ) ?? null
    );
  }

  async create(projectId: string, input: JourneyPersistenceInput) {
    const record = this.record(`journey-${this.nextJourney++}`, projectId, input);
    this.journeys.push(record);
    return record;
  }

  async list(projectId: string) {
    return this.journeys.filter(
      (journey) => journey.projectId === projectId && journey.deletedAt === null,
    );
  }

  async find(projectId: string, journeyId: string) {
    return (
      this.journeys.find(
        (journey) =>
          journey.id === journeyId && journey.projectId === projectId && journey.deletedAt === null,
      ) ?? null
    );
  }

  async update(projectId: string, journeyId: string, input: JourneyPersistenceInput) {
    const index = this.journeys.findIndex(
      (journey) => journey.id === journeyId && journey.projectId === projectId && !journey.deletedAt,
    );
    if (index < 0) return null;
    const createdAt = this.journeys[index]!.createdAt;
    const record = this.record(journeyId, projectId, input);
    record.createdAt = createdAt;
    this.journeys[index] = record;
    return record;
  }

  async archive(projectId: string, journeyId: string) {
    const journey = await this.find(projectId, journeyId);
    if (!journey) return false;
    journey.deletedAt = new Date();
    return true;
  }

  async nameExists(projectId: string, name: string, excludingId?: string) {
    return this.journeys.some(
      (journey) =>
        journey.projectId === projectId &&
        journey.name === name &&
        journey.deletedAt === null &&
        journey.id !== excludingId,
    );
  }

  async setValidationMetadata(
    projectId: string,
    journeyId: string,
    metadata: Record<string, unknown>,
  ) {
    const journey = await this.find(projectId, journeyId);
    if (!journey?.steps[0]) return null;
    journey.steps[0].metadata = metadata;
    journey.updatedAt = new Date();
    this.validationWrites += 1;
    return journey;
  }

  private record(id: string, projectId: string, input: JourneyPersistenceInput) {
    const now = new Date();
    return {
      id,
      projectId,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      steps: encodeSteps(input).map((item) => ({
        ...item,
        id: `step-${this.nextStep++}`,
      })),
    };
  }
}

function project(id: string, organisationId: string): JourneyProject {
  return {
    id,
    organisationId,
    safetyPolicies: [
      {
        domainAllowlist: ['staging.example.com'],
        blockedActions: ['Never access production.'],
        configuration: tryParseSafetyConfiguration({
          version: 1,
          applicationUrl: 'https://staging.example.com',
          apiEndpoints: [],
          webhookEndpoints: [],
          allowedHttpMethods: ['GET'],
          permitCheckoutSubmission: true,
          permitMockPayment: true,
          permitOrderCreation: true,
          restrictions: {
            testEnvironmentsOnly: true,
            productionAccess: false,
            realPayments: false,
            destructiveAccountActions: false,
            externalDataExport: false,
            realCustomerChanges: false,
            externalMessaging: false,
            repositoryDeletion: false,
            infrastructureChanges: false,
            crossOrganisationAccess: false,
            unknownDomains: false,
          },
          acknowledgedAt: '2026-01-01T00:00:00.000Z',
        })!,
      },
    ],
  };
}

function environment(id: string, projectId: string): JourneyEnvironment {
  return {
    id,
    projectId,
    baseUrl: 'https://staging.example.com',
    validationStatus: 'READY',
    deletedAt: null,
  };
}

function step(
  order: number,
  action: string,
  selector: string | null = null,
  value: string | null = null,
) {
  return { order, action, selector, value, metadata: {} };
}
