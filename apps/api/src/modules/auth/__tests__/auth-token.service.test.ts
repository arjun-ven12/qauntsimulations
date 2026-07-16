import { describe, expect, it } from 'vitest';
import { JwtAuthTokenService } from '../auth-token.service.js';
const service = new JwtAuthTokenService({
  accessSecret: 'a'.repeat(32),
  refreshSecret: 'b'.repeat(32),
  accessExpiresIn: '15m',
  refreshExpiresIn: '7d',
});
describe('JwtAuthTokenService', () => {
  it('issues and validates typed payloads', () => {
    const token = service.issueAccessToken({
      userId: 'user',
      organisationId: 'org',
      role: 'ADMIN',
      tokenVersion: 2,
    });
    expect(service.verifyAccessToken(token)).toMatchObject({
      userId: 'user',
      organisationId: 'org',
      role: 'ADMIN',
      tokenVersion: 2,
    });
  });
  it('does not accept a refresh token as access', () =>
    expect(() =>
      service.verifyAccessToken(
        service.issueRefreshToken({ userId: 'user', role: 'VIEWER', tokenVersion: 0 }),
      ),
    ).toThrow());
});
