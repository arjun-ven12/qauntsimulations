import type { NextFunction, Request, Response } from 'express';
import type { InvariantService } from './invariants.service.js';

export class InvariantController {
  constructor(private readonly service: InvariantService) {}

  list = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.list(request.auth!, String(request.params.projectId)));
    } catch (error) {
      next(error);
    }
  };

  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response
        .status(201)
        .json(
          await this.service.create(
            request.auth!,
            String(request.params.projectId),
            request.body,
          ),
        );
    } catch (error) {
      next(error);
    }
  };

  get = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(
        await this.service.get(
          request.auth!,
          String(request.params.projectId),
          String(request.params.invariantId),
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  update = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(
        await this.service.update(
          request.auth!,
          String(request.params.projectId),
          String(request.params.invariantId),
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  remove = async (request: Request, response: Response, next: NextFunction) => {
    try {
      await this.service.remove(
        request.auth!,
        String(request.params.projectId),
        String(request.params.invariantId),
      );
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  validate = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(
        await this.service.validate(
          request.auth!,
          String(request.params.projectId),
          String(request.params.invariantId),
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  duplicate = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response
        .status(201)
        .json(
          await this.service.duplicate(
            request.auth!,
            String(request.params.projectId),
            String(request.params.invariantId),
          ),
        );
    } catch (error) {
      next(error);
    }
  };
}
