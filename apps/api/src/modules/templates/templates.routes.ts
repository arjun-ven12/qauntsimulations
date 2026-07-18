import { Router } from 'express';
import { validateBody } from '../../core/validation/validate.js';
import type { TemplateController } from './templates.controller.js';
import { createTemplateSchema, updateTemplateSchema } from './templates.schema.js';

export function createTemplateRouter(controller: TemplateController) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', validateBody(createTemplateSchema), controller.create);
  router.get('/:templateId', controller.get);
  router.put('/:templateId', validateBody(updateTemplateSchema), controller.update);
  router.delete('/:templateId', controller.remove);
  return router;
}
