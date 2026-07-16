import type { OrganisationInvitationStatus, UserRole } from '@taskos/database';

export interface InvitationRecord {
  id: string;
  organisationId: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  status: OrganisationInvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  organisation: { id: string; name: string; slug: string };
  invitedBy: { id: string; displayName: string };
}

export interface InvitationMemberRecord {
  id: string;
  role: UserRole;
  organisation: { id: string; name: string; slug: string };
}

export type InvitationAcceptanceResult =
  | { outcome: 'ACCEPTED'; invitation: InvitationRecord; membership: InvitationMemberRecord }
  | {
      outcome: 'ALREADY_ACCEPTED';
      invitation: InvitationRecord;
      membership: InvitationMemberRecord | null;
    }
  | { outcome: 'INVALID' }
  | { outcome: 'EMAIL_MISMATCH' }
  | { outcome: 'EXPIRED' | 'REVOKED' | 'DECLINED' }
  | { outcome: 'MEMBER_EXISTS' };
