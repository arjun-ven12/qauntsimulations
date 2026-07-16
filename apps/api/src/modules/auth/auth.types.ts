import type { UserRole } from '@taskos/shared-types';
import type { OrganisationPermission } from '../organisations/organisation.permissions.js';

export interface JwtPayload {
  userId: string;
  organisationId: string | undefined;
  role: UserRole;
  tokenVersion: number;
  issuedAt: number;
  expiry: number;
}

export interface AuthContext {
  userId: string;
  organisationId: string | undefined;
  role: UserRole;
  tokenVersion: number;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicAuthSession {
  user: {
    id: string;
    email: string;
    displayName: string;
    createdAt: string;
    updatedAt: string;
  };
  organisation: { id: string; name: string; slug: string; role: UserRole };
  membership: { id: string; role: UserRole };
  memberships: Array<{
    membershipId: string;
    organisation: { id: string; name: string; slug: string };
    role: UserRole;
  }>;
  permissions: OrganisationPermission[];
}

export interface AuthSession extends PublicAuthSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}
