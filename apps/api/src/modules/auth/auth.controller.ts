import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../../config/constants.js';
import type { AuthService } from './auth.service.js';

export interface CookieConfiguration { secure: boolean; domain?: string }
export class AuthController {
  constructor(private readonly service: AuthService, private readonly cookies: CookieConfiguration) {}
  register = async (request: Request, response: Response, next: NextFunction): Promise<void> => { try { const session = await this.service.register(request.body); this.setCookies(response, session); response.status(201).json({ user: session.user, organisation: session.organisation }); } catch (error) { next(error); } };
  login = async (request: Request, response: Response, next: NextFunction): Promise<void> => { try { const session = await this.service.login(request.body); this.setCookies(response, session); response.json({ user: session.user, organisation: session.organisation }); } catch (error) { next(error); } };
  logout = async (request: Request, response: Response, next: NextFunction): Promise<void> => { try { await this.service.logout(request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined); response.clearCookie(ACCESS_COOKIE_NAME, this.cookieOptions()); response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions()); response.status(204).send(); } catch (error) { next(error); } };
  refresh = async (request: Request, response: Response, next: NextFunction): Promise<void> => { try { const token = request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined; if (!token) { response.status(401).json({ error: { code: 'REFRESH_REQUIRED', message: 'A refresh token is required' } }); return; } const session = await this.service.refresh(token); this.setCookies(response, session); response.json({ user: session.user, organisation: session.organisation }); } catch (error) { next(error); } };
  me = async (request: Request, response: Response, next: NextFunction): Promise<void> => { try { response.json(await this.service.me(request.auth!.userId)); } catch (error) { next(error); } };
  private setCookies(response: Response, session: { accessToken: string; refreshToken: string }): void { response.cookie(ACCESS_COOKIE_NAME, session.accessToken, { ...this.cookieOptions(), maxAge: 15 * 60 * 1000 }); response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, { ...this.cookieOptions(), path: '/api/auth', maxAge: 7 * 24 * 60 * 60 * 1000 }); }
  private cookieOptions() { return { httpOnly: true, secure: this.cookies.secure, sameSite: 'lax' as const, ...(this.cookies.domain ? { domain: this.cookies.domain } : {}) }; }
}
