import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
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
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production',
      });
    }
  });
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  return apiEnvironmentSchema.parse(source);
}
