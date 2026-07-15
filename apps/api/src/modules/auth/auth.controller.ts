import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../../config/constants.js';
import type { AuthService } from './auth.service.js';
import type { AuthSession } from './auth.types.js';

export interface CookieConfiguration {
  secure: boolean;
  domain?: string;
}

export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly cookies: CookieConfiguration,
  ) {}

  register = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await this.service.register(request.body);
      this.setCookies(response, session);
      response.status(201).json(publicSession(session));
    } catch (error) {
      next(error);
    }
  };

  login = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await this.service.login(request.body);
      this.setCookies(response, session);
      response.json(publicSession(session));
    } catch (error) {
      next(error);
    }
  };

  logout = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.logout(request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined);
      response.clearCookie(ACCESS_COOKIE_NAME, this.cookieOptions('/'));
      response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions('/api/auth'));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  refresh = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      if (!token) {
        response
          .status(401)
          .json({ error: { code: 'REFRESH_REQUIRED', message: 'A refresh token is required' } });
        return;
      }
      const session = await this.service.refresh(token);
      this.setCookies(response, session);
      response.json(publicSession(session));
    } catch (error) {
      next(error);
    }
  };

  me = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.json(await this.service.me(request.auth!));
    } catch (error) {
      next(error);
    }
  };

  private setCookies(response: Response, session: AuthSession): void {
    response.cookie(ACCESS_COOKIE_NAME, session.accessToken, {
      ...this.cookieOptions('/'),
      maxAge: remainingMilliseconds(session.accessTokenExpiresAt),
    });
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      ...this.cookieOptions('/api/auth'),
      maxAge: remainingMilliseconds(session.refreshTokenExpiresAt),
    });
  }

  private cookieOptions(path: string) {
    return {
      httpOnly: true,
      secure: this.cookies.secure,
      sameSite: 'lax' as const,
      path,
      ...(this.cookies.domain ? { domain: this.cookies.domain } : {}),
    };
  }
}

function remainingMilliseconds(expiresAt: number): number {
  return Math.max(0, expiresAt - Date.now());
}

function publicSession(session: AuthSession) {
  return {
    user: session.user,
    organisation: session.organisation,
    permissions: session.permissions,
  };
}
