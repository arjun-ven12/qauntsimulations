import type { NextFunction, Request, Response } from 'express';
import { templateCategorySchema } from './templates.schema.js';
import type { TemplateService } from './templates.service.js';

export class TemplateController {
  constructor(private readonly service: TemplateService) {}

  list = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const category = request.query.category
        ? templateCategorySchema.parse(request.query.category)
        : undefined;
      response.json(await this.service.list(request.auth!, category));
    } catch (error) {
      next(error);
    }
  };

  get = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.get(request.auth!, String(request.params.templateId)));
    } catch (error) {
      next(error);
    }
  };

  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.status(201).json(await this.service.create(request.auth!, request.body));
    } catch (error) {
      next(error);
    }
  };

  update = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(
        await this.service.update(request.auth!, String(request.params.templateId), request.body),
      );
    } catch (error) {
      next(error);
    }
  };

  remove = async (request: Request, response: Response, next: NextFunction) => {
    try {
      await this.service.remove(request.auth!, String(request.params.templateId));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
