import type { NextFunction, Request, Response } from 'express';
import type { InvestigationService } from './investigations.service.js';

export class InvestigationController {
  constructor(private readonly service: InvestigationService) {}
  create = async (request: Request, response: Response, next: NextFunction) => { try { response.status(201).json(await this.service.create(request.auth!.organisationId!, request.body)); } catch (error) { next(error); } };
  createForProject = async (request: Request, response: Response, next: NextFunction) => { try { response.status(201).json(await this.service.create(request.auth!.organisationId!, request.body, String(request.params.projectId))); } catch (error) { next(error); } };
  get = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.get(request.auth!.organisationId!, String(request.params.investigationId))); } catch (error) { next(error); } };
  plan = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.plan(request.auth!.organisationId!, String(request.params.investigationId))); } catch (error) { next(error); } };
  worlds = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.worlds(request.auth!.organisationId!, String(request.params.investigationId))); } catch (error) { next(error); } };
  experiments = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.experiments(request.auth!.organisationId!, String(request.params.investigationId))); } catch (error) { next(error); } };
  workers = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.workers(request.auth!.organisationId!, String(request.params.investigationId))); } catch (error) { next(error); } };
  evidence = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.evidence(request.auth!.organisationId!, String(request.params.investigationId))); } catch (error) { next(error); } };
  findings = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.findings(request.auth!.organisationId!, String(request.params.investigationId))); } catch (error) { next(error); } };
  cancel = async (request: Request, response: Response, next: NextFunction) => { try { response.json(await this.service.cancel(request.auth!.organisationId!, String(request.params.investigationId))); } catch (error) { next(error); } };
}
