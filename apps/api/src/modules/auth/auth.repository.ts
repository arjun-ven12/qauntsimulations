import type { DatabaseClient, Prisma } from '@taskos/database';
import type { AuthUserRecord } from './auth.types.js';

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createAccount(input: { email: string; displayName: string; passwordHash: string; organisationName: string; slug: string }): Promise<{ user: AuthUserRecord; organisation: { id: string; name: string; slug: string } }>;
  findPrimaryMembership(userId: string): Promise<{ organisation: { id: string; name: string; slug: string }; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' } | null>;
  storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  findActiveRefreshToken(tokenHash: string): Promise<{ userId: string } | null>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly database: DatabaseClient) {}
  findUserByEmail(email: string) { return this.database.user.findUnique({ where: { email } }); }
  findUserById(id: string) { return this.database.user.findUnique({ where: { id } }); }
  async createAccount(input: { email: string; displayName: string; passwordHash: string; organisationName: string; slug: string }) {
    return this.database.$transaction(async (transaction: Prisma.TransactionClient) => {
      const user = await transaction.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash: input.passwordHash } });
      const organisation = await transaction.organisation.create({ data: { name: input.organisationName, slug: input.slug, members: { create: { userId: user.id, role: 'OWNER' } } } });
      return { user, organisation };
    });
  }
  async findPrimaryMembership(userId: string) { return this.database.organisationMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { role: true, organisation: { select: { id: true, name: true, slug: true } } } }); }
  async storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> { await this.database.refreshToken.create({ data: { userId, tokenHash, expiresAt } }); }
  async revokeRefreshToken(tokenHash: string): Promise<void> { await this.database.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } }); }
  findActiveRefreshToken(tokenHash: string) { return this.database.refreshToken.findFirst({ where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true } }); }
}
