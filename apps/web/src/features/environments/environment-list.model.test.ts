import { describe, expect, it } from 'vitest';
import type { Environment } from '../../services/environment-api.js';
import {
  connectionCompleteness,
  environmentListSummary,
  resetSchedule,
  validationResultSummary,
} from './environment-list.model.js';

describe('Environment list operational summaries', () => {
  it('counts readiness, defaults, and attention from persisted statuses', () => {
    expect(
      environmentListSummary([
        environment({ validationStatus: 'READY', isDefault: true }),
        environment({ validationStatus: 'NOT_VALIDATED', isDefault: false }),
        environment({ validationStatus: 'INVALID', isDefault: false }),
      ]),
    ).toEqual({ total: 3, ready: 1, defaults: 1, attention: 2 });
  });

  it('derives connection, reset, and validation details without inventing metrics', () => {
    const item = environment({
      apiBaseUrl: 'https://api.staging.example.test',
      healthCheckUrl: null,
      resetConfiguration: {
        ...environment().resetConfiguration,
        mode: 'HTTP_ENDPOINT',
        beforeEachWorld: true,
      },
      validationResults: [
        { key: 'base', label: 'Base URL', status: 'PASS', message: 'Reachable' },
        { key: 'health', label: 'Health check', status: 'WARNING', message: 'Not configured' },
      ],
    });

    expect(connectionCompleteness(item)).toBe(2);
    expect(resetSchedule(item)).toBe('Before each World');
    expect(validationResultSummary(item)).toBe('1 passed · 1 warning');
  });
});

function environment(overrides: Partial<Environment> = {}): Environment {
  const resetConfiguration: Environment['resetConfiguration'] = {
    mode: 'NONE',
    endpoint: null,
    method: 'POST',
    credentialReference: null,
    timeoutMs: 30_000,
    expectedStatus: 200,
    beforeEachWorld: false,
    afterEachWorld: false,
    procedure: null,
    scriptReference: null,
  };
  const paymentConfiguration: Environment['paymentConfiguration'] = {
    mode: 'MOCK',
    delayMs: 0,
    result: 'SUCCESS',
    retryEnabled: false,
    maxRetries: 0,
  };
  const testDataConfiguration: Environment['testDataConfiguration'] = {
    customerCredentialReference: null,
    productIdentifier: null,
    initialInventory: 0,
    seedProfile: null,
    orderCleanup: null,
    isolation: 'RESET_BEFORE_WORLD',
  };
  return {
    id: 'environment-1',
    projectId: 'project-1',
    name: 'Checkout staging',
    description: null,
    type: 'STAGING',
    baseUrl: 'https://staging.example.test',
    apiBaseUrl: null,
    healthCheckUrl: null,
    isDefault: false,
    validationStatus: 'READY',
    lastValidatedAt: null,
    featureFlags: [],
    paymentConfiguration,
    resetConfiguration,
    testDataConfiguration,
    credentialReferences: [],
    allowedActions: [],
    validationResults: [],
    configuration: {
      featureFlagEndpoint: null,
      featureFlagMethod: 'GET',
      featureFlags: [],
      payment: paymentConfiguration,
      reset: resetConfiguration,
      testData: testDataConfiguration,
      credentialReferences: [],
      allowedActions: [],
      validationResults: [],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}
