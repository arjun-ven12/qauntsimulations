import { createHash } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { userRoleSchema, type UserRole } from '@taskos/shared-types';
import type { JwtPayload } from './auth.types.js';

export interface TokenSubject {
  userId: string;
  organisationId?: string;
  role: UserRole;
  tokenVersion: number;
}
export interface AuthTokenService {
  issueAccessToken(subject: TokenSubject): string;
  issueRefreshToken(subject: TokenSubject): string;
  verifyAccessToken(token: string): JwtPayload;
  verifyRefreshToken(token: string): JwtPayload;
  hashToken(token: string): string;
}
export interface JwtTokenConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

export class JwtAuthTokenService implements AuthTokenService {
  constructor(private readonly config: JwtTokenConfig) {}
  issueAccessToken(subject: TokenSubject): string {
    return this.issue(subject, this.config.accessSecret, this.config.accessExpiresIn, 'access');
  }
  issueRefreshToken(subject: TokenSubject): string {
    return this.issue(subject, this.config.refreshSecret, this.config.refreshExpiresIn, 'refresh');
  }
  verifyAccessToken(token: string): JwtPayload {
    return this.verify(token, this.config.accessSecret, 'access');
  }
  verifyRefreshToken(token: string): JwtPayload {
    return this.verify(token, this.config.refreshSecret, 'refresh');
  }
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private issue(
    subject: TokenSubject,
    secret: string,
    expiresIn: string,
    audience: string,
  ): string {
    return jwt.sign(
      {
        userId: subject.userId,
        organisationId: subject.organisationId,
        role: subject.role,
        tokenVersion: subject.tokenVersion,
      },
      secret,
      {
        algorithm: 'HS256',
        expiresIn: expiresIn as NonNullable<SignOptions['expiresIn']>,
        audience,
        issuer: 'taskos-worldlab',
      },
    );
  }
  private verify(token: string, secret: string, audience: string): JwtPayload {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience,
      issuer: 'taskos-worldlab',
    });
    const role = typeof payload === 'string' ? null : userRoleSchema.safeParse(payload.role);
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      payload.userId.length === 0 ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      typeof payload.tokenVersion !== 'number' ||
      !Number.isInteger(payload.tokenVersion) ||
      !role?.success
    )
      throw new Error('Invalid token payload');
    return {
      userId: payload.userId,
      organisationId:
        typeof payload.organisationId === 'string' ? payload.organisationId : undefined,
      role: role.data,
      tokenVersion: payload.tokenVersion,
      issuedAt: payload.iat,
      expiry: payload.exp,
    };
  }
}
