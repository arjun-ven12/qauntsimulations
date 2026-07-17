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
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    OPENAI_MODEL_PLANNER: z.string().default('gpt-5-mini'),
    OPENAI_MODEL_EXPLANATION: z.string().default('gpt-5-mini'),
    OPENAI_MODEL_VISION: z.string().default('gpt-5-mini'),
    KIMI_API_KEY: z.string().optional(),
    KIMI_BASE_URL: z.string().url().default('https://api.moonshot.ai/v1'),
    KIMI_MODEL: z.string().optional(),
    EVIDENCE_STORAGE_PROVIDER: z.enum(['local', 'object']).default('local'),
    EVIDENCE_LOCAL_PATH: z.string().default('./storage/evidence'),
    WORKER_EXECUTION_PROVIDER: z.enum(['local', 'daytona']).default('local'),
    DAYTONA_API_KEY: optionalString,
    DAYTONA_API_URL: optionalUrl,
    DAYTONA_TARGET: z.preprocess((value) => value === '' ? undefined : value, z.literal('eu').default('eu')),
    DAYTONA_SNAPSHOT: optionalString,
    DAYTONA_MAX_CONCURRENT_SANDBOXES: z.coerce.number().int().min(1).max(1).default(1),
    DAYTONA_SANDBOX_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(1_800).default(300),
    DAYTONA_AUTO_DELETE: booleanString.default('true'),
    DAYTONA_WORKSPACE_PATH: z.string().default('/home/daytona/taskos'),
    DAYTONA_DEMO_STORE_PATH: z.string().default('/home/daytona/taskos/demo-store'),
    DAYTONA_WORKER_PATH: z.string().default('/home/daytona/taskos/worker'),
    DAYTONA_INPUT_PATH: z.string().default('/home/daytona/taskos/input'),
    DAYTONA_EVIDENCE_PATH: z.string().default('/home/daytona/taskos/output'),
    DAYTONA_DEMO_STORE_PORT: z.coerce.number().int().min(1).max(65_535).default(4174),
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
