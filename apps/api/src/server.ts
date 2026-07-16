import { createAIProvider } from '@taskos/ai-providers';
import { createDatabaseClient } from '@taskos/database';
import { createApplication } from './app.js';
import { loadEnvironment } from './config/env.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { PrismaAuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { JwtAuthTokenService } from './modules/auth/auth-token.service.js';
import { BcryptPasswordHasher } from './modules/auth/password-hasher.js';
import { EnvironmentController } from './modules/environments/environments.controller.js';
import { EnvironmentRepository } from './modules/environments/environments.repository.js';
import { EnvironmentService } from './modules/environments/environments.service.js';
import { InvestigationController } from './modules/investigations/investigations.controller.js';
import { InvestigationRepository } from './modules/investigations/investigations.repository.js';
import { InvestigationService } from './modules/investigations/investigations.service.js';
import { JourneyController } from './modules/journeys/journeys.controller.js';
import { JourneyRepository } from './modules/journeys/journeys.repository.js';
import { JourneyService } from './modules/journeys/journeys.service.js';
import { ProjectController } from './modules/projects/projects.controller.js';
import { PrismaProjectRepository } from './modules/projects/projects.repository.js';
import { ProjectService } from './modules/projects/projects.service.js';
import { OrganisationController } from './modules/organisations/organisation.controller.js';
import { PrismaOrganisationRepository } from './modules/organisations/organisation.repository.js';
import { OrganisationService } from './modules/organisations/organisation.service.js';
import { ScenarioController } from './modules/scenarios/scenarios.controller.js';
import { ScenarioRepository } from './modules/scenarios/scenarios.repository.js';
import { ScenarioService } from './modules/scenarios/scenarios.service.js';
import { logger } from './core/logging/logger.js';
import { InvitationController } from './modules/invitations/invitation.controller.js';
import { PrismaInvitationRepository } from './modules/invitations/invitation.repository.js';
import { InvitationService } from './modules/invitations/invitation.service.js';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
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
const ai = createAIProvider({
  provider: env.AI_PROVIDER,
  openai: {
    ...(env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY } : {}),
    baseUrl: env.OPENAI_BASE_URL,
    plannerModel: env.OPENAI_MODEL_PLANNER,
    explanationModel: env.OPENAI_MODEL_EXPLANATION,
    visionModel: env.OPENAI_MODEL_VISION,
  },
  kimi: {
    ...(env.KIMI_API_KEY ? { apiKey: env.KIMI_API_KEY } : {}),
    baseUrl: env.KIMI_BASE_URL,
    ...(env.KIMI_MODEL ? { model: env.KIMI_MODEL } : {}),
  },
});
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
      new InvestigationService(new InvestigationRepository(database), ai),
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
