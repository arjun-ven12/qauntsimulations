import type { NextFunction, Request, Response } from 'express';
import type { JourneyService } from './journeys.service.js';

export class JourneyController {
  constructor(private readonly service: JourneyService) {}

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

  list = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.list(request.auth!, String(request.params.projectId)));
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
          String(request.params.journeyId),
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
          String(request.params.journeyId),
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
        String(request.params.journeyId),
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
          String(request.params.journeyId),
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
            String(request.params.journeyId),
          ),
        );
    } catch (error) {
      next(error);
    }
  };
}
