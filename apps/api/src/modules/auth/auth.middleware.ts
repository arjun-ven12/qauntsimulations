import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@taskos/shared-types';
import { ACCESS_COOKIE_NAME } from '../../config/constants.js';
import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthTokenService } from './auth-token.service.js';

function readBearerOrCookie(request: Request): string | undefined {
  const authorization = request.header('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return request.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
}
export function optionalAuth(tokens: AuthTokenService): RequestHandler {
  return (request, _response, next) => {
    const token = readBearerOrCookie(request);
    if (!token) return next();
    try {
      const payload = tokens.verifyAccessToken(token);
      request.auth = {
        userId: payload.userId,
        organisationId: payload.organisationId,
        role: payload.role,
        tokenVersion: payload.tokenVersion,
      };
    } catch {
      /* optional credentials are ignored */
    }
    next();
  };
}
export function requireAuth(tokens: AuthTokenService): RequestHandler {
  return (request, _response, next) => {
    const token = readBearerOrCookie(request);
    if (!token)
      return next(new ApplicationError('AUTH_REQUIRED', 'Authentication is required', 401));
    try {
      const payload = tokens.verifyAccessToken(token);
      request.auth = {
        userId: payload.userId,
        organisationId: payload.organisationId,
        role: payload.role,
        tokenVersion: payload.tokenVersion,
      };
      next();
    } catch {
      next(
        new ApplicationError('INVALID_TOKEN', 'Authentication token is invalid or expired', 401),
      );
    }
  };
}
export const requireOrganisation: RequestHandler = (request, _response, next) =>
  request.auth?.organisationId
    ? next()
    : next(
        new ApplicationError('ORGANISATION_REQUIRED', 'An organisation context is required', 403),
      );
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) =>
    request.auth && roles.includes(request.auth.role)
      ? next()
      : next(
          new ApplicationError(
            'INSUFFICIENT_ROLE',
            'Your organisation role does not permit this action',
            403,
          ),
        );
}
