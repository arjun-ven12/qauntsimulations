import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { requireAuth } from '../../auth/auth.middleware.js';
import { JwtAuthTokenService } from '../../auth/auth-token.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { OrganisationController } from '../organisation.controller.js';
import type { OrganisationRepository } from '../organisation.repository.js';
import { createOrganisationRouter } from '../organisation.routes.js';
import { OrganisationService } from '../organisation.service.js';

describe('organisation membership HTTP contract', () => {
  let repository: OrganisationRepository;
  let tokens: JwtAuthTokenService;
  let app: express.Express;

  beforeEach(() => {
    repository = repositoryStub();
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
      '/api/organisations',
      requireAuth(tokens),
      createOrganisationRouter(new OrganisationController(new OrganisationService(repository))),
    );
    app.use(errorHandler);
  });

  it('requires authentication for membership mutations', async () => {
    await request(app)
      .post('/api/organisations/current/members')
      .send({ email: 'new@example.com', role: 'MEMBER' })
      .expect(401);
  });

  it('adds an existing registered user and returns only the public member DTO', async () => {
    const response = await request(app)
      .post('/api/organisations/current/members')
      .set('Cookie', accessCookie('owner', 'OWNER'))
      .send({ email: ' NEW@EXAMPLE.COM ', role: 'MEMBER' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 'membership-new',
      role: 'MEMBER',
      user: { id: 'user-new', email: 'new@example.com', displayName: 'New User' },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|token|hash/i);
  });

  it.each([
    { email: 'not-an-email', role: 'MEMBER' },
    { email: 'new@example.com', role: 'SUPER_ADMIN' },
    { email: 'new@example.com', role: 'MEMBER', organisationId: 'org-2' },
  ])('rejects invalid and over-posted add-member input', async (payload) => {
    const response = await request(app)
      .post('/api/organisations/current/members')
      .set('Cookie', accessCookie('owner', 'OWNER'))
      .send(payload);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for a Member mutation and does not call the write repository', async () => {
    vi.mocked(repository.findMembership).mockResolvedValueOnce({
      id: 'membership-member',
      role: 'MEMBER',
      createdAt: new Date(),
      organisation: { id: 'org-1', name: 'World Lab', slug: 'world-lab' },
    });
    await request(app)
      .post('/api/organisations/current/members')
      .set('Cookie', accessCookie('member', 'MEMBER'))
      .send({ email: 'new@example.com', role: 'MEMBER' })
      .expect(403);
    expect(repository.createMember).not.toHaveBeenCalled();
  });

  it('conceals a cross-organisation target and protects the last Owner', async () => {
    vi.mocked(repository.findMember).mockResolvedValueOnce(null);
    await request(app)
      .patch('/api/organisations/current/members/member-in-org-2')
      .set('Cookie', accessCookie('owner', 'OWNER'))
      .send({ role: 'MEMBER' })
      .expect(404);

    vi.mocked(repository.findMember).mockResolvedValueOnce({
      id: 'membership-owner',
      role: 'OWNER',
      createdAt: new Date(),
      user: { id: 'owner', displayName: 'Owner', email: 'owner@example.com' },
    });
    vi.mocked(repository.countOwners).mockResolvedValueOnce(1);
    const response = await request(app)
      .delete('/api/organisations/current/members/membership-owner')
      .set('Cookie', accessCookie('owner', 'OWNER'));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LAST_OWNER_REQUIRED');
    expect(repository.deleteMember).not.toHaveBeenCalled();
  });

  function accessCookie(userId: string, role: AuthContext['role']) {
    return `taskos_access=${tokens.issueAccessToken({ userId, organisationId: 'org-1', role, tokenVersion: 0 })}`;
  }
});

function repositoryStub(): OrganisationRepository {
  return {
    findMembership: vi.fn().mockResolvedValue({
      id: 'membership-owner',
      role: 'OWNER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      organisation: { id: 'org-1', name: 'World Lab', slug: 'world-lab' },
    }),
    listMembers: vi.fn().mockResolvedValue([]),
    findUserByEmail: vi.fn().mockResolvedValue({
      id: 'user-new',
      displayName: 'New User',
      email: 'new@example.com',
    }),
    findMember: vi.fn().mockResolvedValue(null),
    findMemberByUser: vi.fn().mockResolvedValue(null),
    countOwners: vi.fn().mockResolvedValue(1),
    createMember: vi.fn().mockResolvedValue({
      id: 'membership-new',
      role: 'MEMBER',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      user: { id: 'user-new', displayName: 'New User', email: 'new@example.com' },
    }),
    updateMemberRole: vi.fn().mockResolvedValue(null),
    deleteMember: vi.fn().mockResolvedValue(false),
  };
}
