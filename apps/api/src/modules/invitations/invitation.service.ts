import { createHash, randomBytes } from 'node:crypto';
import type { UserRole } from '@taskos/shared-types';
import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission } from '../organisations/organisation.permissions.js';
import type { InvitationRepository } from './invitation.repository.js';
import type { InvitationRecord } from './invitation.types.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export class InvitationService {
  constructor(
    private readonly repository: InvitationRepository,
    private readonly webUrl: string,
  ) {}

  async create(context: AuthContext, input: { email: string; role: UserRole }) {
    const organisationId = requireOrganisation(context);
    const actor = await this.repository.findActorMembership(context.userId, organisationId);
    if (!actor || !hasOrganisationPermission(actor.role, 'MANAGE_MEMBERS')) throw forbidden();
    assertInviteRole(actor.role, input.role);
    const actorUser = await this.repository.findUser(context.userId);
    if (!actorUser) throw forbidden();
    if (actorUser.email === input.email) {
      throw new ApplicationError('SELF_INVITATION', 'You cannot invite your own account', 409);
    }
    if (await this.repository.findMemberByEmail(organisationId, input.email)) {
      throw new ApplicationError('MEMBERSHIP_CONFLICT', 'That user is already a member', 409);
    }
    const rawToken = randomBytes(32).toString('base64url');
    let invitation: InvitationRecord | null;
    try {
      invitation = await this.repository.createPending({
        organisationId,
        email: input.email,
        role: input.role,
        invitedByUserId: context.userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      });
    } catch (error) {
      if (isTransactionConflict(error)) invitation = null;
      else throw error;
    }
    if (!invitation) {
      throw new ApplicationError(
        'INVITATION_CONFLICT',
        'A pending invitation already exists for that email',
        409,
      );
    }
    return {
      invitation: managerDto(invitation),
      invitationUrl: `${this.webUrl.replace(/\/$/, '')}/invitations/accept?token=${encodeURIComponent(rawToken)}`,
      delivery: {
        method: 'LINK_ONLY' as const,
        message:
          'External email delivery is not configured. Share this secure invitation link with the recipient.',
      },
    };
  }

  async listForOrganisation(context: AuthContext) {
    const organisationId = requireOrganisation(context);
    const actor = await this.repository.findActorMembership(context.userId, organisationId);
    if (!actor || !hasOrganisationPermission(actor.role, 'MANAGE_MEMBERS')) throw forbidden();
    await this.repository.expirePending(new Date());
    return (await this.repository.listForOrganisation(organisationId)).map(managerDto);
  }

  async revoke(context: AuthContext, invitationId: string) {
    const organisationId = requireOrganisation(context);
    const actor = await this.repository.findActorMembership(context.userId, organisationId);
    if (!actor || !hasOrganisationPermission(actor.role, 'MANAGE_MEMBERS')) throw forbidden();
    const invitation = await this.repository.revoke(organisationId, invitationId, new Date());
    if (!invitation) throw invitationNotFound();
    return managerDto(invitation);
  }

  async inbox(context: AuthContext) {
    const user = await this.repository.findUser(context.userId);
    if (!user) throw forbidden();
    await this.repository.expirePending(new Date());
    return (await this.repository.listForRecipient(user.email)).map(recipientDto);
  }

  async preview(rawToken: string) {
    const invitation = await this.repository.findByTokenHash(hashToken(rawToken));
    if (!invitation) return { state: 'INVALID' as const };
    const state =
      invitation.status === 'PENDING' && invitation.expiresAt <= new Date()
        ? ('EXPIRED' as const)
        : invitation.status;
    return {
      invitationId: invitation.id,
      state,
      organisation: { name: invitation.organisation.name },
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      recipient: maskEmail(invitation.email),
    };
  }

  async accept(context: AuthContext, rawToken: string) {
    const user = await this.repository.findUser(context.userId);
    if (!user) throw forbidden();
    return this.completeAcceptance(
      await this.repository.accept({
        tokenHash: hashToken(rawToken),
        userId: user.id,
        email: user.email,
        now: new Date(),
      }),
    );
  }

  async acceptFromInbox(context: AuthContext, invitationId: string) {
    const user = await this.repository.findUser(context.userId);
    if (!user) throw forbidden();
    const invitation = await this.repository.findForRecipient(invitationId, user.email);
    if (!invitation) throw invitationNotFound();
    return this.completeAcceptance(
      await this.repository.accept({
        tokenHash: invitation.tokenHash,
        userId: user.id,
        email: user.email,
        now: new Date(),
      }),
    );
  }

  private completeAcceptance(result: Awaited<ReturnType<InvitationRepository['accept']>>) {
    if (result.outcome === 'EMAIL_MISMATCH') {
      throw new ApplicationError(
        'INVITATION_EMAIL_MISMATCH',
        'This invitation was sent to a different email address',
        403,
      );
    }
    if (result.outcome === 'EXPIRED' || result.outcome === 'REVOKED') {
      throw new ApplicationError(
        `INVITATION_${result.outcome}`,
        'This invitation is no longer active',
        410,
      );
    }
    if (result.outcome === 'DECLINED') {
      throw new ApplicationError('INVITATION_DECLINED', 'This invitation was declined', 409);
    }
    if (result.outcome === 'INVALID') throw invitationNotFound();
    if (result.outcome === 'MEMBER_EXISTS') {
      throw new ApplicationError('MEMBERSHIP_CONFLICT', 'This account is already a member', 409);
    }
    if (result.outcome === 'ALREADY_ACCEPTED') {
      return {
        accepted: true,
        idempotent: true,
        membership: result.membership,
        organisation: result.invitation.organisation,
      };
    }
    if (result.outcome !== 'ACCEPTED') throw invitationNotFound();
    return {
      accepted: true,
      idempotent: false,
      membership: result.membership,
      organisation: result.invitation.organisation,
    };
  }

  async decline(context: AuthContext, invitationId: string) {
    const user = await this.repository.findUser(context.userId);
    if (!user) throw forbidden();
    const invitation = await this.repository.decline(user.email, invitationId, new Date());
    if (!invitation) throw invitationNotFound();
    return recipientDto(invitation);
  }
}

function managerDto(invitation: InvitationRecord) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    inviter: invitation.invitedBy,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    declinedAt: invitation.declinedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    delivery: 'LINK_ONLY' as const,
  };
}

function recipientDto(invitation: InvitationRecord) {
  return {
    id: invitation.id,
    organisation: invitation.organisation,
    role: invitation.role,
    status: invitation.status,
    inviter: invitation.invitedBy,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

function assertInviteRole(actorRole: UserRole, invitedRole: UserRole) {
  const allowed = actorRole === 'OWNER' ? ['ADMIN', 'MEMBER', 'VIEWER'] : ['MEMBER', 'VIEWER'];
  if (!allowed.includes(invitedRole)) {
    throw new ApplicationError(
      'ROLE_ASSIGNMENT_FORBIDDEN',
      'Your role cannot assign the selected invitation role',
      403,
    );
  }
}

function requireOrganisation(context: AuthContext) {
  if (!context.organisationId) throw forbidden();
  return context.organisationId;
}

function hashToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

function maskEmail(email: string) {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, name.length - 1))}@${domain}`;
}

function forbidden() {
  return new ApplicationError('INSUFFICIENT_PERMISSION', 'Invitation permission is required', 403);
}

function invitationNotFound() {
  return new ApplicationError('INVITATION_NOT_FOUND', 'Invitation was not found', 404);
}

function isTransactionConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}
