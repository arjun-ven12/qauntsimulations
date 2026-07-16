import type { DatabaseClient, Prisma } from '@taskos/database';
import type { AuthUserRecord } from './auth.types.js';

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createAccount(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    organisationName: string;
    slug: string;
  }): Promise<{ user: AuthUserRecord; organisation: { id: string; name: string; slug: string } }>;
  findPrimaryMembership(userId: string): Promise<{
    id: string;
    organisation: { id: string; name: string; slug: string };
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  } | null>;
  findMembership(
    userId: string,
    organisationId: string,
  ): Promise<{
    id: string;
    organisation: { id: string; name: string; slug: string };
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  } | null>;
  listMemberships(userId: string): Promise<
    Array<{
      id: string;
      organisation: { id: string; name: string; slug: string };
      role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
    }>
  >;
  storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  findActiveRefreshToken(tokenHash: string): Promise<{ userId: string } | null>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly database: DatabaseClient) {}
  findUserByEmail(email: string) {
    return this.database.user.findFirst({ where: { email, deletedAt: null } });
  }
  findUserById(id: string) {
    return this.database.user.findFirst({ where: { id, deletedAt: null } });
  }
  async createAccount(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    organisationName: string;
    slug: string;
  }) {
    return this.database.$transaction(async (transaction: Prisma.TransactionClient) => {
      const user = await transaction.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
        },
      });
      const organisation = await transaction.organisation.create({
        data: {
          name: input.organisationName,
          slug: input.slug,
          members: { create: { userId: user.id, role: 'OWNER' } },
        },
      });
      return { user, organisation };
    });
  }
  async findPrimaryMembership(userId: string) {
    return this.database.organisationMember.findFirst({
      where: { userId, user: { deletedAt: null }, organisation: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        organisation: { select: { id: true, name: true, slug: true } },
      },
    });
  }
  async findMembership(userId: string, organisationId: string) {
    return this.database.organisationMember.findFirst({
      where: {
        organisationId,
        userId,
        user: { deletedAt: null },
        organisation: { deletedAt: null },
      },
      select: {
        id: true,
        role: true,
        organisation: { select: { id: true, name: true, slug: true } },
      },
    });
  }
  listMemberships(userId: string) {
    return this.database.organisationMember.findMany({
      where: { userId, user: { deletedAt: null }, organisation: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        organisation: { select: { id: true, name: true, slug: true } },
      },
    });
  }
  async storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  }
  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.database.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  findActiveRefreshToken(tokenHash: string) {
    return this.database.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { userId: true },
    });
  }
}
