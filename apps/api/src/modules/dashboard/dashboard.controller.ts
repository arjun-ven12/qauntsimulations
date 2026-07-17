import type { NextFunction, Request, Response } from 'express';
import type { DashboardService } from './dashboard.service.js';
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  activity = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.activity(request.auth!)); } catch (error) { next(error); } };
}
