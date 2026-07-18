import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional());
export const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_URL: z.string().url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: booleanString.default('false'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    AI_PROVIDER: z.enum(['openai', 'kimi', 'mock']).default('openai'),
    PLANNER_PROVIDER: z.enum(['deterministic', 'openai', 'kimi', 'AIAND']).default('deterministic'),
    PLANNER_FALLBACK_ENABLED: booleanString.default('true'),
    PLANNER_MAX_WORLDS: z.coerce.number().int().min(1).max(20).default(8),
    PLANNER_MAX_VARIABLES: z.coerce.number().int().min(1).max(12).default(6),
    PLANNER_MAX_ASSUMPTIONS: z.coerce.number().int().min(0).max(20).default(10),
    PLANNER_MAX_WARNINGS: z.coerce.number().int().min(0).max(50).default(20),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    OPENAI_MODEL_PLANNER: z.string().default('gpt-5-mini'),
    OPENAI_PLANNER_MODEL: z.string().optional(),
    OPENAI_PLANNER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    OPENAI_PLANNER_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
    OPENAI_PLANNER_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(10_000).default(3_000),
    OPENAI_MODEL_EXPLANATION: z.string().default('gpt-5-mini'),
    OPENAI_MODEL_VISION: z.string().default('gpt-5-mini'),
    KIMI_API_KEY: z.string().optional(),
    MOONSHOT_API_KEY: z.string().optional(),
    KIMI_BASE_URL: z.string().url().default('https://api.moonshot.ai/v1'),
    KIMI_MODEL: z.string().default('kimi-k2.6'),
    KIMI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(60_000),
    KIMI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(10_000).default(3_000),
    AIAND_API_KEY: z.string().optional(),
    AIAND_BASE_URL: z.string().url().refine((value) => new URL(value).protocol === 'https:', 'AIAND_BASE_URL must use HTTPS').default('https://api.aiand.com/v1'),
    AIAND_MODEL: z.string().min(1).default('moonshotai/kimi-k2.7-code'),
    AIAND_API_SURFACE: z.enum(['CHAT_COMPLETIONS']).default('CHAT_COMPLETIONS'),
    AIAND_STREAMING_ENABLED: booleanString.default('true'),
    AIAND_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(240_000),
    AIAND_IDLE_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(45_000),
    AIAND_MAX_COMPLETION_TOKENS: z.coerce.number().int().min(500).max(12_000).default(8_000),
    AIAND_REASONING_EFFORT: z.enum(['none', 'minimal', 'low', 'medium', 'high']).default('none'),
    AIAND_PLANNER_ENABLED: booleanString.default('false'),
    NOSANA_EVIDENCE_INTELLIGENCE_ENABLED: booleanString.default('false'),
    NOSANA_DEPLOYMENT_ID: optionalString,
    NOSANA_DEPLOYMENT_ENDPOINT: optionalUrl,
    NOSANA_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
    NOSANA_MAX_SCREENSHOTS: z.coerce.number().int().min(1).max(3).default(3),
    NOSANA_MAX_IMAGE_BYTES: z.coerce.number().int().min(1).max(5 * 1024 * 1024).default(5 * 1024 * 1024),
    NOSANA_REQUIRED: booleanString.default('false'),
    EVIDENCE_STORAGE_PROVIDER: z.enum(['local', 'object']).default('local'),
    EVIDENCE_LOCAL_PATH: z.string().default('./storage/evidence'),
    WORKER_EXECUTION_PROVIDER: z.enum(['local', 'daytona']).default('local'),
    DAYTONA_API_KEY: optionalString,
    DAYTONA_API_URL: optionalUrl,
    DAYTONA_TARGET: z.preprocess((value) => value === '' ? undefined : value, z.literal('eu').default('eu')),
    DAYTONA_SNAPSHOT: optionalString,
    DAYTONA_MAX_CONCURRENT_SANDBOXES: z.coerce.number().int().min(1).max(4).default(2),
    DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION: z.coerce.number().int().min(1).max(4).default(2),
    DAYTONA_MAX_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(2),
    DAYTONA_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(1_000),
    DAYTONA_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(0).max(120_000).default(10_000),
    DAYTONA_SANDBOX_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(1_800).default(300),
    DAYTONA_CLEANUP_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
    DAYTONA_FLEET_HARD_LIMIT: z.coerce.number().int().min(1).max(8).default(4),
    DAYTONA_ORPHAN_SWEEP_ENABLED: booleanString.default('true'),
    DAYTONA_ORPHAN_MAX_AGE_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(30),
    DAYTONA_MAX_TOTAL_SANDBOX_CREATIONS_PER_INVESTIGATION: z.coerce.number().int().min(1).max(20).default(8),
    DAYTONA_MAX_INVESTIGATION_DURATION_SECONDS: z.coerce.number().int().min(60).max(3_600).default(1_200),
    DAYTONA_AUTO_DELETE: booleanString.default('true'),
    DAYTONA_WORKSPACE_PATH: z.string().default('/home/daytona/taskos'),
    DAYTONA_DEMO_STORE_PATH: z.string().default('/home/daytona/taskos/demo-store'),
    DAYTONA_WORKER_PATH: z.string().default('/home/daytona/taskos/worker'),
    DAYTONA_INPUT_PATH: z.string().default('/home/daytona/taskos/input'),
    DAYTONA_EVIDENCE_PATH: z.string().default('/home/daytona/taskos/output'),
    DAYTONA_DEMO_STORE_PORT: z.coerce.number().int().min(1).max(65_535).default(4174),
    ADAPTIVE_REPRODUCTION_ENABLED: booleanString.default('true'),
    ADAPTIVE_MAX_FINDINGS_PER_INVESTIGATION: z.coerce.number().int().min(0).max(5).default(1),
    ADAPTIVE_MAX_FOLLOWUP_WORLDS: z.coerce.number().int().min(0).max(10).default(5),
    ADAPTIVE_MAX_TOTAL_WORLDS: z.coerce.number().int().min(1).max(50).default(12),
    ADAPTIVE_EXACT_REPRODUCTION_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(1),
    ADAPTIVE_CONFIDENCE_INITIAL: z.coerce.number().min(0).max(1).default(0.75),
    ADAPTIVE_CONFIDENCE_MAX: z.coerce.number().min(0).max(1).default(0.95),
    ADAPTIVE_MIN_EVIDENCE_WORLDS: z.coerce.number().int().min(1).max(10).default(2),
    ADAPTIVE_REPRODUCTION_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    MINIMISATION_ENABLED: booleanString.default('true'),
    MINIMISATION_MAX_FINDINGS_PER_INVESTIGATION: z.coerce.number().int().min(0).max(5).default(1),
    MINIMISATION_MAX_TRIALS: z.coerce.number().int().min(0).max(20).default(8),
    MINIMISATION_MAX_TOTAL_WORLDS: z.coerce.number().int().min(1).max(100).default(20),
    MINIMISATION_MAX_DURATION_SECONDS: z.coerce.number().int().min(60).max(3_600).default(1_200),
    MINIMISATION_MAX_DELAY_TRIALS: z.coerce.number().int().min(0).max(10).default(4),
    MINIMISATION_DELAY_TARGET_PRECISION_MS: z.coerce.number().int().min(1).max(5_000).default(100),
    MINIMISATION_CONFIRM_FINAL_SET: booleanString.default('true'),
    MINIMISATION_CONFIDENCE_MAX: z.coerce.number().min(0).max(1).default(0.97),
    FINAL_REPORT_ENABLED: booleanString.default('true'),
    FINAL_REPORT_CONTENT_MAX_BYTES: z.coerce.number().int().min(1).max(10_000_000).default(1_048_576),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production',
      });
    }
    if (environment.WORKER_EXECUTION_PROVIDER === 'daytona' && !environment.DAYTONA_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['DAYTONA_API_KEY'],
        message: 'DAYTONA_API_KEY is required when WORKER_EXECUTION_PROVIDER=daytona',
      });
    }
    if (environment.PLANNER_PROVIDER === 'openai' && !environment.PLANNER_FALLBACK_ENABLED && !environment.OPENAI_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when PLANNER_PROVIDER=openai and PLANNER_FALLBACK_ENABLED=false',
      });
    }
    if (environment.PLANNER_PROVIDER === 'openai' && !environment.OPENAI_PLANNER_MODEL && !environment.OPENAI_MODEL_PLANNER) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_PLANNER_MODEL'],
        message: 'OPENAI_PLANNER_MODEL is required when PLANNER_PROVIDER=openai',
      });
    }
    if (environment.PLANNER_PROVIDER === 'kimi' && !environment.PLANNER_FALLBACK_ENABLED && !environment.MOONSHOT_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['MOONSHOT_API_KEY'],
        message: 'MOONSHOT_API_KEY is required when PLANNER_PROVIDER=kimi and PLANNER_FALLBACK_ENABLED=false',
      });
    }
    if (environment.PLANNER_PROVIDER === 'AIAND') {
      if (!environment.AIAND_PLANNER_ENABLED) {
        context.addIssue({
          code: 'custom',
          path: ['AIAND_PLANNER_ENABLED'],
          message: 'AIAND_PLANNER_ENABLED must be true when PLANNER_PROVIDER=AIAND',
        });
      }
      if (!environment.AIAND_API_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['AIAND_API_KEY'],
          message: 'AIAND_API_KEY is required when PLANNER_PROVIDER=AIAND',
        });
      }
      if (!environment.AIAND_BASE_URL) {
        context.addIssue({
          code: 'custom',
          path: ['AIAND_BASE_URL'],
          message: 'AIAND_BASE_URL is required when PLANNER_PROVIDER=AIAND',
        });
      }
      if (!environment.AIAND_MODEL) {
        context.addIssue({
          code: 'custom',
          path: ['AIAND_MODEL'],
          message: 'AIAND_MODEL is required when PLANNER_PROVIDER=AIAND',
        });
      }
    }
    if (environment.NOSANA_EVIDENCE_INTELLIGENCE_ENABLED) {
      if (!environment.NOSANA_DEPLOYMENT_ID) {
        context.addIssue({ code: 'custom', path: ['NOSANA_DEPLOYMENT_ID'], message: 'NOSANA_DEPLOYMENT_ID is required when NOSANA_EVIDENCE_INTELLIGENCE_ENABLED=true' });
      }
      if (!environment.NOSANA_DEPLOYMENT_ENDPOINT) {
        context.addIssue({ code: 'custom', path: ['NOSANA_DEPLOYMENT_ENDPOINT'], message: 'NOSANA_DEPLOYMENT_ENDPOINT is required when NOSANA_EVIDENCE_INTELLIGENCE_ENABLED=true' });
      }
    }
    if (environment.DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION > environment.DAYTONA_MAX_CONCURRENT_SANDBOXES) {
      context.addIssue({
        code: 'custom',
        path: ['DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION'],
        message: 'DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION must not exceed DAYTONA_MAX_CONCURRENT_SANDBOXES',
      });
    }
    if (environment.DAYTONA_MAX_CONCURRENT_SANDBOXES > environment.DAYTONA_FLEET_HARD_LIMIT) {
      context.addIssue({
        code: 'custom',
        path: ['DAYTONA_MAX_CONCURRENT_SANDBOXES'],
        message: 'DAYTONA_MAX_CONCURRENT_SANDBOXES must not exceed DAYTONA_FLEET_HARD_LIMIT',
      });
    }
    if (environment.ADAPTIVE_CONFIDENCE_INITIAL > environment.ADAPTIVE_CONFIDENCE_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['ADAPTIVE_CONFIDENCE_INITIAL'],
        message: 'ADAPTIVE_CONFIDENCE_INITIAL must not exceed ADAPTIVE_CONFIDENCE_MAX',
      });
    }
    if (environment.ADAPTIVE_CONFIDENCE_MAX > environment.MINIMISATION_CONFIDENCE_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['MINIMISATION_CONFIDENCE_MAX'],
        message: 'MINIMISATION_CONFIDENCE_MAX must be at least ADAPTIVE_CONFIDENCE_MAX',
      });
    }
    const workspacePrefix = `${environment.DAYTONA_WORKSPACE_PATH.replace(/\/$/, '')}/`;
    for (const key of ['DAYTONA_DEMO_STORE_PATH', 'DAYTONA_WORKER_PATH', 'DAYTONA_INPUT_PATH', 'DAYTONA_EVIDENCE_PATH'] as const) {
      if (!environment[key].startsWith(workspacePrefix) || environment[key].includes('..')) {
        context.addIssue({ code: 'custom', path: [key], message: `${key} must be inside DAYTONA_WORKSPACE_PATH` });
      }
    }
  });
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  return apiEnvironmentSchema.parse(source);
}
