import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import type { OrganisationController } from './organisation.controller.js';
import {
  addOrganisationMemberSchema,
  updateOrganisationMemberSchema,
} from './organisation.schema.js';

export function createOrganisationRouter(controller: OrganisationController): Router {
  const router = Router();
  router.get('/current', controller.current);
  router.get('/current/members', controller.members);
  router.post(
    '/current/members',
    validateBody(addOrganisationMemberSchema, 400),
    controller.addMember,
  );
  router.patch(
    '/current/members/:membershipId',
    validateBody(updateOrganisationMemberSchema, 400),
    controller.updateMember,
  );
  router.delete('/current/members/:membershipId', controller.removeMember);
  return router;
}
