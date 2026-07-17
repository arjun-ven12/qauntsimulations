import { isAbsolute, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '@taskos/database';
import { KimiClient, KimiExperimentPlanner, OpenAIClient, OpenAIExperimentPlanner, type ExperimentPlanner } from '@taskos/ai-providers';
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
import { FinalEvidenceReportService } from './modules/experiments/services/final-evidence-report.service.js';
import {
  DeterministicExperimentPlanner,
  InvestigationPlanningService,
} from './modules/experiments/services/investigation-planning.service.js';
import { ExecutionCleanupService } from './modules/execution/execution-cleanup.service.js';
import { InvestigationOrchestratorService } from './modules/execution/investigation-orchestrator.service.js';
import { LocalPlaywrightWorkerExecutor } from './modules/execution/local-worker-executor.service.js';
import { WorkerJobFactoryService } from './modules/execution/worker-job-factory.service.js';
import { DaytonaFleetCapacityManager } from './modules/execution/daytona-fleet-capacity-manager.js';
import { DaytonaPlaywrightWorkerExecutor } from './modules/execution/daytona-worker-executor.service.js';
import { DaytonaWorkerFleet } from './modules/execution/daytona-worker-fleet.service.js';
import { WorkerExecutorFactory } from './modules/execution/worker-executor.factory.js';
import { InvestigationController } from './modules/investigations/investigations.controller.js';
import { InvestigationRepository } from './modules/investigations/investigations.repository.js';
import { InvestigationService } from './modules/investigations/investigations.service.js';
import { InvariantController } from './modules/invariants/invariants.controller.js';
import { InvariantRepository } from './modules/invariants/invariants.repository.js';
import { InvariantService } from './modules/invariants/invariants.service.js';
import { InvitationController } from './modules/invitations/invitation.controller.js';
import { PrismaInvitationRepository } from './modules/invitations/invitation.repository.js';
import { InvitationService } from './modules/invitations/invitation.service.js';
import { EvidenceContentService } from './modules/investigations/evidence-content.service.js';
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
import { RepairVerificationController } from './modules/repair-verification/repair-verification.controller.js';
import { RepairVerificationExecutionService } from './modules/repair-verification/repair-verification-execution.service.js';
import { PrismaRepairVerificationReadRepository } from './modules/repair-verification/repair-verification.repository.js';
import { RepairVerificationDomainService } from './modules/repair-verification/repair-verification.service.js';

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
const repairVerificationRepository = new PrismaRepairVerificationReadRepository(database);
const openAIPlannerModel = env.OPENAI_PLANNER_MODEL ?? env.OPENAI_MODEL_PLANNER;
let selectedPlanner: ExperimentPlanner | undefined;
const plannerModel: string | undefined = env.PLANNER_PROVIDER === 'kimi' ? env.KIMI_MODEL : env.PLANNER_PROVIDER === 'openai' ? openAIPlannerModel : undefined;
const plannerTimeoutMs = env.PLANNER_PROVIDER === 'kimi' ? env.KIMI_TIMEOUT_MS : env.OPENAI_PLANNER_TIMEOUT_MS;
const plannerMaximumAttempts = env.PLANNER_PROVIDER === 'kimi' ? 1 : env.OPENAI_PLANNER_MAX_RETRIES + 1;
const plannerMaximumOutputTokens = env.PLANNER_PROVIDER === 'kimi' ? env.KIMI_MAX_OUTPUT_TOKENS : env.OPENAI_PLANNER_MAX_OUTPUT_TOKENS;
if (env.PLANNER_PROVIDER === 'openai' && env.OPENAI_API_KEY) {
  selectedPlanner = new OpenAIExperimentPlanner(
      new OpenAIClient({
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        timeoutMs: env.OPENAI_PLANNER_TIMEOUT_MS,
        maxRetries: env.OPENAI_PLANNER_MAX_RETRIES,
      }),
      openAIPlannerModel,
    );
}
if (env.PLANNER_PROVIDER === 'kimi' && env.MOONSHOT_API_KEY) {
  selectedPlanner = new KimiExperimentPlanner(
    new KimiClient({
      apiKey: env.MOONSHOT_API_KEY,
      baseUrl: env.KIMI_BASE_URL,
      timeoutMs: env.KIMI_TIMEOUT_MS,
      maxRetries: 0,
    }),
    env.KIMI_MODEL,
  );
}
const investigationPlanningService = new InvestigationPlanningService(
  {
    requestedProvider: env.PLANNER_PROVIDER,
    fallbackEnabled: env.PLANNER_FALLBACK_ENABLED,
    maximumWorlds: env.PLANNER_MAX_WORLDS,
    maximumVariables: env.PLANNER_MAX_VARIABLES,
    maximumAssumptions: env.PLANNER_MAX_ASSUMPTIONS,
    maximumWarnings: env.PLANNER_MAX_WARNINGS,
    timeoutMs: plannerTimeoutMs,
    maxProviderAttempts: plannerMaximumAttempts,
    maxOutputTokens: plannerMaximumOutputTokens,
    ...(plannerModel ? { model: plannerModel } : {}),
  },
  new DeterministicExperimentPlanner(new DeterministicExperimentPlanService(2)),
  selectedPlanner,
);
const daytonaFleet = new DaytonaWorkerFleet(new DaytonaFleetCapacityManager(env.DAYTONA_FLEET_HARD_LIMIT));
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
  undefined,
  daytonaFleet,
  {
    perInvestigationLimit: env.DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION,
    serverWideLimit: env.DAYTONA_MAX_CONCURRENT_SANDBOXES,
    maximumAttempts: env.DAYTONA_MAX_RETRY_ATTEMPTS,
    retryBaseDelayMs: env.DAYTONA_RETRY_BASE_DELAY_MS,
    retryMaximumDelayMs: env.DAYTONA_RETRY_MAX_DELAY_MS,
    maximumTotalSandboxCreations: env.DAYTONA_MAX_TOTAL_SANDBOX_CREATIONS_PER_INVESTIGATION,
    maximumInvestigationDurationSeconds: env.DAYTONA_MAX_INVESTIGATION_DURATION_SECONDS,
  },
  {
    enabled: env.ADAPTIVE_REPRODUCTION_ENABLED,
    maximumFindingsPerInvestigation: env.ADAPTIVE_MAX_FINDINGS_PER_INVESTIGATION,
    maximumFollowupWorlds: env.ADAPTIVE_MAX_FOLLOWUP_WORLDS,
    maximumTotalWorlds: env.ADAPTIVE_MAX_TOTAL_WORLDS,
    exactReproductionAttempts: env.ADAPTIVE_EXACT_REPRODUCTION_ATTEMPTS,
    confidenceInitial: env.ADAPTIVE_CONFIDENCE_INITIAL,
    confidenceMaximum: env.ADAPTIVE_CONFIDENCE_MAX,
    minimumEvidenceWorlds: env.ADAPTIVE_MIN_EVIDENCE_WORLDS,
    timeoutSeconds: env.ADAPTIVE_REPRODUCTION_TIMEOUT_SECONDS,
  },
  undefined,
  undefined,
  {
    enabled: env.MINIMISATION_ENABLED,
    maximumFindingsPerInvestigation: env.MINIMISATION_MAX_FINDINGS_PER_INVESTIGATION,
    maximumTrials: env.MINIMISATION_MAX_TRIALS,
    maximumTotalWorlds: env.MINIMISATION_MAX_TOTAL_WORLDS,
    maximumDurationSeconds: env.MINIMISATION_MAX_DURATION_SECONDS,
    maximumDelayTrials: env.MINIMISATION_MAX_DELAY_TRIALS,
    delayTargetPrecisionMs: env.MINIMISATION_DELAY_TARGET_PRECISION_MS,
    confirmFinalSet: env.MINIMISATION_CONFIRM_FINAL_SET,
    confidenceMaximum: env.MINIMISATION_CONFIDENCE_MAX,
    finalReportEnabled: env.FINAL_REPORT_ENABLED,
  },
  undefined,
  new FinalEvidenceReportService(evidenceRoot),
);
const repairVerificationExecution = new RepairVerificationExecutionService(
  repairVerificationRepository,
  investigationOrchestrator,
);
investigationOrchestrator.setTerminalListener(repairVerificationExecution);
const repairVerificationController = new RepairVerificationController(
  new RepairVerificationDomainService(
    repairVerificationRepository,
    undefined,
    undefined,
    repairVerificationExecution,
  ),
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
    invariants: new InvariantController(
      new InvariantService(new InvariantRepository(database)),
    ),
    scenarios: new ScenarioController(new ScenarioService(new ScenarioRepository(database))),
    investigations: new InvestigationController(
      new InvestigationService(
        investigationRepository,
        investigationPlanningService,
        investigationOrchestrator,
        new EvidenceContentService(evidenceRoot, env.FINAL_REPORT_CONTENT_MAX_BYTES),
      ),
    ),
    repairVerifications: repairVerificationController,
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
