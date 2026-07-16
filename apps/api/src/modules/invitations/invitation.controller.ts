import type { NextFunction, Request, Response } from 'express';
import type { InvitationService } from './invitation.service.js';

export class InvitationController {
  constructor(private readonly service: InvitationService) {}

  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.status(201).json(await this.service.create(request.auth!, request.body));
    } catch (error) {
      next(error);
    }
  };
  listForOrganisation = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.listForOrganisation(request.auth!));
    } catch (error) {
      next(error);
    }
  };
  revoke = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.revoke(request.auth!, String(request.params.invitationId)));
    } catch (error) {
      next(error);
    }
  };
  inbox = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.inbox(request.auth!));
    } catch (error) {
      next(error);
    }
  };
  preview = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.preview(String(request.query.token)));
    } catch (error) {
      next(error);
    }
  };
  accept = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.accept(request.auth!, request.body.token));
    } catch (error) {
      next(error);
    }
  };
  acceptFromInbox = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(
        await this.service.acceptFromInbox(request.auth!, String(request.params.invitationId)),
      );
    } catch (error) {
      next(error);
    }
  };
  decline = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.service.decline(request.auth!, String(request.params.invitationId)));
    } catch (error) {
      next(error);
    }
  };
}
