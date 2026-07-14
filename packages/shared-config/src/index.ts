import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

export const sharedEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AI_PROVIDER: z.enum(['openai', 'kimi', 'mock']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL_PLANNER: z.string().default('gpt-5-mini'),
  OPENAI_MODEL_EXPLANATION: z.string().default('gpt-5-mini'),
  OPENAI_MODEL_VISION: z.string().default('gpt-5-mini'),
  KIMI_API_KEY: z.string().optional(),
  KIMI_BASE_URL: z.string().url().default('https://api.moonshot.ai/v1'),
  KIMI_MODEL: z.string().optional(),
  NOSANA_ENABLED: booleanString.default('false'),
  DAYTONA_MAX_CONCURRENT_SANDBOXES: z.coerce.number().int().positive().default(4),
  DAYTONA_SANDBOX_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(900),
});

export type SharedEnvironment = z.infer<typeof sharedEnvironmentSchema>;
