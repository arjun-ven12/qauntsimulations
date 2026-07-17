import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import type { InvariantController } from './invariants.controller.js';
import { createInvariantSchema, updateInvariantSchema } from './invariants.schema.js';

export function createInvariantRouter(controller: InvariantController) {
  const router = Router({ mergeParams: true });
  router.get('/', controller.list);
  router.post('/', validateBody(createInvariantSchema), controller.create);
  router.get('/:invariantId', controller.get);
  router.patch('/:invariantId', validateBody(updateInvariantSchema), controller.update);
  router.delete('/:invariantId', controller.remove);
  router.post('/:invariantId/validate', controller.validate);
  router.post('/:invariantId/duplicate', controller.duplicate);
  return router;
}
