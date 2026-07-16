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
});
