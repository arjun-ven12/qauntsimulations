import { describe, expect, it } from 'vitest';
import { demoCreateInvestigationInput } from '@taskos/shared-types';
import { InvestigationRepository } from '../investigations.repository.js';

const createdAt = new Date('2026-07-17T00:00:00.000Z');

function database(overrides: {
  role?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | null;
  environment?: Partial<ReturnType<typeof environment>>;
  journey?: Partial<ReturnType<typeof journey>>;
  invariants?: Array<Partial<ReturnType<typeof invariant>>>;
  safety?: Record<string, unknown>;
} = {}) {
  const project = {
    id: demoCreateInvestigationInput.projectId,
    name: 'Project',
    safetyPolicies: [{
      id: 'safety',
      domainAllowlist: ['localhost'],
      blockedActions: [],
      configuration: overrides.safety ?? safety(),
    }],
  };
  return {
    organisationMember: {
      findFirst: async () => overrides.role === null ? null : { role: overrides.role ?? 'OWNER' },
    },
    project: {
      findFirst: async () => project,
    },
    environment: {
      findFirst: async () => ({ ...environment(), ...overrides.environment }),
    },
    journey: {
      findFirst: async () => ({ ...journey(), ...overrides.journey }),
    },
    invariant: {
      findMany: async () => (overrides.invariants ?? [paymentInvariant(), orderInvariant()]).map((item, index) => ({
        ...(index === 0 ? paymentInvariant() : orderInvariant()),
        ...item,
      })),
    },
  };
}

describe('InvestigationRepository launch validation', () => {
  it('maps persisted Environment, Journey, and Invariants into a launch snapshot', async () => {
    const scope = await new InvestigationRepository(database() as never).validateCreationScope(
      'organisation',
      'user-owner',
      { ...demoCreateInvestigationInput, invariantIds: ['payment', 'order'] },
    );

    expect(scope?.launch.inputSource).toBe('PERSISTED_CONFIGURATION');
    expect(scope?.scenarioId).toMatch(/^scenario_launch_/);
    expect(scope?.launch.environment.baseUrl).toBe('http://localhost:5174');
    expect(scope?.launch.journey.id).toBe(demoCreateInvestigationInput.journeyId);
    expect(scope?.launch.journey.steps.map((step) => step.type)).toEqual(['goto', 'click', 'fill', 'waitFor', 'assertVisible']);
    expect(scope?.launch.invariants.map(({ id }) => id)).toEqual(['payment', 'order']);
    expect(scope?.launch.safety.permitMockPayment).toBe(true);
  });

  it('rejects viewers before creating a runnable investigation', async () => {
    await expect(
      new InvestigationRepository(database({ role: 'VIEWER' }) as never).validateCreationScope(
        'organisation',
        'viewer',
        { ...demoCreateInvestigationInput, invariantIds: ['payment'] },
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_PERMISSION', statusCode: 403 });
  });

  it('rejects disabled persisted Invariants instead of dropping them', async () => {
    await expect(
      new InvestigationRepository(database({ invariants: [{ assertion: { ...paymentInvariant().assertion, enabled: false } }] }) as never).validateCreationScope(
        'organisation',
        'user-owner',
        { ...demoCreateInvestigationInput, invariantIds: ['payment'] },
      ),
    ).rejects.toMatchObject({ code: 'INVARIANT_DISABLED', statusCode: 422 });
  });

  it('blocks launch when Project Safety does not permit checkout actions', async () => {
    await expect(
      new InvestigationRepository(database({ safety: { ...safety(), permitCheckoutSubmission: false } }) as never).validateCreationScope(
        'organisation',
        'user-owner',
        { ...demoCreateInvestigationInput, invariantIds: ['payment'] },
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_SAFETY_BLOCKED', statusCode: 403 });
  });
});

function safety() {
  return {
    version: 1,
    applicationUrl: 'http://localhost:5174',
    apiEndpoints: [],
    webhookEndpoints: [],
    allowedHttpMethods: ['GET', 'POST'],
    permitCheckoutSubmission: true,
    permitMockPayment: true,
    permitOrderCreation: true,
    restrictions: {
      testEnvironmentsOnly: true,
      productionAccess: false,
      realPayments: false,
      destructiveAccountActions: false,
      externalDataExport: false,
      realCustomerChanges: false,
      externalMessaging: false,
      repositoryDeletion: false,
      infrastructureChanges: false,
      crossOrganisationAccess: false,
      unknownDomains: false,
    },
    acknowledgedAt: '2026-07-17T00:00:00.000Z',
  };
}

function environment() {
  return {
    id: demoCreateInvestigationInput.environmentId,
    name: 'Local Demo Store',
    type: 'DEMO',
    baseUrl: 'http://localhost:5174',
    apiBaseUrl: null,
    validationStatus: 'READY',
    configuration: {
      reset: { mode: 'HTTP_ENDPOINT', endpoint: '/api/test/reset', method: 'POST', beforeEachWorld: true },
      payment: { mode: 'MOCK' },
      allowedActions: ['PERFORM_CHECKOUT', 'SUBMIT_MOCK_PAYMENT', 'CREATE_TEST_ORDER'],
    },
  };
}

function journey() {
  return {
    id: demoCreateInvestigationInput.journeyId,
    projectId: demoCreateInvestigationInput.projectId,
    name: 'Checkout',
    description: null,
    createdAt,
    updatedAt: createdAt,
    steps: [
      {
        id: 'step-1',
        order: 0,
        action: 'GOTO',
        selector: null,
        value: '/products/test-product',
        metadata: {
          taskosJourney: {
            version: 1,
            environmentId: demoCreateInvestigationInput.environmentId,
            startPath: '/products/test-product',
            state: 'ENABLED',
            validationStatus: 'READY',
            completionCondition: { type: 'VISIBLE', selector: '[data-testid="order-confirmation"]' },
          },
        },
      },
      { id: 'step-2', order: 1, action: 'CLICK', selector: '[data-testid="pay-button"]', value: null, metadata: {} },
      { id: 'step-3', order: 2, action: 'FILL', selector: '[data-testid="email-input"]', value: 'test@taskos.dev', metadata: {} },
      { id: 'step-4', order: 3, action: 'WAIT_FOR', selector: '[data-testid="payment-status"]', value: null, metadata: { expectedState: 'VISIBLE', timeoutMs: 1000 } },
      { id: 'step-5', order: 4, action: 'ASSERT_VISIBLE', selector: '[data-testid="order-confirmation"]', value: null, metadata: {} },
    ],
  };
}

function paymentInvariant() {
  return invariant('payment', 'NO_DUPLICATE_PAYMENT', ['/api/payments']);
}

function orderInvariant() {
  return invariant('order', 'NO_DUPLICATE_ORDER', ['/api/orders']);
}

function invariant(id: string, type: 'NO_DUPLICATE_PAYMENT' | 'NO_DUPLICATE_ORDER', requestPatterns: string[]) {
  return {
    id,
    organisationId: 'organisation',
    projectId: demoCreateInvestigationInput.projectId,
    name: id,
    description: 'A valid plain language invariant description.',
    assertion: {
      type,
      severity: 'CRITICAL',
      enabled: true,
      config: { requestPatterns, methods: ['POST'] },
    },
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}
