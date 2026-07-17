import { checkoutPurchaseFlowFixture } from '../../../apps/api/src/modules/journeys/checkout-purchase-flow.fixture.js';
import {
  compileAndNormaliseSteps,
} from '../../../apps/api/src/modules/journeys/journeys.service.js';
import { encodeSteps } from '../../../apps/api/src/modules/journeys/journeys.mapper.js';
import { invariantTemplates } from '../../../apps/api/src/modules/invariants/invariants.templates.js';
import type {
  InvariantAssertion,
  InvariantTemplate,
} from '../../../apps/api/src/modules/invariants/invariants.types.js';

export const demoProductFixtureIds = {
  organisation: 'organisation_demo_taskos',
  project: 'project_demo_checkout',
  safetyPolicy: 'safety_policy_demo_checkout',
  environment: 'environment_demo_local',
  journey: 'journey_checkout',
  scenario: 'scenario_duplicate_submission',
  invariant: 'invariant_single_checkout_submission',
  orderInvariant: 'invariant_no_duplicate_order',
} as const;

export const demoProjectFixture = {
  name: 'Checkout Reliability Lab',
  description: 'A deterministic local checkout target for reliability investigations.',
  repositoryUrl: null,
} as const;

export const demoProjectSafetyFixture = {
  name: 'Canonical demo checkout safety',
  domainAllowlist: ['localhost'],
  blockedActions: [
    'Never access production.',
    'Never submit a real payment.',
    'Never modify real customer records.',
    'Never delete customer accounts.',
    'Never send outbound emails or messages.',
    'Never export data outside authorised systems.',
    'Never delete repositories or change repository settings.',
    'Never change infrastructure.',
    'Never access unrelated organisation data.',
  ],
  configuration: {
    version: 1,
    applicationUrl: 'http://localhost:5174',
    apiEndpoints: [{ label: 'Local Demo Store API', url: 'http://localhost:5174/api' }],
    webhookEndpoints: [],
    allowedHttpMethods: ['GET', 'POST', 'OPTIONS'],
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
  },
} as const;

export const demoEnvironmentFixture = {
  name: 'Local Demo Store',
  description: 'Local deterministic storefront with resettable synthetic checkout data.',
  type: 'LOCAL',
  baseUrl: 'http://localhost:5174',
  apiBaseUrl: 'http://localhost:5174/api',
  healthCheckUrl: 'http://localhost:5174/products/test-product',
  isDefault: true,
  validationStatus: 'READY',
  lastValidatedAt: new Date('2026-07-17T00:00:00.000Z'),
  configuration: {
    featureFlagEndpoint: 'http://localhost:5174/api/test/config',
    featureFlagMethod: 'POST',
    featureFlags: [
      {
        key: 'duplicateSubmissionBug',
        type: 'BOOLEAN',
        value: false,
        description: 'Controls the deterministic duplicate-submission defect.',
      },
      {
        key: 'paymentDelayMs',
        type: 'NUMBER',
        value: 0,
        description: 'Controls the mock payment response delay in milliseconds.',
      },
    ],
    payment: {
      mode: 'MOCK',
      delayMs: 0,
      result: 'SUCCESS',
      retryEnabled: false,
      maxRetries: 0,
    },
    reset: {
      mode: 'HTTP_ENDPOINT',
      endpoint: 'http://localhost:5174/api/test/reset',
      method: 'POST',
      credentialReference: null,
      timeoutMs: 10_000,
      expectedStatus: 200,
      beforeEachWorld: true,
      afterEachWorld: false,
      procedure: null,
      scriptReference: null,
    },
    testData: {
      customerCredentialReference: null,
      productIdentifier: 'test-product',
      initialInventory: 5,
      seedProfile: 'demo-store-default',
      orderCleanup: 'POST /api/test/reset',
      isolation: 'RESET_BEFORE_WORLD',
    },
    credentialReferences: [],
    allowedActions: [
      'NAVIGATE_APPLICATION',
      'READ_APPLICATION_STATE',
      'SUBMIT_FORMS',
      'PERFORM_CHECKOUT',
      'SUBMIT_MOCK_PAYMENT',
      'CREATE_TEST_ORDER',
      'RESET_TEST_DATA',
      'CHANGE_FEATURE_FLAGS',
      'CAPTURE_SCREENSHOTS',
      'CAPTURE_TRACES',
      'RECORD_NETWORK_TRAFFIC',
    ],
    validationResults: [
      {
        key: 'safety',
        label: 'Project Safety compatibility',
        status: 'PASS',
        message: 'Environment configuration is within the Project Safety boundary.',
      },
      {
        key: 'base-url',
        label: 'Base URL',
        status: 'PASS',
        message: 'Base URL is valid.',
      },
      {
        key: 'remote',
        label: 'Remote accessibility',
        status: 'WARNING',
        message: 'Local-only: available from this machine, but not remotely reachable by Daytona workers.',
      },
    ],
  },
  manifest: {},
} as const;

const canonicalJourney = checkoutPurchaseFlowFixture(demoProductFixtureIds.environment);
const canonicalJourneySteps = compileAndNormaliseSteps(canonicalJourney.steps);

export const demoCheckoutJourneyFixture = {
  ...canonicalJourney,
  state: 'ENABLED',
  validationStatus: 'READY',
  steps: canonicalJourneySteps,
} as const;

export const demoCheckoutJourneySteps = encodeSteps(demoCheckoutJourneyFixture).map(
  (step, index) => ({
    id: `journey_checkout_step_${String(index + 1).padStart(2, '0')}`,
    ...step,
  }),
);

const paymentTemplate = requiredTemplate('NO_DUPLICATE_PAYMENT');
const orderTemplate = requiredTemplate('NO_DUPLICATE_ORDER');

export const demoInvariantFixtures = [
  invariantFixture(demoProductFixtureIds.invariant, paymentTemplate),
  invariantFixture(demoProductFixtureIds.orderInvariant, orderTemplate),
] as const;

export const demoScenarioFixture = {
  name: 'Delayed duplicate checkout',
  prompt:
    'Test the checkout flow under delayed payment responses and repeated user interaction. Verify that one checkout never creates duplicate payments or duplicate orders.',
  controls: {},
} as const;

function requiredTemplate(type: InvariantAssertion['type']): InvariantTemplate {
  const template = invariantTemplates.find((candidate) => candidate.type === type);
  if (!template) throw new Error(`Required canonical Invariant template is missing: ${type}`);
  return template;
}

function invariantFixture(id: string, template: InvariantTemplate) {
  return {
    id,
    name: template.displayName,
    description: template.description,
    assertion: {
      type: template.type,
      severity: template.suggestedSeverity,
      enabled: true,
      config: template.configuration,
    } as InvariantAssertion,
  };
}
