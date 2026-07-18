import { describe, expect, it } from 'vitest';
import { apiEnvironmentSchema } from '../env.js';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://example.invalid/taskos',
  DIRECT_URL: 'postgresql://example.invalid/taskos',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
};

describe('API environment security', () => {
  it('rejects production configuration without secure cookies', () => {
    const result = apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.COOKIE_SECURE).toContain(
        'COOKIE_SECURE must be true in production',
      );
    }
  });

  it('accepts production configuration with secure cookies and no fallback secrets', () => {
    const result = apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
    });

    expect(result.success).toBe(true);
  });

  it('does not require Daytona credentials in local mode', () => {
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, WORKER_EXECUTION_PROVIDER: 'local' }).success).toBe(true);
  });

  it('validates Daytona fleet limits', () => {
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      WORKER_EXECUTION_PROVIDER: 'daytona',
      DAYTONA_API_KEY: 'test-key',
      DAYTONA_MAX_CONCURRENT_SANDBOXES: '2',
      DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION: '2',
      DAYTONA_FLEET_HARD_LIMIT: '4',
    }).success).toBe(true);
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      WORKER_EXECUTION_PROVIDER: 'daytona',
      DAYTONA_API_KEY: 'test-key',
      DAYTONA_MAX_CONCURRENT_SANDBOXES: '2',
      DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION: '3',
    }).success).toBe(false);
  });

  it('requires Daytona credentials only in Daytona mode and rejects the unsupported US target', () => {
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, WORKER_EXECUTION_PROVIDER: 'daytona' }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, WORKER_EXECUTION_PROVIDER: 'daytona', DAYTONA_API_KEY: 'test-key', DAYTONA_TARGET: 'eu' }).success).toBe(true);
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, WORKER_EXECUTION_PROVIDER: 'daytona', DAYTONA_API_KEY: 'test-key', DAYTONA_TARGET: 'us' }).success).toBe(false);
  });

  it('validates adaptive reproduction confidence limits', () => {
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      ADAPTIVE_REPRODUCTION_ENABLED: 'true',
      ADAPTIVE_CONFIDENCE_INITIAL: '0.75',
      ADAPTIVE_CONFIDENCE_MAX: '0.95',
    }).success).toBe(true);
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      ADAPTIVE_CONFIDENCE_INITIAL: '0.96',
      ADAPTIVE_CONFIDENCE_MAX: '0.95',
    }).success).toBe(false);
  });

  it('validates minimisation defaults and confidence limits', () => {
    const parsed = apiEnvironmentSchema.parse(requiredEnvironment);
    expect(parsed.MINIMISATION_ENABLED).toBe(true);
    expect(parsed.MINIMISATION_MAX_TRIALS).toBe(8);
    expect(parsed.FINAL_REPORT_ENABLED).toBe(true);
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      ADAPTIVE_CONFIDENCE_MAX: '0.95',
      MINIMISATION_CONFIDENCE_MAX: '0.94',
    }).success).toBe(false);
  });

  it('defaults to deterministic planning and permits fallback without OpenAI credentials', () => {
    const result = apiEnvironmentSchema.parse(requiredEnvironment);
    expect(result.PLANNER_PROVIDER).toBe('deterministic');
    expect(result.PLANNER_FALLBACK_ENABLED).toBe(true);
  });

  it('requires OpenAI credentials only in strict OpenAI planner mode', () => {
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      PLANNER_PROVIDER: 'openai',
      PLANNER_FALLBACK_ENABLED: 'true',
    }).success).toBe(true);
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      PLANNER_PROVIDER: 'openai',
      PLANNER_FALLBACK_ENABLED: 'false',
    }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      PLANNER_PROVIDER: 'openai',
      PLANNER_FALLBACK_ENABLED: 'false',
      OPENAI_API_KEY: 'test-key',
      OPENAI_PLANNER_MODEL: 'gpt-5-mini',
    }).success).toBe(true);
  });

  it('validates explicit Kimi planner configuration and safe defaults', () => {
    const configured = apiEnvironmentSchema.parse({
      ...requiredEnvironment,
      PLANNER_PROVIDER: 'kimi',
      PLANNER_FALLBACK_ENABLED: 'false',
      MOONSHOT_API_KEY: 'test-key',
      KIMI_MODEL: 'sponsor-kimi-model',
    });
    expect(configured.KIMI_BASE_URL).toBe('https://api.moonshot.ai/v1');
    expect(configured.KIMI_MODEL).toBe('sponsor-kimi-model');
    expect(configured.KIMI_TIMEOUT_MS).toBe(60_000);
    expect(Object.keys(configured)).not.toContain('PUBLIC_MOONSHOT_API_KEY');
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      PLANNER_PROVIDER: 'kimi',
      PLANNER_FALLBACK_ENABLED: 'false',
    }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      PLANNER_PROVIDER: 'kimi',
      PLANNER_FALLBACK_ENABLED: 'false',
      MOONSHOT_API_KEY: 'test-key',
      KIMI_TIMEOUT_MS: '121000',
    }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, PLANNER_PROVIDER: 'unknown' }).success).toBe(false);
  });

  it('does not select Kimi merely because its key exists', () => {
    expect(apiEnvironmentSchema.parse({ ...requiredEnvironment, MOONSHOT_API_KEY: 'test-key' }).PLANNER_PROVIDER).toBe('deterministic');
  });

  it('keeps Nosana evidence intelligence disabled by default and validates bounded activation', () => {
    const defaults = apiEnvironmentSchema.parse(requiredEnvironment);
    expect(defaults.NOSANA_EVIDENCE_INTELLIGENCE_ENABLED).toBe(false);
    expect(defaults.NOSANA_REQUIRED).toBe(false);
    expect(defaults.NOSANA_MAX_SCREENSHOTS).toBe(3);
    expect(defaults.NOSANA_MAX_IMAGE_BYTES).toBe(5_242_880);
    expect(defaults).not.toHaveProperty('NOSANA_KEY_PATH');

    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      NOSANA_EVIDENCE_INTELLIGENCE_ENABLED: 'true',
    }).success).toBe(false);

    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      NOSANA_EVIDENCE_INTELLIGENCE_ENABLED: 'true',
      NOSANA_DEPLOYMENT_ID: 'deployment_123',
      NOSANA_DEPLOYMENT_ENDPOINT: 'https://taskos-nosana.example.com',
      NOSANA_REQUEST_TIMEOUT_MS: '60000',
      NOSANA_MAX_SCREENSHOTS: '3',
      NOSANA_MAX_IMAGE_BYTES: '5242880',
    }).success).toBe(true);

    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      NOSANA_MAX_SCREENSHOTS: '4',
    }).success).toBe(false);
  });
});
