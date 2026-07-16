import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../../core/middleware/error-handler.js';
import { JwtAuthTokenService } from '../auth-token.service.js';
import { AuthController } from '../auth.controller.js';
import type { AuthRepository } from '../auth.repository.js';
import { createAuthRouter } from '../auth.routes.js';
import { AuthService } from '../auth.service.js';
import type { AuthUserRecord } from '../auth.types.js';
import { BcryptPasswordHasher } from '../password-hasher.js';

const validRegistration = {
  email: '  OWNER@Example.com ',
  password: 'correct horse battery staple',
  displayName: '  Test Owner  ',
  organisationName: '  World Lab  ',
};

describe('authentication HTTP contract', () => {
  let repository: MemoryAuthRepository;
  let tokens: JwtAuthTokenService;
  let app: express.Express;

  beforeEach(() => {
    repository = new MemoryAuthRepository();
    tokens = tokenService();
    const service = new AuthService(repository, new BcryptPasswordHasher(10), tokens);
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', createAuthRouter(new AuthController(service, { secure: false }), tokens));
    app.use(errorHandler);
  });

  it('registers an owner with normalized safe data, a bcrypt hash, and scoped cookies', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        ...validRegistration,
        role: 'ADMIN',
        tokenVersion: 999,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      user: { email: 'owner@example.com', displayName: 'Test Owner' },
      organisation: { name: 'World Lab', role: 'OWNER' },
      permissions: [
        'VIEW_ORGANISATION',
        'VIEW_MEMBERS',
        'MANAGE_MEMBERS',
        'VIEW_PROJECTS',
        'CREATE_PROJECTS',
        'EDIT_PROJECTS',
        'MANAGE_PROJECT_SAFETY',
      ],
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|token/i);
    expect(repository.users[0]?.passwordHash).not.toBe(validRegistration.password);
    await expect(
      new BcryptPasswordHasher(10).verify(
        validRegistration.password,
        repository.users[0]!.passwordHash,
      ),
    ).resolves.toBe(true);
    expect(repository.refreshTokens[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^taskos_access=.*HttpOnly.*SameSite=Lax/i),
        expect.stringMatching(/^taskos_refresh=.*Path=\/api\/auth.*HttpOnly.*SameSite=Lax/i),
      ]),
    );
    expect(cookies.join(';')).not.toContain('Secure');
  });

  it('rejects malformed registration and duplicate emails without exposing internals', async () => {
    const invalid = await request(app)
      .post('/api/auth/register')
      .send({
        ...validRegistration,
        email: 'not-an-email',
        password: 'short',
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    await request(app).post('/api/auth/register').send(validRegistration).expect(201);
    const duplicate = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegistration, email: 'owner@example.com' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      error: expect.objectContaining({ code: 'EMAIL_REGISTERED' }),
    });
  });

  it('logs in valid users and returns the same generic error for unknown and wrong credentials', async () => {
    await request(app).post('/api/auth/register').send(validRegistration).expect(201);

    const login = await request(app).post('/api/auth/login').send({
      email: ' OWNER@example.com ',
      password: validRegistration.password,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe('owner@example.com');

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'the wrong password' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'the wrong password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect',
    });
    expect(unknown.body.error).toMatchObject(wrong.body.error);

    const malformed = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('protects me and returns only the safe current session', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(validRegistration).expect(201);
    const response = await agent.get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      user: { email: 'owner@example.com' },
      organisation: { role: 'OWNER' },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|refreshToken|accessToken/i);
  });

  it('rejects invalid, expired, deleted-user, and stale-version access tokens', async () => {
    const invalid = await request(app).get('/api/auth/me').set('Cookie', 'taskos_access=not-a-jwt');
    expect(invalid.status).toBe(401);

    const expiredTokens = tokenService('-1s');
    const expired = expiredTokens.issueAccessToken({
      userId: 'missing',
      organisationId: 'org-1',
      role: 'OWNER',
      tokenVersion: 0,
    });
    await request(app).get('/api/auth/me').set('Cookie', `taskos_access=${expired}`).expect(401);

    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(validRegistration).expect(201);
    repository.users[0]!.tokenVersion += 1;
    await agent.get('/api/auth/me').expect(401);

    repository.users.length = 0;
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects invalid refresh tokens instead of surfacing an internal error', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'taskos_refresh=invalid');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('revokes the refresh token and clears both cookies on idempotent logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(validRegistration).expect(201);
    const first = await agent.post('/api/auth/logout');
    expect(first.status).toBe(204);
    expect(repository.refreshTokens[0]?.revokedAt).toBeInstanceOf(Date);
    const cookies = (first.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toContain('taskos_access=; Path=/');
    expect(cookies).toContain('taskos_refresh=; Path=/api/auth');
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('returns all memberships and securely switches the active organisation in both cookies', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(validRegistration).expect(201);
    const user = repository.users[0]!;
    repository.memberships.push({
      id: 'membership-2',
      userId: user.id,
      organisation: { id: 'org-2', name: 'Second World', slug: 'second-world' },
      role: 'MEMBER',
    });

    const before = await agent.get('/api/auth/me').expect(200);
    expect(before.body.memberships).toHaveLength(2);
    expect(before.body.organisation.id).toBe('org-1');

    const switched = await agent
      .post('/api/auth/switch-organisation')
      .send({ organisationId: 'org-2' })
      .expect(200);
    expect(switched.body).toMatchObject({
      organisation: { id: 'org-2', role: 'MEMBER' },
      membership: { id: 'membership-2', role: 'MEMBER' },
      permissions: [
        'VIEW_ORGANISATION',
        'VIEW_MEMBERS',
        'VIEW_PROJECTS',
        'CREATE_PROJECTS',
        'EDIT_PROJECTS',
      ],
    });
    expect((switched.headers['set-cookie'] as unknown as string[]).join(';')).toContain(
      'taskos_refresh=',
    );
    await agent
      .get('/api/auth/me')
      .expect(200)
      .expect((response) => {
        expect(response.body.organisation.id).toBe('org-2');
      });

    await agent
      .post('/api/auth/switch-organisation')
      .send({ organisationId: 'org-unrelated' })
      .expect(403);
  });
});

