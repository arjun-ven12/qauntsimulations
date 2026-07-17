import type { Environment } from '../../services/environment-api.js';
import type { Invariant } from '../invariants/invariant-api.js';
import type { Journey } from '../journeys/journey-api.js';
import type { ScenarioLaunchInput } from './scenario-api.js';

export function validScenario(): ScenarioLaunchInput {
  return {
    environmentId: 'environment-1',
    journeyId: 'journey-1',
    invariantIds: ['invariant-payment', 'invariant-order'],
    scenario: {
      prompt:
        'Test checkout under delayed payment responses and repeated user interaction without duplicate outcomes.',
      controls: {
        browsers: ['chromium'],
        viewports: ['desktop-1440x900', 'mobile-390x844'],
        networkProfiles: ['normal', 'delayed-payment'],
        maximumWorlds: 4,
        maximumConcurrentWorkers: 2,
      },
    },
  };
}

export function environment(overrides: Partial<Environment> = {}): Environment {
  return {
    id: 'environment-1',
    projectId: 'project-1',
    name: 'Checkout staging',
    description: null,
    type: 'STAGING',
    baseUrl: 'https://staging.example.com',
    apiBaseUrl: null,
    healthCheckUrl: null,
    isDefault: true,
    validationStatus: 'READY',
    lastValidatedAt: null,
    featureFlags: [],
    paymentConfiguration: {
      mode: 'MOCK', delayMs: 0, result: 'SUCCESS', retryEnabled: false, maxRetries: 0,
    },
    resetConfiguration: {
      mode: 'NONE', endpoint: null, method: 'POST', credentialReference: null, timeoutMs: 30_000,
      expectedStatus: 200, beforeEachWorld: false, afterEachWorld: false, procedure: null,
      scriptReference: null,
    },
    testDataConfiguration: {
      customerCredentialReference: null, productIdentifier: 'test-product', initialInventory: 10,
      seedProfile: null, orderCleanup: null, isolation: 'RESET_BEFORE_WORLD',
    },
    credentialReferences: [],
    allowedActions: [],
    validationResults: [],
    configuration: {
      featureFlagEndpoint: null,
      featureFlagMethod: 'GET',
      featureFlags: [],
      payment: { mode: 'MOCK', delayMs: 0, result: 'SUCCESS', retryEnabled: false, maxRetries: 0 },
      reset: {
        mode: 'NONE', endpoint: null, method: 'POST', credentialReference: null, timeoutMs: 30_000,
        expectedStatus: 200, beforeEachWorld: false, afterEachWorld: false, procedure: null,
        scriptReference: null,
      },
      testData: {
        customerCredentialReference: null, productIdentifier: 'test-product', initialInventory: 10,
        seedProfile: null, orderCleanup: null, isolation: 'RESET_BEFORE_WORLD',
      },
      credentialReferences: [], allowedActions: [], validationResults: [],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function journey(overrides: Partial<Journey> = {}): Journey {
  return {
    id: 'journey-1',
    projectId: 'project-1',
    name: 'Checkout journey',
    description: null,
    environmentId: 'environment-1',
    startPath: '/products/test-product',
    state: 'ENABLED',
    completionCondition: { type: 'VISIBLE', selector: '[data-testid="order-id"]' },
    validationStatus: 'READY',
    steps: [
      { id: 'step-1', order: 0, action: 'GOTO', selector: null, value: '/', metadata: {} },
      { id: 'step-2', order: 1, action: 'CLICK', selector: '[data-testid="pay-button"]', value: null, metadata: {} },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function invariant(
  id: string,
  type: 'NO_DUPLICATE_PAYMENT' | 'NO_DUPLICATE_ORDER',
  overrides: Partial<Invariant> = {},
): Invariant {
  return {
    id,
    projectId: 'project-1',
    name: type === 'NO_DUPLICATE_PAYMENT' ? 'No duplicate payment' : 'No duplicate order',
    description: 'A checkout must not produce duplicate outcomes.',
    type,
    configuration: { requestPatterns: ['/api/checkout'], methods: ['POST'] },
    severity: type === 'NO_DUPLICATE_PAYMENT' ? 'CRITICAL' : 'HIGH',
    enabled: true,
    validationStatus: 'READY',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
