import type { DatabaseClient, Prisma, UserRole } from '@taskos/database';
import type {
  InvitationAcceptanceResult,
  InvitationMemberRecord,
  InvitationRecord,
} from './invitation.types.js';

const invitationSelect = {
  id: true,
  organisationId: true,
  email: true,
  role: true,
  tokenHash: true,
  status: true,
  expiresAt: true,
  acceptedAt: true,
  declinedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  organisation: { select: { id: true, name: true, slug: true } },
  invitedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.OrganisationInvitationSelect;

export interface InvitationRepository {
  findActorMembership(userId: string, organisationId: string): Promise<{ role: UserRole } | null>;
  findUser(userId: string): Promise<{ id: string; email: string } | null>;
  findMemberByEmail(organisationId: string, email: string): Promise<{ id: string } | null>;
  createPending(input: {
    organisationId: string;
    email: string;
    role: UserRole;
    invitedByUserId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<InvitationRecord | null>;
  expirePending(now: Date): Promise<void>;
  listForOrganisation(organisationId: string): Promise<InvitationRecord[]>;
  listForRecipient(email: string): Promise<InvitationRecord[]>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  findForRecipient(invitationId: string, email: string): Promise<InvitationRecord | null>;
  revoke(organisationId: string, invitationId: string, now: Date): Promise<InvitationRecord | null>;
  decline(email: string, invitationId: string, now: Date): Promise<InvitationRecord | null>;
  accept(input: {
    tokenHash: string;
    userId: string;
    email: string;
    now: Date;
  }): Promise<InvitationAcceptanceResult>;
}

export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly database: DatabaseClient) {}

  findActorMembership(userId: string, organisationId: string) {
    return this.database.organisationMember.findFirst({
      where: {
        userId,
        organisationId,
        user: { deletedAt: null },
        organisation: { deletedAt: null },
      },
      select: { role: true },
    });
  }

  findUser(userId: string) {
    return this.database.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true },
    });
  }

  findMemberByEmail(organisationId: string, email: string) {
    return this.database.organisationMember.findFirst({
      where: { organisationId, user: { email, deletedAt: null } },
      select: { id: true },
    });
  }

  createPending(input: {
    organisationId: string;
    email: string;
    role: UserRole;
    invitedByUserId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.database.$transaction(
      async (transaction) => {
        const existing = await transaction.organisationInvitation.findFirst({
          where: {
            organisationId: input.organisationId,
            email: input.email,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (existing) return null;
        return transaction.organisationInvitation.create({
          data: input,
          select: invitationSelect,
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async expirePending(now: Date) {
    await this.database.organisationInvitation.updateMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
  }

  listForOrganisation(organisationId: string) {
    return this.database.organisationInvitation.findMany({
      where: { organisationId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: invitationSelect,
    });
  }

  listForRecipient(email: string) {
    return this.database.organisationInvitation.findMany({
      where: { email },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: invitationSelect,
    });
  }

  findByTokenHash(tokenHash: string) {
    return this.database.organisationInvitation.findUnique({
      where: { tokenHash },
      select: invitationSelect,
    });
  }

  findForRecipient(invitationId: string, email: string) {
    return this.database.organisationInvitation.findFirst({
      where: { id: invitationId, email },
      select: invitationSelect,
    });
  }

  async revoke(organisationId: string, invitationId: string, now: Date) {
    const updated = await this.database.organisationInvitation.updateMany({
      where: { id: invitationId, organisationId, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: 'REVOKED', revokedAt: now },
    });
    return updated.count
      ? this.database.organisationInvitation.findUnique({
          where: { id: invitationId },
          select: invitationSelect,
        })
      : null;
  }

  async decline(email: string, invitationId: string, now: Date) {
    const updated = await this.database.organisationInvitation.updateMany({
      where: { id: invitationId, email, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: 'DECLINED', declinedAt: now },
    });
    return updated.count
      ? this.database.organisationInvitation.findUnique({
          where: { id: invitationId },
          select: invitationSelect,
        })
      : null;
  }

  accept(input: {
    tokenHash: string;
    userId: string;
    email: string;
    now: Date;
  }): Promise<InvitationAcceptanceResult> {
    return this.database.$transaction(
      async (transaction) => {
        const invitation = await transaction.organisationInvitation.findUnique({
          where: { tokenHash: input.tokenHash },
          select: invitationSelect,
        });
        if (!invitation) return { outcome: 'INVALID' };
        if (invitation.email !== input.email) return { outcome: 'EMAIL_MISMATCH' };
        const membership = await transaction.organisationMember.findUnique({
          where: {
            organisationId_userId: {
              organisationId: invitation.organisationId,
              userId: input.userId,
            },
          },
          select: {
            id: true,
            role: true,
            organisation: { select: { id: true, name: true, slug: true } },
          },
        });
        if (invitation.status === 'ACCEPTED') {
          return { outcome: 'ALREADY_ACCEPTED', invitation, membership };
        }
        if (invitation.status === 'REVOKED') return { outcome: 'REVOKED' };
        if (invitation.status === 'DECLINED') return { outcome: 'DECLINED' };
        if (invitation.status === 'EXPIRED' || invitation.expiresAt <= input.now) {
          await transaction.organisationInvitation.updateMany({
            where: { id: invitation.id, status: 'PENDING' },
            data: { status: 'EXPIRED' },
          });
          return { outcome: 'EXPIRED' };
        }
        if (membership) return { outcome: 'MEMBER_EXISTS' };
        const claimed = await transaction.organisationInvitation.updateMany({
          where: { id: invitation.id, status: 'PENDING', expiresAt: { gt: input.now } },
          data: { status: 'ACCEPTED', acceptedAt: input.now },
        });
        if (claimed.count !== 1) return { outcome: 'INVALID' };
        const created = await transaction.organisationMember.create({
          data: {
            organisationId: invitation.organisationId,
            userId: input.userId,
            role: invitation.role,
          },
          select: {
            id: true,
            role: true,
            organisation: { select: { id: true, name: true, slug: true } },
          },
        });
        return {
          outcome: 'ACCEPTED',
          invitation: { ...invitation, status: 'ACCEPTED', acceptedAt: input.now },
          membership: created as InvitationMemberRecord,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
