import type { UserRole } from '@taskos/shared-types';
import type { OrganisationPermission } from './organisation.permissions.js';

export interface OrganisationMembershipRecord {
  id: string;
  role: UserRole;
  createdAt: Date;
  organisation: { id: string; name: string; slug: string };
}

export interface OrganisationMemberRecord {
  id: string;
  role: UserRole;
  createdAt: Date;
  user: { id: string; displayName: string; email: string };
}

export interface OrganisationUserRecord {
  id: string;
  displayName: string;
  email: string;
}

export interface AddOrganisationMemberInput {
  email: string;
  role: UserRole;
}

export interface UpdateOrganisationMemberInput {
  role: UserRole;
}

export interface CurrentOrganisationResponse {
  organisation: { id: string; name: string; slug: string };
  membership: { id: string; role: UserRole; joinedAt: string };
  permissions: OrganisationPermission[];
}

export interface OrganisationMemberResponse {
  id: string;
  role: UserRole;
  joinedAt: string;
  user: { id: string; displayName: string; email: string };
}
