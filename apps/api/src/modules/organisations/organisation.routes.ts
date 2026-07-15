import { Router } from 'express';
import type { OrganisationController } from './organisation.controller.js';

export function createOrganisationRouter(controller: OrganisationController): Router {
  const router = Router();
  router.get('/current', controller.current);
  router.get('/current/members', controller.members);
  return router;
}
