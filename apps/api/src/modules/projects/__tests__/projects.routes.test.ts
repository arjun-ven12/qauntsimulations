import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { JwtAuthTokenService } from '../../auth/auth-token.service.js';
import { requireAuth } from '../../auth/auth.middleware.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { ProjectController } from '../projects.controller.js';
import type { ProjectRepository } from '../projects.repository.js';
import { createProjectRouter } from '../projects.routes.js';
import { ProjectService } from '../projects.service.js';
import type {
  ProjectListRecord,
  ProjectMembership,
  ProjectMutationRecord,
  ProjectRecord,
} from '../projects.types.js';

const validProject = {
  name: '  Checkout staging  ',
  description: 'Safe checkout reliability target',
  applicationUrl: 'https://staging.example.com/',
  repositoryUrl: 'https://github.com/taskos/checkout/',
  credentialReferences: [
    { label: 'Test customer', reference: 'vault://worldlab/checkout/test-customer' },
  ],
  apiEndpoints: [{ label: 'Health', url: 'https://api.staging.example.com/health' }],
  webhookEndpoints: [{ label: 'Order events', url: 'https://hooks.staging.example.com/orders' }],
  prohibitedActions: ['Never issue refunds.'],
  acknowledgement: true,
};

describe('project HTTP contract', () => {
  let repository: MemoryProjectRepository;
  let tokens: JwtAuthTokenService;
  let app: express.Express;

  beforeEach(() => {
    repository = new MemoryProjectRepository();
    tokens = new JwtAuthTokenService({
      accessSecret: 'a'.repeat(48),
      refreshSecret: 'b'.repeat(48),
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    });
    const controller = new ProjectController(new ProjectService(repository));
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/projects', requireAuth(tokens), createProjectRouter(controller));
    app.use(errorHandler);
  });

  it('returns 401 when project creation is unauthenticated', async () => {
    await request(app).post('/api/projects').send(validProject).expect(401);
  });

  it('creates a project inside the verified organisation with safe references and defaults', async () => {
    repository.memberships.set('owner:org-1', { role: 'OWNER' });
    const response = await request(app)
      .post('/api/projects')
      .set('Cookie', accessCookie('owner', 'org-1', 'OWNER'))
      .send(validProject);

    expect(response.status).toBe(201);
    expect(repository.created?.organisationId).toBe('org-1');
    expect(repository.created?.configuration.applicationUrl).toBe('https://staging.example.com');
    expect(repository.created?.domainAllowlist).toEqual([
      'api.staging.example.com',
      'hooks.staging.example.com',
      'staging.example.com',
    ]);
    expect(repository.created?.configuration).toMatchObject({
      permitCheckoutSubmission: false,
      permitMockPayment: false,
      permitOrderCreation: false,
      restrictions: { testEnvironmentsOnly: true, productionAccess: false },
    });
    expect(response.body.credentialReferences[0]).toMatchObject({
      label: 'Test customer',
      provider: 'vault',
      reference: 'vault://worldlab/checkout/test-customer',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/encryptedPayload|password|secretValue/i);
  });

  it.each(['javascript:alert(1)', 'file:///tmp/secret', 'ftp://example.com'])(
    'rejects unsupported application URL %s',
    async (applicationUrl) => {
      repository.memberships.set('owner:org-1', { role: 'OWNER' });
      const response = await request(app)
        .post('/api/projects')
        .set('Cookie', accessCookie('owner', 'org-1', 'OWNER'))
        .send({ ...validProject, applicationUrl });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('rejects malformed URLs, arbitrary organisation assignment, and raw secret fields', async () => {
    repository.memberships.set('owner:org-1', { role: 'OWNER' });
    for (const payload of [
      { ...validProject, applicationUrl: 'not-a-url' },
      { ...validProject, organisationId: 'org-2' },
      { ...validProject, password: 'plaintext-password' },
    ]) {
      const response = await request(app)
        .post('/api/projects')
        .set('Cookie', accessCookie('owner', 'org-1', 'OWNER'))
        .send(payload);
      expect(response.status).toBe(422);
    }
    expect(repository.created).toBeNull();
  });

  it('rejects blank and duplicate prohibited actions', async () => {
    repository.memberships.set('owner:org-1', { role: 'OWNER' });
    for (const prohibitedActions of [[''], ['Never issue refunds.', '  never issue refunds  ']]) {
      const response = await request(app)
        .post('/api/projects')
        .set('Cookie', accessCookie('owner', 'org-1', 'OWNER'))
        .send({ ...validProject, prohibitedActions });
      expect(response.status).toBe(422);
    }
  });

  it('lists only projects from the authenticated organisation in updated order', async () => {
    repository.memberships.set('viewer:org-1', { role: 'VIEWER' });
    repository.projects.push(
      projectRecord('project-1', 'org-1'),
      projectRecord('project-2', 'org-2'),
    );
    const response = await request(app)
      .get('/api/projects')
      .set('Cookie', accessCookie('viewer', 'org-1', 'VIEWER'));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: 'project-1', organisationId: 'org-1' });
    expect(repository.lastListOrganisationId).toBe('org-1');
  });

  it('conceals projects belonging to another organisation', async () => {
    repository.memberships.set('viewer:org-1', { role: 'VIEWER' });
    repository.projects.push(projectRecord('project-other', 'org-2'));
    await request(app)
      .get('/api/projects/project-other')
      .set('Cookie', accessCookie('viewer', 'org-1', 'VIEWER'))
      .expect(404);
  });

  it('allows members to edit project setup but denies viewers', async () => {
    const existing = projectRecord('project-1', 'org-1');
    existing.safetyPolicies[0]!.domainAllowlist = ['custom-safe.example.com'];
    existing.secrets.push({
      id: 'secret-existing',
      name: 'Existing test user',
      provider: 'vault',
      externalReference: 'vault://worldlab/existing/test-user',
    });
    repository.projects.push(existing);
    repository.memberships.set('member:org-1', { role: 'MEMBER' });
    repository.memberships.set('viewer:org-1', { role: 'VIEWER' });

    const member = await request(app)
      .patch('/api/projects/project-1')
      .set('Cookie', accessCookie('member', 'org-1', 'MEMBER'))
      .send({ name: 'Updated project' });
    expect(member.status).toBe(200);
    expect(member.body.name).toBe('Updated project');
    expect(member.body.credentialReferences).toEqual([
      expect.objectContaining({ reference: 'vault://worldlab/existing/test-user' }),
    ]);
    expect(member.body.safety.domainAllowlist).toEqual(['custom-safe.example.com']);

    const viewer = await request(app)
      .patch('/api/projects/project-1')
      .set('Cookie', accessCookie('viewer', 'org-1', 'VIEWER'))
      .send({ name: 'Forbidden update' });
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('returns legacy projects safely until application setup is completed', async () => {
    repository.memberships.set('owner:org-1', { role: 'OWNER' });
    const legacy = projectRecord('project-legacy', 'org-1');
    legacy.safetyPolicies[0]!.configuration = {};
    repository.projects.push(legacy);

    const response = await request(app)
      .get('/api/projects/project-legacy')
      .set('Cookie', accessCookie('owner', 'org-1', 'OWNER'));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      applicationUrl: null,
      apiEndpoints: [],
      safety: { allowedHttpMethods: ['GET'], permitMockPayment: false },
    });
  });

  it('allows owners to update safety and returns 403 for unprivileged members', async () => {
    repository.projects.push(projectRecord('project-1', 'org-1'));
    repository.memberships.set('owner:org-1', { role: 'OWNER' });
    repository.memberships.set('member:org-1', { role: 'MEMBER' });
    const safetyInput = {
      domainAllowlist: ['staging.example.com', 'hooks.example.com'],
      allowedHttpMethods: ['GET', 'POST', 'OPTIONS'],
      permitCheckoutSubmission: true,
      permitMockPayment: true,
      permitOrderCreation: false,
      prohibitedActions: ['Never issue refunds.'],
      acknowledgement: true,
    };

    const owner = await request(app)
      .patch('/api/projects/project-1/safety')
      .set('Cookie', accessCookie('owner', 'org-1', 'OWNER'))
      .send(safetyInput);
    expect(owner.status).toBe(200);
    expect(owner.body).toMatchObject({
      domainAllowlist: ['staging.example.com', 'hooks.example.com'],
      allowedHttpMethods: ['GET', 'POST', 'OPTIONS'],
      permitCheckoutSubmission: true,
      prohibitedActions: ['Never issue refunds.'],
    });

    await request(app)
      .patch('/api/projects/project-1/safety')
      .set('Cookie', accessCookie('member', 'org-1', 'MEMBER'))
      .send(safetyInput)
      .expect(403);
  });

  it('normalises allowed host URLs and persists toggles and edited actions', async () => {
    repository.projects.push(projectRecord('project-1', 'org-1'));
    repository.memberships.set('admin:org-1', { role: 'ADMIN' });
    const response = await request(app)
      .patch('/api/projects/project-1/safety')
      .set('Cookie', accessCookie('admin', 'org-1', 'ADMIN'))
      .send({
        domainAllowlist: [
          ' LOCALHOST ',
          'https://Hooks.Example.com/orders?source=test',
          '127.0.0.1',
          '::1',
        ],
        allowedHttpMethods: ['OPTIONS'],
        permitCheckoutSubmission: true,
        permitMockPayment: true,
        permitOrderCreation: true,
        prohibitedActions: ['Never export test data', 'Never send messages'],
        acknowledgement: true,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      domainAllowlist: ['localhost', 'hooks.example.com', '127.0.0.1', '::1'],
      allowedHttpMethods: ['OPTIONS'],
      permitCheckoutSubmission: true,
      permitMockPayment: true,
      permitOrderCreation: true,
      prohibitedActions: ['Never export test data.', 'Never send messages.'],
    });
  });

  it.each([
    { domainAllowlist: [''], reason: 'blank host' },
    { domainAllowlist: ['hooks.example.com/path'], reason: 'raw path' },
    { domainAllowlist: ['ftp://hooks.example.com'], reason: 'unsupported scheme' },
    {
      domainAllowlist: ['hooks.example.com', 'HTTPS://HOOKS.EXAMPLE.COM/path'],
      reason: 'duplicate host',
    },
    { domainAllowlist: ['hooks.example.com'], allowedHttpMethods: [], reason: 'no methods' },
    { domainAllowlist: ['hooks.example.com'], prohibitedActions: [''], reason: 'blank action' },
    {
      domainAllowlist: ['hooks.example.com'],
      prohibitedActions: ['Never pay', ' never pay. '],
      reason: 'duplicate action',
    },
    {
      domainAllowlist: ['hooks.example.com'],
      acknowledgement: false,
      reason: 'missing acknowledgement',
    },
  ])('rejects invalid safety input: $reason', async ({ reason: _reason, ...override }) => {
    repository.projects.push(projectRecord('project-1', 'org-1'));
    repository.memberships.set('owner:org-1', { role: 'OWNER' });
    const response = await request(app)
      .patch('/api/projects/project-1/safety')
      .set('Cookie', accessCookie('owner', 'org-1', 'OWNER'))
      .send({
        allowedHttpMethods: ['GET'],
        permitCheckoutSubmission: false,
        permitMockPayment: false,
        permitOrderCreation: false,
        prohibitedActions: ['Never pay'],
        acknowledgement: true,
        ...override,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  function accessCookie(userId: string, organisationId: string, role: AuthContext['role']) {
    const token = tokens.issueAccessToken({ userId, organisationId, role, tokenVersion: 0 });
    return `taskos_access=${token}`;
  }
});

class MemoryProjectRepository implements ProjectRepository {
  memberships = new Map<string, ProjectMembership>();
  projects: ProjectRecord[] = [];
  created: ProjectMutationRecord | null = null;
  lastListOrganisationId = '';

  async findMembership(userId: string, organisationId: string) {
    return this.memberships.get(`${userId}:${organisationId}`) ?? null;
  }

  async create(input: ProjectMutationRecord) {
    this.created = input;
    const record = recordFromMutation(`project-${this.projects.length + 1}`, input);
    this.projects.push(record);
    return record;
  }

  async list(organisationId: string): Promise<ProjectListRecord[]> {
    this.lastListOrganisationId = organisationId;
    return this.projects.filter((project) => project.organisationId === organisationId);
  }

  async find(organisationId: string, id: string) {
    return (
      this.projects.find(
        (project) => project.organisationId === organisationId && project.id === id,
      ) ?? null
    );
  }

  async update(input: ProjectMutationRecord) {
    const index = this.projects.findIndex(
      (project) =>
        project.organisationId === input.organisationId && project.id === input.projectId,
    );
    if (index < 0) return null;
    const current = this.projects[index]!;
    const updated = recordFromMutation(input.projectId, input);
    if (!input.credentialReferences) updated.secrets = current.secrets;
    this.projects[index] = updated;
    return updated;
  }

  async updateSafety(input: {
    organisationId: string;
    projectId: string;
    configuration: ProjectMutationRecord['configuration'];
    domainAllowlist: string[];
    blockedActions: string[];
  }) {
    const project = await this.find(input.organisationId, input.projectId);
    if (!project) return null;
    project.safetyPolicies[0] = {
      ...project.safetyPolicies[0]!,
      configuration: input.configuration,
      domainAllowlist: input.domainAllowlist,
      blockedActions: input.blockedActions,
      updatedAt: new Date(),
    };
    return project;
  }
}

function projectRecord(id: string, organisationId: string): ProjectRecord {
  return recordFromMutation(id, {
    organisationId,
    projectId: id,
    name: `Project ${id}`,
    description: 'A safe test project',
    repositoryUrl: 'https://github.com/taskos/example',
    configuration: {
      version: 1,
      applicationUrl: 'https://staging.example.com',
      apiEndpoints: [],
      webhookEndpoints: [],
      allowedHttpMethods: ['GET'],
      permitCheckoutSubmission: false,
      permitMockPayment: false,
      permitOrderCreation: false,
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
    },
    domainAllowlist: ['staging.example.com'],
    blockedActions: ['Never access production.'],
    credentialReferences: [],
  });
}

function recordFromMutation(id: string, input: ProjectMutationRecord): ProjectRecord {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    organisationId: input.organisationId,
    name: input.name,
    description: input.description,
    repositoryUrl: input.repositoryUrl,
    createdAt: now,
    updatedAt: now,
    organisation: {
      id: input.organisationId,
      name: `Organisation ${input.organisationId}`,
      slug: input.organisationId,
    },
    secrets: (input.credentialReferences ?? []).map((credential, index) => ({
      id: `secret-${index + 1}`,
      name: credential.label,
      provider: credential.reference.startsWith('vault://') ? 'vault' : 'reference',
      externalReference: credential.reference,
    })),
    safetyPolicies: [
      {
        id: `safety-${id}`,
        domainAllowlist: input.domainAllowlist,
        blockedActions: input.blockedActions,
        configuration: input.configuration,
        updatedAt: now,
      },
    ],
  };
}
