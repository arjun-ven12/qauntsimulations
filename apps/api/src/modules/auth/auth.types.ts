import type { UserRole } from '@taskos/shared-types';
export interface JwtPayload { userId: string; organisationId: string | undefined; role: UserRole; tokenVersion: number; issuedAt: number; expiry: number }
export interface AuthContext { userId: string; organisationId: string | undefined; role: UserRole; tokenVersion: number }
export interface AuthUserRecord { id: string; email: string; displayName: string; passwordHash: string; tokenVersion: number; createdAt: Date; updatedAt: Date }
export interface AuthSession { user: { id: string; email: string; displayName: string; createdAt: string; updatedAt: string }; organisation: { id: string; name: string; slug: string; role: UserRole }; accessToken: string; refreshToken: string }
