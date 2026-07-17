import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import {
  repairVerificationCancellationInputSchema,
  repairVerificationTargetInputSchema,
} from './repair-verification.schema.js';
import type { RepairVerificationController } from './repair-verification.controller.js';

export function createFindingRepairVerificationRouter(controller: RepairVerificationController): Router {
  const router = Router({ mergeParams: true });
  router.post('/preflight', validateBody(repairVerificationTargetInputSchema), controller.preflight);
  router.post('/', validateBody(repairVerificationTargetInputSchema), controller.create);
  router.get('/targets', controller.targets);
  router.get('/', controller.list);
  return router;
}

export function createRepairVerificationRouter(controller: RepairVerificationController): Router {
  const router = Router();
  router.get('/:verificationId', controller.detail);
  router.post('/:verificationId/cancel', validateBody(repairVerificationCancellationInputSchema), controller.cancel);
  return router;
}
