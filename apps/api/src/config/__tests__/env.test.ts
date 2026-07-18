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

  it('validates explicit ai& planner configuration with exact environment names', () => {
    const configured = apiEnvironmentSchema.parse({
      ...requiredEnvironment,
      PLANNER_PROVIDER: 'AIAND',
      AIAND_API_KEY: 'test-key',
      AIAND_BASE_URL: 'https://api.aiand.com/v1',
      AIAND_MODEL: 'moonshotai/kimi-k2.7-code',
      AIAND_API_SURFACE: 'CHAT_COMPLETIONS',
      AIAND_STREAMING_ENABLED: 'true',
      AIAND_REQUEST_TIMEOUT_MS: '240000',
      AIAND_IDLE_TIMEOUT_MS: '45000',
      AIAND_MAX_COMPLETION_TOKENS: '6000',
      AIAND_REASONING_EFFORT: 'none',
      AIAND_PLANNER_ENABLED: 'true',
    });
    expect(configured.PLANNER_PROVIDER).toBe('AIAND');
    expect(configured.AIAND_BASE_URL).toBe('https://api.aiand.com/v1');
    expect(configured.AIAND_MODEL).toBe('moonshotai/kimi-k2.7-code');
    expect(configured.AIAND_API_SURFACE).toBe('CHAT_COMPLETIONS');
    expect(configured.AIAND_STREAMING_ENABLED).toBe(true);
    expect(configured.AIAND_REQUEST_TIMEOUT_MS).toBe(240_000);
    expect(configured.AIAND_IDLE_TIMEOUT_MS).toBe(45_000);
    expect(configured.AIAND_MAX_COMPLETION_TOKENS).toBe(6_000);
    expect(configured.AIAND_REASONING_EFFORT).toBe('none');
    expect(configured.AIAND_PLANNER_ENABLED).toBe(true);
    expect(Object.keys(configured)).not.toContain('PUBLIC_AIAND_API_KEY');
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, PLANNER_PROVIDER: 'AIAND', AIAND_PLANNER_ENABLED: 'true' }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, PLANNER_PROVIDER: 'AIAND', AIAND_API_KEY: 'test-key', AIAND_PLANNER_ENABLED: 'false' }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, PLANNER_PROVIDER: 'AIAND', AIAND_API_KEY: 'test-key', AIAND_BASE_URL: 'http://api.aiand.com/v1', AIAND_PLANNER_ENABLED: 'true' }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, PLANNER_PROVIDER: 'AIAND', AIAND_API_KEY: 'test-key', AIAND_PLANNER_ENABLED: 'true', AIAND_REQUEST_TIMEOUT_MS: '301000' }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, PLANNER_PROVIDER: 'AIAND', AIAND_API_KEY: 'test-key', AIAND_PLANNER_ENABLED: 'true', AIAND_API_SURFACE: 'RESPONSES' }).success).toBe(false);
    expect(apiEnvironmentSchema.safeParse({ ...requiredEnvironment, PLANNER_PROVIDER: 'AIAND', AIAND_API_KEY: 'test-key', AIAND_PLANNER_ENABLED: 'true', AIAND_REASONING_EFFORT: 'max' }).success).toBe(false);
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

  it('keeps Oxylabs environment intelligence disabled by default and validates safe activation', () => {
    const defaults = apiEnvironmentSchema.parse(requiredEnvironment);
    expect(defaults.OXYLABS_ENABLED).toBe(false);
    expect(defaults.OXYLABS_REQUIRED).toBe(false);
    expect(defaults.OXYLABS_BASE_URL).toBe('https://realtime.oxylabs.io/v1/queries');
    expect(defaults.OXYLABS_SOURCE).toBe('universal');
    expect(defaults.OXYLABS_RENDER_MODE).toBe('html');
    expect(defaults.OXYLABS_REQUEST_TIMEOUT_MS).toBe(120_000);
    expect(defaults).not.toHaveProperty('PUBLIC_OXYLABS_PASSWORD');

    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      OXYLABS_ENABLED: 'true',
    }).success).toBe(false);

    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      OXYLABS_ENABLED: 'true',
      OXYLABS_USERNAME: 'user',
      OXYLABS_PASSWORD: 'password',
      OXYLABS_BASE_URL: 'https://realtime.oxylabs.io/v1/queries',
      OXYLABS_SOURCE: 'universal',
      OXYLABS_REQUEST_TIMEOUT_MS: '120000',
      OXYLABS_RENDER_MODE: 'html',
      OXYLABS_REQUIRED: 'false',
    }).success).toBe(true);

    expect(apiEnvironmentSchema.safeParse({
      ...requiredEnvironment,
      OXYLABS_BASE_URL: 'http://realtime.oxylabs.io/v1/queries',
    }).success).toBe(false);
  });
});
