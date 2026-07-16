import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import type { AuthTokenService } from './auth-token.service.js';
import type { AuthController } from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';
import { loginSchema, registerSchema, switchOrganisationSchema } from './auth.schema.js';
export function createAuthRouter(controller: AuthController, tokens: AuthTokenService): Router {
  const router = Router();
  router.post('/register', validateBody(registerSchema), controller.register);
  router.post('/login', validateBody(loginSchema), controller.login);
  router.post('/logout', controller.logout);
  router.post('/refresh', controller.refresh);
  router.get('/me', requireAuth(tokens), controller.me);
  router.post(
    '/switch-organisation',
    requireAuth(tokens),
    validateBody(switchOrganisationSchema, 400),
    controller.switchOrganisation,
  );
  return router;
}
