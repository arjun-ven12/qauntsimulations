import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { JwtAuthTokenService } from '../../auth/auth-token.service.js';
import { requireAuth } from '../../auth/auth.middleware.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { InvariantController } from '../invariants.controller.js';
import {
  mapInvariantInputToAssertion,
  mapPersistedInvariantToRuntimeDefinition,
} from '../invariants.mapper.js';
import type { InvariantRepositoryContract } from '../invariants.repository.js';
import { createInvariantRouter } from '../invariants.routes.js';
import { InvariantService } from '../invariants.service.js';
import { invariantTemplates } from '../invariants.templates.js';
import type {
  InvariantInput,
  InvariantMembership,
  InvariantProject,
  InvariantRecord,
} from '../invariants.types.js';

describe('Invariant HTTP contract', () => {
  let repository: MemoryInvariantRepository;
  let tokens: JwtAuthTokenService;
  let app: express.Express;

  beforeEach(() => {
    repository = new MemoryInvariantRepository();
    repository.projects.push(
      { id: 'project-1', organisationId: 'org-1' },
      { id: 'project-2', organisationId: 'org-2' },
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
    const controller = new InvariantController(new InvariantService(repository));
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      '/api/projects/:projectId/invariants',
      requireAuth(tokens),
      createInvariantRouter(controller),
    );
    app.use(errorHandler);
  });

  it('lists only active project Invariants', async () => {
    const active = await repository.create('org-1', 'project-1', paymentInput());
    const archived = await repository.create('org-1', 'project-1', {
      ...orderInput(),
      name: 'Archived order rule',
    });
    archived.deletedAt = new Date();
    await repository.create('org-2', 'project-2', orderInput());

    const response = await request(app)
      .get('/api/projects/project-1/invariants')
      .set('Cookie', cookie('viewer', 'org-1', 'VIEWER'));
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(active.id);
  });

  it.each([
    ['duplicate-payment', paymentInput(), 'NO_DUPLICATE_PAYMENT', 'CRITICAL'],
    ['duplicate-order', orderInput(), 'NO_DUPLICATE_ORDER', 'HIGH'],
  ] as const)('creates a supported %s Invariant', async (_label, input, type, severity) => {
    const response = await create(input);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      projectId: 'project-1',
      type,
      severity,
      enabled: true,
      validationStatus: 'READY',
      deletedAt: null,
    });
    expect(response.body).not.toHaveProperty('organisationId');
    expect(response.body).not.toHaveProperty('assertion');
  });

  it('reads a project Invariant', async () => {
    const created = await create(paymentInput());
    const response = await request(app)
      .get(`/api/projects/project-1/invariants/${created.body.id}`)
      .set('Cookie', cookie('member', 'org-1', 'MEMBER'));
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('No duplicate payment');
  });

  it('updates name, rule, severity, and enabled state transactionally', async () => {
    const created = await create(paymentInput());
    const response = await request(app)
      .patch(`/api/projects/project-1/invariants/${created.body.id}`)
      .set('Cookie', cookie('admin', 'org-1', 'ADMIN'))
      .send({
        name: 'One payment per checkout',
        description: 'Each checkout must produce no more than one payment request.',
        severity: 'HIGH',
        enabled: false,
      });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: 'One payment per checkout',
      severity: 'HIGH',
      enabled: false,
    });
    expect((await repository.find('org-1', 'project-1', created.body.id))?.assertion).toMatchObject({
      severity: 'HIGH',
      enabled: false,
    });
  });

  it('archives an Invariant and conceals it afterward', async () => {
    const created = await create(paymentInput());
    await request(app)
      .delete(`/api/projects/project-1/invariants/${created.body.id}`)
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'))
      .expect(204);
    await request(app)
      .get(`/api/projects/project-1/invariants/${created.body.id}`)
      .set('Cookie', cookie('viewer', 'org-1', 'VIEWER'))
      .expect(404);
  });

  it('duplicates with a derived name, fresh ID, and disabled state', async () => {
    const created = await create(orderInput());
    const copy = await request(app)
      .post(`/api/projects/project-1/invariants/${created.body.id}/duplicate`)
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'));
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ name: 'No duplicate order copy', enabled: false });
    expect(copy.body.id).not.toBe(created.body.id);
    expect(copy.body.configuration).toEqual(created.body.configuration);
  });

  it.each([
    ['unsupported evaluator', { ...paymentInput(), type: 'CUSTOM_EXPRESSION' }],
    ['invalid severity', { ...paymentInput(), severity: 'BLOCKER' }],
    [
      'unknown structured property',
      {
        ...paymentInput(),
        configuration: {
          ...paymentInput().configuration,
          arbitraryExpression: 'payments.length <= 1',
        },
      },
    ],
    [
      'executable plain-language content',
      { ...paymentInput(), description: 'Run javascript:alert(1) before checking payments.' },
    ],
  ])('rejects %s', async (_label, input) => {
    const response = await create(input as InvariantInput);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.invariants).toHaveLength(0);
  });

  it('returns READY checks for a valid supported Invariant without runtime execution', async () => {
    const created = await create(paymentInput());
    const executions = repository.runtimeExecutions;
    const response = await request(app)
      .post(`/api/projects/project-1/invariants/${created.body.id}/validate`)
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('READY');
    expect(response.body.checks.every((check: { status: string }) => check.status === 'PASSED')).toBe(
      true,
    );
    expect(repository.runtimeExecutions).toBe(executions);
  });

  it('returns INVALID for a persisted unsupported configuration', async () => {
    const record = recordFor('legacy-1', 'org-1', 'project-1', paymentInput());
    record.assertion = { type: 'NO_DUPLICATE_PAYMENT', config: { arbitrary: true } };
    repository.invariants.push(record);
    const response = await request(app)
      .post('/api/projects/project-1/invariants/legacy-1/validate')
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('INVALID');
    expect(response.body.checks).toContainEqual(
      expect.objectContaining({ key: 'runtime-definition', status: 'FAILED' }),
    );
  });

  it.each(['OWNER', 'ADMIN'] as const)('allows %s mutation', async (role) => {
    const user = role.toLowerCase();
    const response = await request(app)
      .post('/api/projects/project-1/invariants')
      .set('Cookie', cookie(user, 'org-1', role))
      .send({ ...paymentInput(), name: `${role} rule` });
    expect(response.status).toBe(201);
  });

  it.each(['MEMBER', 'VIEWER'] as const)('returns 403 for %s mutation', async (role) => {
    const response = await request(app)
      .post('/api/projects/project-1/invariants')
      .set('Cookie', cookie(role.toLowerCase(), 'org-1', role))
      .send(paymentInput());
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('conceals cross-organisation projects', async () => {
    const response = await request(app)
      .get('/api/projects/project-2/invariants')
      .set('Cookie', cookie('viewer', 'org-1', 'VIEWER'));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('conceals an Invariant accessed through another project', async () => {
    const record = await repository.create('org-2', 'project-2', orderInput());
    const response = await request(app)
      .get(`/api/projects/project-1/invariants/${record.id}`)
      .set('Cookie', cookie('viewer', 'org-1', 'VIEWER'));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('INVARIANT_NOT_FOUND');
  });

  it('returns a project-scoped duplicate-name conflict', async () => {
    await create(paymentInput());
    const response = await create(paymentInput());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVARIANT_NAME_CONFLICT');
  });

  it('maps both exact evaluator identifiers to the runtime contract', () => {
    const payment = recordFor('payment-1', 'org-1', 'project-1', paymentInput());
    const order = recordFor('order-1', 'org-1', 'project-1', orderInput());
    expect(mapPersistedInvariantToRuntimeDefinition(payment)).toEqual({
      id: 'payment-1',
      type: 'NO_DUPLICATE_PAYMENT',
      severity: 'CRITICAL',
      config: { requestPatterns: ['/api/payments'], methods: ['POST'] },
    });
    expect(mapPersistedInvariantToRuntimeDefinition(order).type).toBe('NO_DUPLICATE_ORDER');
  });

  it('rejects disabled, archived, and unsupported runtime mapping', () => {
    const disabled = recordFor('disabled', 'org-1', 'project-1', {
      ...paymentInput(),
      enabled: false,
    });
    const archived = recordFor('archived', 'org-1', 'project-1', paymentInput());
    archived.deletedAt = new Date();
    const unsupported = recordFor('unsupported', 'org-1', 'project-1', paymentInput());
    unsupported.assertion = { type: 'CUSTOM' };
    expect(() => mapPersistedInvariantToRuntimeDefinition(disabled)).toThrow('Disabled');
    expect(() => mapPersistedInvariantToRuntimeDefinition(archived)).toThrow('Archived');
    expect(() => mapPersistedInvariantToRuntimeDefinition(unsupported)).toThrow('unsupported');
  });

  it('exports only the two stable evaluator templates', () => {
    expect(invariantTemplates.map((template) => template.type)).toEqual([
      'NO_DUPLICATE_PAYMENT',
      'NO_DUPLICATE_ORDER',
    ]);
  });

  function create(input: InvariantInput) {
    return request(app)
      .post('/api/projects/project-1/invariants')
      .set('Cookie', cookie('owner', 'org-1', 'OWNER'))
      .send(input);
  }

  function cookie(userId: string, organisationId: string, role: AuthContext['role']) {
    const token = tokens.issueAccessToken({ userId, organisationId, role, tokenVersion: 0 });
    return `taskos_access=${token}`;
  }
});

class MemoryInvariantRepository implements InvariantRepositoryContract {
  memberships = new Map<string, InvariantMembership>();
  projects: InvariantProject[] = [];
  invariants: InvariantRecord[] = [];
  runtimeExecutions = 0;
  private nextId = 1;

  async findMembership(userId: string, organisationId: string) {
    return this.memberships.get(`${userId}:${organisationId}`) ?? null;
  }

  async findProject(organisationId: string, projectId: string) {
    return (
      this.projects.find(
        (project) => project.id === projectId && project.organisationId === organisationId,
      ) ?? null
    );
  }

  async create(organisationId: string, projectId: string, input: InvariantInput) {
    const record = recordFor(`invariant-${this.nextId++}`, organisationId, projectId, input);
    this.invariants.push(record);
    return record;
  }

  async list(organisationId: string, projectId: string) {
    return this.invariants.filter(
      (record) =>
        record.organisationId === organisationId &&
        record.projectId === projectId &&
        record.deletedAt === null,
    );
  }

  async find(organisationId: string, projectId: string, invariantId: string) {
    return (
      this.invariants.find(
        (record) =>
          record.id === invariantId &&
          record.organisationId === organisationId &&
          record.projectId === projectId &&
          record.deletedAt === null,
      ) ?? null
    );
  }

  async update(
    organisationId: string,
    projectId: string,
    invariantId: string,
    input: InvariantInput,
  ) {
    const record = await this.find(organisationId, projectId, invariantId);
    if (!record) return null;
    record.name = input.name;
    record.description = input.description;
    record.assertion = mapInvariantInputToAssertion(input);
    record.updatedAt = new Date();
    return record;
  }

  async archive(organisationId: string, projectId: string, invariantId: string) {
    const record = await this.find(organisationId, projectId, invariantId);
    if (!record) return false;
    record.deletedAt = new Date();
    return true;
  }

  async nameExists(
    organisationId: string,
    projectId: string,
    name: string,
    excludingId?: string,
  ) {
    return this.invariants.some(
      (record) =>
        record.organisationId === organisationId &&
        record.projectId === projectId &&
        record.name === name &&
        record.deletedAt === null &&
        record.id !== excludingId,
    );
  }
}

function paymentInput(): InvariantInput {
  return {
    name: 'No duplicate payment',
    description: 'A customer must never be charged twice for one checkout.',
    type: 'NO_DUPLICATE_PAYMENT',
    configuration: { requestPatterns: ['/api/payments'], methods: ['POST'] },
    severity: 'CRITICAL',
    enabled: true,
  };
}

function orderInput(): InvariantInput {
  return {
    name: 'No duplicate order',
    description: 'A checkout must never create more than one order.',
    type: 'NO_DUPLICATE_ORDER',
    configuration: {
      requestPatterns: ['/api/orders'],
      methods: ['POST'],
      orderIdSelector: '[data-testid="order-id"]',
    },
    severity: 'HIGH',
    enabled: true,
  };
}

function recordFor(
  id: string,
  organisationId: string,
  projectId: string,
  input: InvariantInput,
): InvariantRecord {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    organisationId,
    projectId,
    name: input.name,
    description: input.description,
    assertion: mapInvariantInputToAssertion(input),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
