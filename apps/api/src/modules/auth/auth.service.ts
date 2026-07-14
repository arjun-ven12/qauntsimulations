import type { UserRole } from '@taskos/shared-types';
import { EmailAlreadyRegisteredError, InvalidCredentialsError } from './auth.errors.js';
import type { AuthRepository } from './auth.repository.js';
import type { AuthTokenService } from './auth-token.service.js';
import type { PasswordHasher } from './password-hasher.js';
import type { AuthSession } from './auth.types.js';

export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly passwordHasher: PasswordHasher, private readonly tokens: AuthTokenService) {}
  async register(input: { email: string; password: string; displayName: string; organisationName: string }): Promise<AuthSession> {
    if (await this.repository.findUserByEmail(input.email)) throw new EmailAlreadyRegisteredError();
    const slug = `${input.organisationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomUUID().slice(0, 6)}`;
    const account = await this.repository.createAccount({ email: input.email, displayName: input.displayName, passwordHash: await this.passwordHasher.hash(input.password), organisationName: input.organisationName, slug });
    return this.createSession(account.user, account.organisation, 'OWNER');
  }
  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const user = await this.repository.findUserByEmail(input.email);
    if (!user || !(await this.passwordHasher.verify(input.password, user.passwordHash))) throw new InvalidCredentialsError();
    const membership = await this.repository.findPrimaryMembership(user.id);
    if (!membership) throw new InvalidCredentialsError();
    return this.createSession(user, membership.organisation, membership.role);
  }
  async refresh(refreshToken: string): Promise<AuthSession> {
    const payload = this.tokens.verifyRefreshToken(refreshToken);
    const active = await this.repository.findActiveRefreshToken(this.tokens.hashToken(refreshToken));
    const user = active ? await this.repository.findUserById(active.userId) : null;
    const membership = user ? await this.repository.findPrimaryMembership(user.id) : null;
    if (!user || !membership || payload.tokenVersion !== user.tokenVersion) throw new InvalidCredentialsError();
    await this.repository.revokeRefreshToken(this.tokens.hashToken(refreshToken));
    return this.createSession(user, membership.organisation, membership.role);
  }
  logout(refreshToken?: string): Promise<void> { return refreshToken ? this.repository.revokeRefreshToken(this.tokens.hashToken(refreshToken)) : Promise.resolve(); }
  async me(userId: string): Promise<Omit<AuthSession, 'accessToken' | 'refreshToken'>> {
    const user = await this.repository.findUserById(userId); const membership = user ? await this.repository.findPrimaryMembership(user.id) : null;
    if (!user || !membership) throw new InvalidCredentialsError();
    return { user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() }, organisation: { ...membership.organisation, role: membership.role } };
  }
  private async createSession(user: { id: string; email: string; displayName: string; tokenVersion: number; createdAt: Date; updatedAt: Date }, organisation: { id: string; name: string; slug: string }, role: UserRole): Promise<AuthSession> {
    const subject = { userId: user.id, organisationId: organisation.id, role, tokenVersion: user.tokenVersion };
    const accessToken = this.tokens.issueAccessToken(subject); const refreshToken = this.tokens.issueRefreshToken(subject);
    const decoded = this.tokens.verifyRefreshToken(refreshToken);
    await this.repository.storeRefreshToken(user.id, this.tokens.hashToken(refreshToken), new Date(decoded.expiry * 1000));
    return { user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() }, organisation: { ...organisation, role }, accessToken, refreshToken };
  }
}
