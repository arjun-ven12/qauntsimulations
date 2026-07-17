import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import type { JourneyController } from './journeys.controller.js';
import { createJourneySchema, updateJourneySchema } from './journeys.schema.js';

export function createJourneyRouter(controller: JourneyController) {
  const router = Router({ mergeParams: true });
  router.get('/', controller.list);
  router.post('/', validateBody(createJourneySchema), controller.create);
  router.get('/:journeyId', controller.get);
  router.patch('/:journeyId', validateBody(updateJourneySchema), controller.update);
  router.delete('/:journeyId', controller.remove);
  router.post('/:journeyId/validate', controller.validate);
  router.post('/:journeyId/duplicate', controller.duplicate);
  return router;
}
