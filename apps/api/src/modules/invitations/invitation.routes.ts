import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import { requireAuth } from '../auth/auth.middleware.js';
import type { AuthTokenService } from '../auth/auth-token.service.js';
import type { InvitationController } from './invitation.controller.js';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  previewInvitationSchema,
} from './invitation.schema.js';

export function createRecipientInvitationRouter(
  controller: InvitationController,
  tokens: AuthTokenService,
) {
  const router = Router();
  router.get(
    '/preview',
    (request, _response, next) => {
      const result = previewInvitationSchema.safeParse(request.query);
      if (!result.success) return next(result.error);
      request.query = result.data;
      next();
    },
    controller.preview,
  );
  router.use(requireAuth(tokens));
  router.get('/', controller.inbox);
  router.post('/accept', validateBody(acceptInvitationSchema, 400), controller.accept);
  router.post('/:invitationId/accept', controller.acceptFromInbox);
  router.post('/:invitationId/decline', controller.decline);
  return router;
}

export function createOrganisationInvitationRouter(controller: InvitationController) {
  const router = Router();
  router.get('/', controller.listForOrganisation);
  router.post('/', validateBody(createInvitationSchema, 400), controller.create);
  router.post('/:invitationId/revoke', controller.revoke);
  return router;
}
