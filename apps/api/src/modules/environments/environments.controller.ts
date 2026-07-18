import type { NextFunction, Request, Response } from 'express';
import type { EnvironmentService } from './environments.service.js';
export class EnvironmentController {
  constructor(private readonly service: EnvironmentService) {}
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.list(req.auth!, String(req.params.projectId)));
    } catch (e) {
      next(e);
    }
  };
  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await this.service.get(
          req.auth!,
          String(req.params.projectId),
          String(req.params.environmentId),
        ),
      );
    } catch (e) {
      next(e);
    }
  };
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res
        .status(201)
        .json(await this.service.create(req.auth!, String(req.params.projectId), req.body));
    } catch (e) {
      next(e);
    }
  };
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await this.service.update(
          req.auth!,
          String(req.params.projectId),
          String(req.params.environmentId),
          req.body,
        ),
      );
    } catch (e) {
      next(e);
    }
  };
  validate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await this.service.validate(
          req.auth!,
          String(req.params.projectId),
          String(req.params.environmentId),
        ),
      );
    } catch (e) {
      next(e);
    }
  };
  setDefault = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await this.service.setDefault(
          req.auth!,
          String(req.params.projectId),
          String(req.params.environmentId),
        ),
      );
    } catch (e) {
      next(e);
    }
  };
  retrieveIntelligence = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await this.service.retrieveIntelligence(
          req.auth!,
          String(req.params.projectId),
          String(req.params.environmentId),
        ),
      );
    } catch (e) {
      next(e);
    }
  };
}
