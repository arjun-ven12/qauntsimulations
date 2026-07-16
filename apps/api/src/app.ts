import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import type { AuthTokenService } from './modules/auth/auth-token.service.js';
import type { AuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import type { ProtectedControllers } from './routes/index.js';
import { createProtectedRouter } from './routes/index.js';
import { errorHandler } from './core/middleware/error-handler.js';
import { logger } from './core/logging/logger.js';
import { MAX_REQUEST_BYTES } from './config/constants.js';
import type { InvitationController } from './modules/invitations/invitation.controller.js';
import { createRecipientInvitationRouter } from './modules/invitations/invitation.routes.js';
export interface ApplicationDependencies {
  webUrl: string;
  authController: AuthController;
  invitationController: InvitationController;
  tokens: AuthTokenService;
  controllers: ProtectedControllers;
}
export function createApplication(dependencies: ApplicationDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: dependencies.webUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );
  app.use(
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }),
  );
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => request.headers['x-request-id']?.toString() ?? crypto.randomUUID(),
    }),
  );
  app.use(express.json({ limit: MAX_REQUEST_BYTES }));
  app.use(express.urlencoded({ extended: false, limit: MAX_REQUEST_BYTES }));
  app.use(cookieParser());
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.use('/api/auth', createAuthRouter(dependencies.authController, dependencies.tokens));
  app.use(
    '/api/invitations',
    createRecipientInvitationRouter(dependencies.invitationController, dependencies.tokens),
  );
  app.use('/api', createProtectedRouter(dependencies.tokens, dependencies.controllers));
  app.use((_request, response) =>
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
  );
  app.use(errorHandler);
  return app;
}
