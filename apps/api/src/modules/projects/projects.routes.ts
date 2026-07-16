import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import type { ProjectController } from './projects.controller.js';
import { createProjectSchema, updateProjectSchema, updateSafetySchema } from './projects.schema.js';

export function createProjectRouter(controller: ProjectController): Router {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', validateBody(createProjectSchema), controller.create);
  router.get('/:projectId', controller.get);
  router.patch('/:projectId', validateBody(updateProjectSchema), controller.update);
  router.get('/:projectId/safety', controller.getSafety);
  router.patch(
    '/:projectId/safety',
    validateBody(updateSafetySchema, 400),
    controller.updateSafety,
  );
  return router;
}
