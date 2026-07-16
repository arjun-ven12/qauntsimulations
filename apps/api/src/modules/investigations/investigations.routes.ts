import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import type { InvestigationController } from './investigations.controller.js';
import { createInvestigationSchema, createProjectInvestigationSchema } from './investigations.schema.js';

export function createProjectInvestigationRouter(controller: InvestigationController) {
  const router = Router({ mergeParams: true });
  router.post('/', validateBody(createProjectInvestigationSchema), controller.createForProject);
  return router;
}

export function createInvestigationRouter(controller: InvestigationController) {
  const router = Router();
  router.post('/', validateBody(createInvestigationSchema), controller.create);
  router.get('/:investigationId', controller.get);
  router.get('/:investigationId/plan', controller.plan);
  router.get('/:investigationId/worlds', controller.worlds);
  router.get('/:investigationId/experiments', controller.experiments);
  router.get('/:investigationId/workers', controller.workers);
  router.get('/:investigationId/evidence', controller.evidence);
  router.get('/:investigationId/findings', controller.findings);
  router.post('/:investigationId/cancel', controller.cancel);
  return router;
}
