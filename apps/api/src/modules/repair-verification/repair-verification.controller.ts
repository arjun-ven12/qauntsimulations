import type { NextFunction, Request, Response } from 'express';
import type { RepairVerificationDomainService } from './repair-verification.service.js';

export class RepairVerificationController {
  constructor(private readonly service: RepairVerificationDomainService) {}

  preflight = async (request: Request, response: Response, next: NextFunction) => {
    try { response.json(await this.service.preflight(request.auth!, String(request.params.findingId), request.body)); } catch (error) { next(error); }
  };

  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await this.service.create(
        request.auth!,
        String(request.params.findingId),
        request.body,
        request.header('Idempotency-Key'),
      );
      response.status(result.created ? 201 : 200).json(result.response);
    } catch (error) { next(error); }
  };

  list = async (request: Request, response: Response, next: NextFunction) => {
    try { response.json(await this.service.list(request.auth!, String(request.params.findingId))); } catch (error) { next(error); }
  };

  targets = async (request: Request, response: Response, next: NextFunction) => {
    try { response.json(await this.service.targets(request.auth!, String(request.params.findingId))); } catch (error) { next(error); }
  };

  detail = async (request: Request, response: Response, next: NextFunction) => {
    try { response.json(await this.service.detail(request.auth!, String(request.params.verificationId))); } catch (error) { next(error); }
  };

  cancel = async (request: Request, response: Response, next: NextFunction) => {
    try { response.json(await this.service.cancel(request.auth!, String(request.params.verificationId), request.body)); } catch (error) { next(error); }
  };
}
