import { Router } from 'express';
import type { AuthTokenService } from '../modules/auth/auth-token.service.js';
import { requireAuth, requireOrganisation } from '../modules/auth/auth.middleware.js';
import type { InvestigationController } from '../modules/investigations/investigations.controller.js';
import {
  createInvestigationRouter,
  createProjectInvestigationRouter,
} from '../modules/investigations/investigations.routes.js';
import type { EnvironmentController } from '../modules/environments/environments.controller.js';
import { createEnvironmentRouter } from '../modules/environments/environments.routes.js';
import type { JourneyController } from '../modules/journeys/journeys.controller.js';
import { createJourneyRouter } from '../modules/journeys/journeys.routes.js';
import type { InvariantController } from '../modules/invariants/invariants.controller.js';
import { createInvariantRouter } from '../modules/invariants/invariants.routes.js';
import type { ProjectController } from '../modules/projects/projects.controller.js';
import { createProjectRouter } from '../modules/projects/projects.routes.js';
import type { OrganisationController } from '../modules/organisations/organisation.controller.js';
import { createOrganisationRouter } from '../modules/organisations/organisation.routes.js';
import type { ScenarioController } from '../modules/scenarios/scenarios.controller.js';
import { createScenarioRouter } from '../modules/scenarios/scenarios.routes.js';
import { createNotImplementedRouter } from './not-implemented.js';
import type { InvitationController } from '../modules/invitations/invitation.controller.js';
import { createOrganisationInvitationRouter } from '../modules/invitations/invitation.routes.js';
import type { RepairVerificationController } from '../modules/repair-verification/repair-verification.controller.js';
import {
  createFindingRepairVerificationRouter,
  createRepairVerificationRouter,
} from '../modules/repair-verification/repair-verification.routes.js';
import type { DashboardController } from '../modules/dashboard/dashboard.controller.js';
import { createDashboardRouter } from '../modules/dashboard/dashboard.routes.js';

export interface ProtectedControllers {
  projects: ProjectController;
  environments: EnvironmentController;
  journeys: JourneyController;
  invariants: InvariantController;
  scenarios: ScenarioController;
  investigations: InvestigationController;
  organisations: OrganisationController;
  invitations: InvitationController;
  repairVerifications: RepairVerificationController;
  dashboard: DashboardController;
}
export function createProtectedRouter(
  tokens: AuthTokenService,
  controllers: ProtectedControllers,
): Router {
  const router = Router();
  router.use(requireAuth(tokens), requireOrganisation);
  router.use('/users', createNotImplementedRouter('User management'));
  router.use(
    '/organisations/current/invitations',
    createOrganisationInvitationRouter(controllers.invitations),
  );
  router.use('/organisations', createOrganisationRouter(controllers.organisations));
  router.use('/organisations', createDashboardRouter(controllers.dashboard));
  router.use(
    '/projects/:projectId/environments',
    createEnvironmentRouter(controllers.environments),
  );
  router.use('/projects/:projectId/journeys', createJourneyRouter(controllers.journeys));
  router.use('/projects/:projectId/scenarios', createScenarioRouter(controllers.scenarios));
  router.use(
    '/projects/:projectId/invariants',
    createInvariantRouter(controllers.invariants),
  );
  router.use(
    '/projects/:projectId/investigations',
    createProjectInvestigationRouter(controllers.investigations),
  );
  router.use('/projects', createProjectRouter(controllers.projects));
  router.use('/investigations', createInvestigationRouter(controllers.investigations));
  router.use(
    '/findings/:findingId/repair-verifications',
    createFindingRepairVerificationRouter(controllers.repairVerifications),
  );
  router.use('/repair-verifications', createRepairVerificationRouter(controllers.repairVerifications));
  router.use('/findings', createNotImplementedRouter('Finding detail and reproduction'));
  router.use('/repairs', createNotImplementedRouter('Repair verification'));
  router.get('/world-packs', (_request, response) =>
    response.json([{ identifier: 'commerce', name: 'Commerce', version: '0.1.0' }]),
  );
  router.get('/world-packs/commerce/templates', (_request, response) =>
    response.json([
      { id: 'delayed-payment', name: 'Delayed payment' },
      { id: 'duplicate-submission', name: 'Duplicate submission' },
      { id: 'limited-inventory', name: 'Limited inventory' },
    ]),
  );
  return router;
}
