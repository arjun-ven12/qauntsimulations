import type { NextFunction, Request, Response } from 'express';
import type { OrganisationService } from './organisation.service.js';

export class OrganisationController {
  constructor(private readonly service: OrganisationService) {}

  current = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.json(await this.service.current(request.auth!));
    } catch (error) {
      next(error);
    }
  };

  members = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.json(await this.service.members(request.auth!));
    } catch (error) {
      next(error);
    }
  };
}