function tokenService(accessExpiresIn = '15m') {
  return new JwtAuthTokenService({
    accessSecret: 'a'.repeat(48),
    refreshSecret: 'b'.repeat(48),
    accessExpiresIn,
    refreshExpiresIn: '7d',
  });
}

class MemoryAuthRepository implements AuthRepository {
  users: AuthUserRecord[] = [];
  memberships: Array<{
    id: string;
    userId: string;
    organisation: { id: string; name: string; slug: string };
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  }> = [];
  refreshTokens: Array<{
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt?: Date;
  }> = [];

  async findUserByEmail(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findUserById(id: string) {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async createAccount(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    organisationName: string;
    slug: string;
  }) {
    const now = new Date();
    const user: AuthUserRecord = {
      id: `user-${this.users.length + 1}`,
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    const organisation = {
      id: `org-${this.memberships.length + 1}`,
      name: input.organisationName,
      slug: input.slug,
    };
    this.users.push(user);
    this.memberships.push({
      id: `membership-${this.memberships.length + 1}`,
      userId: user.id,
      organisation,
      role: 'OWNER',
    });
    return { user, organisation };
  }

  async findPrimaryMembership(userId: string) {
    const membership = this.memberships.find((candidate) => candidate.userId === userId);
    return membership
      ? { id: membership.id, organisation: membership.organisation, role: membership.role }
      : null;
  }

  async findMembership(userId: string, organisationId: string) {
    const membership = this.memberships.find(
      (candidate) => candidate.userId === userId && candidate.organisation.id === organisationId,
    );
    return membership
      ? { id: membership.id, organisation: membership.organisation, role: membership.role }
      : null;
  }

  async listMemberships(userId: string) {
    return this.memberships
      .filter((membership) => membership.userId === userId)
      .map(({ id, organisation, role }) => ({ id, organisation, role }));
  }

  async storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    this.refreshTokens.push({ userId, tokenHash, expiresAt });
  }

  async revokeRefreshToken(tokenHash: string) {
    const active = this.refreshTokens.find(
      (token) => token.tokenHash === tokenHash && !token.revokedAt,
    );
    if (active) active.revokedAt = new Date();
  }

  async findActiveRefreshToken(tokenHash: string) {
    const token = this.refreshTokens.find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        !candidate.revokedAt &&
        candidate.expiresAt > new Date(),
    );
    return token ? { userId: token.userId } : null;
  }
}
