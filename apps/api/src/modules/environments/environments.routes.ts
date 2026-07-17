import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import type { EnvironmentController } from './environments.controller.js';
import { createEnvironmentSchema, updateEnvironmentSchema } from './environments.schema.js';
export function createEnvironmentRouter(controller: EnvironmentController) {
  const router = Router({ mergeParams: true });
  router.get('/', controller.list);
  router.post('/', validateBody(createEnvironmentSchema, 400), controller.create);
  router.get('/:environmentId', controller.get);
  router.patch('/:environmentId', validateBody(updateEnvironmentSchema, 400), controller.update);
  router.post('/:environmentId/validate', controller.validate);
  router.post('/:environmentId/set-default', controller.setDefault);
  return router;
}
