import type { NextFunction, Request, Response } from 'express';
import type { ProjectService } from './projects.service.js';

export class ProjectController {
  constructor(private readonly service: ProjectService) {}

  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.status(201).json(await this.service.create(request.auth!, request.body));
    } catch (error) {
      next(error);
    }
  };

  list = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.list(request.auth!));
    } catch (error) {
      next(error);
    }
  };

  get = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.get(request.auth!, String(request.params.projectId)));
    } catch (error) {
      next(error);
    }
  };

  update = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(
        await this.service.update(request.auth!, String(request.params.projectId), request.body),
      );
    } catch (error) {
      next(error);
    }
  };

  getSafety = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.getSafety(request.auth!, String(request.params.projectId)));
    } catch (error) {
      next(error);
    }
  };

  updateSafety = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(
        await this.service.updateSafety(
          request.auth!,
          String(request.params.projectId),
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  };
}
