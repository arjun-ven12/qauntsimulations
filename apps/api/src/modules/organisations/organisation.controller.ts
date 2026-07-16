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

  addMember = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.status(201).json(await this.service.addMember(request.auth!, request.body));
    } catch (error) {
      next(error);
    }
  };

  updateMember = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      response.json(
        await this.service.updateMember(
          request.auth!,
          String(request.params.membershipId),
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  removeMember = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.service.removeMember(request.auth!, String(request.params.membershipId));
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
