import { isAbsolute, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '@taskos/database';
import { createApplication } from './app.js';
import { loadEnvironment } from './config/env.js';
import { logger } from './core/logging/logger.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { PrismaAuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { JwtAuthTokenService } from './modules/auth/auth-token.service.js';
import { BcryptPasswordHasher } from './modules/auth/password-hasher.js';
import { LocalEvidenceMetadataService } from './modules/evidence/local-evidence-metadata.service.js';
import { createSandboxProvider } from './integrations/daytona/daytona-sandbox.service.js';
import { EnvironmentController } from './modules/environments/environments.controller.js';
import { EnvironmentRepository } from './modules/environments/environments.repository.js';
import { EnvironmentService } from './modules/environments/environments.service.js';
import { DeterministicExperimentPlanService } from './modules/experiments/services/deterministic-experiment-plan.service.js';
import { ExecutionCleanupService } from './modules/execution/execution-cleanup.service.js';
import { InvestigationOrchestratorService } from './modules/execution/investigation-orchestrator.service.js';
import { LocalPlaywrightWorkerExecutor } from './modules/execution/local-worker-executor.service.js';
import { WorkerJobFactoryService } from './modules/execution/worker-job-factory.service.js';
import { DaytonaPlaywrightWorkerExecutor } from './modules/execution/daytona-worker-executor.service.js';
import { WorkerExecutorFactory } from './modules/execution/worker-executor.factory.js';
import { InvestigationController } from './modules/investigations/investigations.controller.js';
import { InvestigationRepository } from './modules/investigations/investigations.repository.js';
import { InvestigationService } from './modules/investigations/investigations.service.js';
import { InvitationController } from './modules/invitations/invitation.controller.js';
import { PrismaInvitationRepository } from './modules/invitations/invitation.repository.js';
import { InvitationService } from './modules/invitations/invitation.service.js';
import { JourneyController } from './modules/journeys/journeys.controller.js';
import { JourneyRepository } from './modules/journeys/journeys.repository.js';
import { JourneyService } from './modules/journeys/journeys.service.js';
import { OrganisationController } from './modules/organisations/organisation.controller.js';
import { PrismaOrganisationRepository } from './modules/organisations/organisation.repository.js';
import { OrganisationService } from './modules/organisations/organisation.service.js';
import { ProjectController } from './modules/projects/projects.controller.js';
import { PrismaProjectRepository } from './modules/projects/projects.repository.js';
import { ProjectService } from './modules/projects/projects.service.js';
import { ScenarioController } from './modules/scenarios/scenarios.controller.js';
import { ScenarioRepository } from './modules/scenarios/scenarios.repository.js';
import { ScenarioService } from './modules/scenarios/scenarios.service.js';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));
loadEnvFile(rootEnvPath);
const env = loadEnvironment();
const database = createDatabaseClient();
const tokens = new JwtAuthTokenService({
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
  refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
});
const authService = new AuthService(
  new PrismaAuthRepository(database),
  new BcryptPasswordHasher(env.BCRYPT_ROUNDS),
  tokens,
);
const invitationController = new InvitationController(
  new InvitationService(new PrismaInvitationRepository(database), env.WEB_URL),
);
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const evidenceRoot = isAbsolute(env.EVIDENCE_LOCAL_PATH)
  ? env.EVIDENCE_LOCAL_PATH
  : resolve(repositoryRoot, env.EVIDENCE_LOCAL_PATH);
const investigationRepository = new InvestigationRepository(database);
const workerExecutor = new WorkerExecutorFactory(
  new LocalPlaywrightWorkerExecutor(evidenceRoot),
  () => {
    if (!env.DAYTONA_API_KEY) throw new Error('DAYTONA_API_KEY is required for Daytona execution');
    const sandboxProvider = createSandboxProvider({
      daytonaApiKey: env.DAYTONA_API_KEY,
      target: env.DAYTONA_TARGET,
      ...(env.DAYTONA_API_URL ? { daytonaApiUrl: env.DAYTONA_API_URL } : {}),
      ...(env.DAYTONA_SNAPSHOT ? { snapshot: env.DAYTONA_SNAPSHOT } : {}),
    });
    return new DaytonaPlaywrightWorkerExecutor(sandboxProvider, {
      target: env.DAYTONA_TARGET,
      autoDelete: env.DAYTONA_AUTO_DELETE,
      timeoutSeconds: env.DAYTONA_SANDBOX_TIMEOUT_SECONDS,
      evidenceRoot,
      demoStoreDistPath: resolve(repositoryRoot, 'apps/demo-store/dist'),
      workerBundlePath: resolve(repositoryRoot, 'workers/playwright-runner/bundle'),
      workspacePath: env.DAYTONA_WORKSPACE_PATH,
      demoStorePath: env.DAYTONA_DEMO_STORE_PATH,
      workerPath: env.DAYTONA_WORKER_PATH,
      inputPath: env.DAYTONA_INPUT_PATH,
      outputPath: env.DAYTONA_EVIDENCE_PATH,
      demoStorePort: env.DAYTONA_DEMO_STORE_PORT,
      ...(env.DAYTONA_SNAPSHOT ? { snapshot: env.DAYTONA_SNAPSHOT } : {}),
    });
  },
).create(env.WORKER_EXECUTION_PROVIDER);
const investigationOrchestrator = new InvestigationOrchestratorService(
  investigationRepository,
  workerExecutor,
  new WorkerJobFactoryService(
    evidenceRoot,
    resolve(repositoryRoot, 'demo/fixtures/checkout-journey.json'),
  ),
  new LocalEvidenceMetadataService(evidenceRoot),
);
await new ExecutionCleanupService(investigationRepository).run();

const app = createApplication({
  webUrl: env.WEB_URL,
  tokens,
  authController: new AuthController(authService, {
    secure: env.COOKIE_SECURE,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  }),
  invitationController,
  controllers: {
    projects: new ProjectController(new ProjectService(new PrismaProjectRepository(database))),
    environments: new EnvironmentController(
      new EnvironmentService(new EnvironmentRepository(database)),
    ),
    organisations: new OrganisationController(
      new OrganisationService(new PrismaOrganisationRepository(database)),
    ),
    invitations: invitationController,
    journeys: new JourneyController(new JourneyService(new JourneyRepository(database))),
    scenarios: new ScenarioController(new ScenarioService(new ScenarioRepository(database))),
    investigations: new InvestigationController(
      new InvestigationService(
        investigationRepository,
        new DeterministicExperimentPlanService(2),
        investigationOrchestrator,
      ),
    ),
  },
});
const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'TaskOS API listening'));
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await database.$disconnect();
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
