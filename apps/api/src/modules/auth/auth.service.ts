import type { UserRole } from '@taskos/shared-types';
import { permissionsForRole } from '../organisations/organisation.permissions.js';
import { EmailAlreadyRegisteredError, InvalidCredentialsError } from './auth.errors.js';
import type { AuthRepository } from './auth.repository.js';
import type { AuthTokenService } from './auth-token.service.js';
import type { AuthContext, AuthSession, PublicAuthSession } from './auth.types.js';
import type { PasswordHasher } from './password-hasher.js';

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: AuthTokenService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName: string;
    organisationName: string;
  }): Promise<AuthSession> {
    const email = normaliseEmail(input.email);
    if (await this.repository.findUserByEmail(email)) throw new EmailAlreadyRegisteredError();
    const organisationName = input.organisationName.trim();
    const slug = `${organisationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${crypto.randomUUID().slice(0, 6)}`;
    let account: Awaited<ReturnType<AuthRepository['createAccount']>>;
    try {
      account = await this.repository.createAccount({
        email,
        displayName: input.displayName.trim(),
        passwordHash: await this.passwordHasher.hash(input.password),
        organisationName,
        slug,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new EmailAlreadyRegisteredError();
      throw error;
    }
    return this.createSession(account.user, account.organisation, 'OWNER');
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const user = await this.repository.findUserByEmail(normaliseEmail(input.email));
    let passwordMatches = false;
    if (user) {
      try {
        passwordMatches = await this.passwordHasher.verify(input.password, user.passwordHash);
      } catch {
        passwordMatches = false;
      }
    }
    if (!user || !passwordMatches) throw new InvalidCredentialsError();
    const membership = await this.repository.findPrimaryMembership(user.id);
    if (!membership) throw new InvalidCredentialsError();
    return this.createSession(user, membership.organisation, membership.role);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    try {
      const payload = this.tokens.verifyRefreshToken(refreshToken);
      const active = await this.repository.findActiveRefreshToken(
        this.tokens.hashToken(refreshToken),
      );
      const user = active ? await this.repository.findUserById(active.userId) : null;
      const membership =
        user && payload.organisationId
          ? await this.repository.findMembership(user.id, payload.organisationId)
          : user
            ? await this.repository.findPrimaryMembership(user.id)
            : null;
      if (!user || !membership || payload.tokenVersion !== user.tokenVersion) {
        throw new InvalidCredentialsError();
      }
      await this.repository.revokeRefreshToken(this.tokens.hashToken(refreshToken));
      return this.createSession(user, membership.organisation, membership.role);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) throw error;
      throw new InvalidCredentialsError();
    }
  }

  logout(refreshToken?: string): Promise<void> {
    return refreshToken
      ? this.repository.revokeRefreshToken(this.tokens.hashToken(refreshToken))
      : Promise.resolve();
  }

  async me(context: AuthContext): Promise<PublicAuthSession> {
    const user = await this.repository.findUserById(context.userId);
    const membership =
      user && context.organisationId
        ? await this.repository.findMembership(user.id, context.organisationId)
        : null;
    if (
      !user ||
      !membership ||
      context.tokenVersion !== user.tokenVersion ||
      membership.role !== context.role
    ) {
      throw new InvalidCredentialsError();
    }
    return {
      user: publicUser(user),
      organisation: { ...membership.organisation, role: membership.role },
      permissions: permissionsForRole(membership.role),
    };
  }

  private async createSession(
    user: {
      id: string;
      email: string;
      displayName: string;
      tokenVersion: number;
      createdAt: Date;
      updatedAt: Date;
    },
    organisation: { id: string; name: string; slug: string },
    role: UserRole,
  ): Promise<AuthSession> {
    const subject = {
      userId: user.id,
      organisationId: organisation.id,
      role,
      tokenVersion: user.tokenVersion,
    };
    const accessToken = this.tokens.issueAccessToken(subject);
    const refreshToken = this.tokens.issueRefreshToken(subject);
    const accessPayload = this.tokens.verifyAccessToken(accessToken);
    const refreshPayload = this.tokens.verifyRefreshToken(refreshToken);
    await this.repository.storeRefreshToken(
      user.id,
      this.tokens.hashToken(refreshToken),
      new Date(refreshPayload.expiry * 1000),
    );
    return {
      user: publicUser(user),
      organisation: { ...organisation, role },
      permissions: permissionsForRole(role),
      accessToken,
      refreshToken,
      accessTokenExpiresAt: accessPayload.expiry * 1000,
      refreshTokenExpiresAt: refreshPayload.expiry * 1000,
    };
  }
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function publicUser(user: {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
