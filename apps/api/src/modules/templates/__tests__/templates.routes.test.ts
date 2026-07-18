import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { requireAuth } from '../../auth/auth.middleware.js';
import { JwtAuthTokenService } from '../../auth/auth-token.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { TemplateController } from '../templates.controller.js';
import type { TemplateRepositoryContract } from '../templates.repository.js';
import { createTemplateRouter } from '../templates.routes.js';
import type { TemplateCategory } from '../templates.schema.js';
import { TemplateService } from '../templates.service.js';
import type {
  TemplateCreateRecord,
  TemplateMembership,
  TemplateRecord,
  TemplateUpdateRecord,
} from '../templates.types.js';

describe('Custom Template HTTP contract', () => {
  let repository: MemoryTemplateRepository;
  let tokens: JwtAuthTokenService;
  let app: express.Express;

  beforeEach(() => {
    repository = new MemoryTemplateRepository();
    repository.memberships.set('owner:org-1', { role: 'OWNER' });
    repository.memberships.set('other:org-1', { role: 'MEMBER' });
    repository.memberships.set('viewer:org-1', { role: 'VIEWER' });
    repository.memberships.set('owner:org-2', { role: 'OWNER' });
    tokens = new JwtAuthTokenService({
      accessSecret: 'a'.repeat(48),
      refreshSecret: 'b'.repeat(48),
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    });
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      '/api/templates',
      requireAuth(tokens),
      createTemplateRouter(new TemplateController(new TemplateService(repository))),
    );
    app.use(errorHandler);
  });

  it('creates, lists, reads, updates, and deletes a template', async () => {
    const created = await create('owner', 'org-1', projectInput());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      category: 'PROJECT',
      source: 'CUSTOM',
      name: 'Checkout project',
      schemaVersion: 1,
    });
    expect(created.body).not.toHaveProperty('organisationId');
    expect(created.body).not.toHaveProperty('ownerUserId');

    const listed = await request(app)
      .get('/api/templates?category=PROJECT')
      .set('Cookie', cookie('owner', 'org-1'));
    expect(listed.body).toHaveLength(1);

    await request(app)
      .get(`/api/templates/${created.body.id}`)
      .set('Cookie', cookie('owner', 'org-1'))
      .expect(200);

    const updated = await request(app)
      .put(`/api/templates/${created.body.id}`)
      .set('Cookie', cookie('owner', 'org-1'))
      .send({ name: 'Renamed project', schemaVersion: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Renamed project');

    await request(app)
      .delete(`/api/templates/${created.body.id}`)
      .set('Cookie', cookie('owner', 'org-1'))
      .expect(204);
    await request(app)
      .get(`/api/templates/${created.body.id}`)
      .set('Cookie', cookie('owner', 'org-1'))
      .expect(404);
  });

  it('denies unauthenticated access to every operation', async () => {
    await request(app).get('/api/templates').expect(401);
    await request(app).post('/api/templates').send(projectInput()).expect(401);
    await request(app).put('/api/templates/guessed').send({ name: 'No access' }).expect(401);
    await request(app).delete('/api/templates/guessed').expect(401);
  });

  it('isolates templates by organisation and authenticated user', async () => {
    await create('owner', 'org-1', projectInput());
    const otherUser = await request(app)
      .get('/api/templates')
      .set('Cookie', cookie('other', 'org-1'));
    const otherOrganisation = await request(app)
      .get('/api/templates')
      .set('Cookie', cookie('owner', 'org-2'));
    expect(otherUser.body).toEqual([]);
    expect(otherOrganisation.body).toEqual([]);
  });

  it('enforces case-insensitive unique names within a category', async () => {
    await create('owner', 'org-1', projectInput());
    const conflict = await create('owner', 'org-1', {
      ...projectInput(),
      name: ' checkout   PROJECT ',
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('TEMPLATE_NAME_CONFLICT');
  });

  it('persists the complete strict invariant payload', async () => {
    const payload = {
      name: 'No duplicate charge',
      description: 'A checkout must never produce two successful charges.',
      type: 'NO_DUPLICATE_PAYMENT',
      severity: 'CRITICAL',
      enabled: true,
      configuration: { requestPatterns: ['/api/payments'], methods: ['POST', 'PATCH'] },
    };
    const created = await create('owner', 'org-1', {
      category: 'INVARIANT',
      name: 'Payment safety',
      schemaVersion: 1,
      payload,
    });
    expect(created.status).toBe(201);
    expect(created.body.payload).toEqual(payload);
  });

  it('rejects unknown, sensitive, and oversized payload fields', async () => {
    await create('owner', 'org-1', {
      ...projectInput(),
      payload: { ...projectInput().payload, projectId: 'project-1' },
    }).then((response) => expect(response.status).toBe(422));
    await create('owner', 'org-1', {
      ...projectInput(),
      payload: { ...projectInput().payload, secret: 'do-not-save' },
    }).then((response) => expect(response.status).toBe(422));
    await create('owner', 'org-1', {
      ...projectInput(),
      payload: { ...projectInput().payload, description: 'x'.repeat(65 * 1024) },
    }).then((response) => expect(response.status).toBe(422));
  });

  it('hides guessed foreign template ids for reads, updates, and deletes', async () => {
    const created = await create('owner', 'org-2', projectInput());
    const foreignId = created.body.id as string;
    await request(app)
      .get(`/api/templates/${foreignId}`)
      .set('Cookie', cookie('owner', 'org-1'))
      .expect(404);
    await request(app)
      .put(`/api/templates/${foreignId}`)
      .set('Cookie', cookie('owner', 'org-1'))
      .send({ name: 'Stolen' })
      .expect(404);
    await request(app)
      .delete(`/api/templates/${foreignId}`)
      .set('Cookie', cookie('owner', 'org-1'))
      .expect(404);
  });

  it('allows viewers to read but not mutate templates', async () => {
    await request(app).get('/api/templates').set('Cookie', cookie('viewer', 'org-1')).expect(200);
    await create('viewer', 'org-1', projectInput()).then((response) => {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSION');
    });
  });

  it('rejects unsupported versions, unknown categories, and invalid payloads', async () => {
    await create('owner', 'org-1', { ...projectInput(), schemaVersion: 2 }).then((response) =>
      expect(response.status).toBe(422),
    );
    await create('owner', 'org-1', { ...projectInput(), category: 'UNKNOWN' }).then((response) =>
      expect(response.status).toBe(422),
    );
    await create('owner', 'org-1', { ...projectInput(), payload: { name: 'Incomplete' } }).then(
      (response) => expect(response.status).toBe(422),
    );
  });

  function create(userId: string, organisationId: string, input: Record<string, unknown>) {
    return request(app)
      .post('/api/templates')
      .set('Cookie', cookie(userId, organisationId))
      .send(input);
  }

  function cookie(
    userId: string,
    organisationId: string,
    role: AuthContext['role'] = userId === 'viewer' ? 'VIEWER' : 'OWNER',
  ) {
    return `taskos_access=${tokens.issueAccessToken({ userId, organisationId, role, tokenVersion: 0 })}`;
  }
});

class MemoryTemplateRepository implements TemplateRepositoryContract {
  memberships = new Map<string, TemplateMembership>();
  templates: TemplateRecord[] = [];
  private nextId = 1;

  async findMembership(userId: string, organisationId: string) {
    return this.memberships.get(`${userId}:${organisationId}`) ?? null;
  }

  async list(organisationId: string, ownerUserId: string, category?: TemplateCategory) {
    return this.templates.filter(
      (template) =>
        template.organisationId === organisationId &&
        template.ownerUserId === ownerUserId &&
        (!category || template.category === category),
    );
  }

  async find(organisationId: string, ownerUserId: string, id: string) {
    return (
      this.templates.find(
        (template) =>
          template.id === id &&
          template.organisationId === organisationId &&
          template.ownerUserId === ownerUserId,
      ) ?? null
    );
  }

  async create(input: TemplateCreateRecord) {
    if (
      this.templates.some(
        (template) =>
          template.organisationId === input.organisationId &&
          template.ownerUserId === input.ownerUserId &&
          template.category === input.category &&
          template.normalizedName === input.normalizedName,
      )
    ) {
      throw { code: 'P2002' };
    }
    const now = new Date();
    const record: TemplateRecord = {
      ...input,
      id: `template-${this.nextId++}`,
      createdAt: now,
      updatedAt: now,
    };
    this.templates.push(record);
    return record;
  }

  async update(
    organisationId: string,
    ownerUserId: string,
    id: string,
    input: TemplateUpdateRecord,
  ) {
    const record = await this.find(organisationId, ownerUserId, id);
    if (!record) return null;
    if (
      input.normalizedName &&
      this.templates.some(
        (template) =>
          template.id !== id &&
          template.organisationId === organisationId &&
          template.ownerUserId === ownerUserId &&
          template.category === record.category &&
          template.normalizedName === input.normalizedName,
      )
    ) {
      throw { code: 'P2002' };
    }
    Object.assign(record, input, { updatedAt: new Date() });
    return record;
  }

  async remove(organisationId: string, ownerUserId: string, id: string) {
    const index = this.templates.findIndex(
      (template) =>
        template.id === id &&
        template.organisationId === organisationId &&
        template.ownerUserId === ownerUserId,
    );
    if (index < 0) return false;
    this.templates.splice(index, 1);
    return true;
  }
}

function projectInput() {
  return {
    category: 'PROJECT',
    name: 'Checkout project',
    schemaVersion: 1,
    payload: {
      name: 'Checkout',
      description: null,
      applicationUrl: 'https://checkout.example.test',
      repositoryUrl: null,
      apiEndpoints: [],
      webhookEndpoints: [],
    },
  };
}
