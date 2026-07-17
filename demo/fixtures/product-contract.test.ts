import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { environmentInputSchema } from '../../apps/api/src/modules/environments/environments.schema.js';
import {
  mapInvariant,
  mapPersistedInvariantToRuntimeDefinition,
} from '../../apps/api/src/modules/invariants/invariants.mapper.js';
import { persistedInvariantAssertionSchema } from '../../apps/api/src/modules/invariants/invariants.schema.js';
import type { InvariantRecord } from '../../apps/api/src/modules/invariants/invariants.types.js';
import {
  mapJourney,
  readJourneyConfiguration,
  toRuntimeJourney,
} from '../../apps/api/src/modules/journeys/journeys.mapper.js';
import type { JourneyRecord } from '../../apps/api/src/modules/journeys/journeys.types.js';
import { parseSafetyConfiguration } from '../../apps/api/src/modules/projects/projects.mapper.js';
import {
  demoCheckoutJourneyFixture,
  demoCheckoutJourneySteps,
  demoEnvironmentFixture,
  demoInvariantFixtures,
  demoProductFixtureIds,
  demoProjectFixture,
  demoProjectSafetyFixture,
  demoScenarioFixture,
} from '../../packages/database/prisma/demo-fixtures.js';

describe('canonical deterministic Product demo fixtures', () => {
  it('preserves every approved deterministic ID', () => {
    expect(demoProductFixtureIds).toEqual({
      organisation: 'organisation_demo_taskos',
      project: 'project_demo_checkout',
      safetyPolicy: 'safety_policy_demo_checkout',
      environment: 'environment_demo_local',
      journey: 'journey_checkout',
      scenario: 'scenario_duplicate_submission',
      invariant: 'invariant_single_checkout_submission',
      orderInvariant: 'invariant_no_duplicate_order',
    });
  });

  it('defines the Checkout Reliability Lab with restrictive current Project Safety', () => {
    expect(demoProjectFixture.name).toBe('Checkout Reliability Lab');
    expect(demoProjectSafetyFixture).toMatchObject({
      name: 'Canonical demo checkout safety',
      domainAllowlist: ['localhost'],
      configuration: {
        applicationUrl: 'http://localhost:5174',
        allowedHttpMethods: ['GET', 'POST', 'OPTIONS'],
        permitCheckoutSubmission: true,
        permitMockPayment: true,
        permitOrderCreation: true,
        restrictions: {
          testEnvironmentsOnly: true,
          productionAccess: false,
          realPayments: false,
          destructiveAccountActions: false,
          unknownDomains: false,
        },
      },
    });
    expect(new URL(demoProjectSafetyFixture.configuration.applicationUrl).host).toBe(
      'localhost:5174',
    );
    expect(demoProjectSafetyFixture.blockedActions).toEqual(
      expect.arrayContaining([
        'Never access production.',
        'Never submit a real payment.',
        'Never delete customer accounts.',
        'Never change infrastructure.',
      ]),
    );
    expect(parseSafetyConfiguration(demoProjectSafetyFixture.configuration)).toMatchObject({
      permitCheckoutSubmission: true,
      permitMockPayment: true,
      permitTestOrderCreation: true,
    });
  });

  it('defines the default READY Local Demo Store with canonical endpoints and actions', () => {
    expect(demoEnvironmentFixture).toMatchObject({
      name: 'Local Demo Store',
      type: 'LOCAL',
      baseUrl: 'http://localhost:5174',
      apiBaseUrl: 'http://localhost:5174/api',
      healthCheckUrl: 'http://localhost:5174/products/test-product',
      isDefault: true,
      validationStatus: 'READY',
      configuration: {
        featureFlagEndpoint: 'http://localhost:5174/api/test/config',
        payment: { mode: 'MOCK', delayMs: 0, retryEnabled: false, maxRetries: 0 },
        reset: {
          mode: 'HTTP_ENDPOINT',
          endpoint: 'http://localhost:5174/api/test/reset',
          beforeEachWorld: true,
        },
        testData: {
          productIdentifier: 'test-product',
          initialInventory: 5,
          isolation: 'RESET_BEFORE_WORLD',
        },
      },
    });
    expect(demoEnvironmentFixture.configuration.credentialReferences).toEqual([]);
    expect(demoEnvironmentFixture.configuration.allowedActions).toEqual([
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
    ]);
    expect(demoEnvironmentFixture.configuration.validationResults).toContainEqual(
      expect.objectContaining({ key: 'remote', status: 'WARNING' }),
    );

    const { validationResults: _validationResults, ...configuration } =
      demoEnvironmentFixture.configuration;
    expect(
      environmentInputSchema.parse({
        name: demoEnvironmentFixture.name,
        description: demoEnvironmentFixture.description,
        type: demoEnvironmentFixture.type,
        baseUrl: demoEnvironmentFixture.baseUrl,
        apiBaseUrl: demoEnvironmentFixture.apiBaseUrl,
        healthCheckUrl: demoEnvironmentFixture.healthCheckUrl,
        isDefault: demoEnvironmentFixture.isDefault,
        configuration,
        acknowledgement: true,
      }),
    ).toBeDefined();
  });

  it('compiles the canonical Builder Journey into 12 READY executable persisted steps', () => {
    const record = journeyRecord();
    const configuration = readJourneyConfiguration(record);
    const mapped = mapJourney(record);

    expect(demoCheckoutJourneyFixture.name).toBe('Checkout Purchase Flow');
    expect(demoCheckoutJourneySteps).toHaveLength(12);
    expect(demoCheckoutJourneySteps.map((step) => step.order)).toEqual(
      Array.from({ length: 12 }, (_, index) => index),
    );
    expect(configuration).toEqual({
      version: 1,
      environmentId: demoProductFixtureIds.environment,
      startPath: '/products/test-product',
      state: 'ENABLED',
      completionCondition: { type: 'VISIBLE', selector: '[data-testid="order-id"]' },
      validationStatus: 'READY',
    });
    expect(mapped).toMatchObject({
      id: demoProductFixtureIds.journey,
      projectId: demoProductFixtureIds.project,
      environmentId: demoProductFixtureIds.environment,
      state: 'ENABLED',
      validationStatus: 'READY',
    });
    expect(mapped.steps.filter((step) => step.metadata.screenshotCheckpoint)).toHaveLength(2);
    expect(mapped.steps.filter((step) => step.metadata.screenshotCheckpointName)).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({ screenshotCheckpointName: 'checkout-form-loaded' }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({ screenshotCheckpointName: 'order-confirmation' }),
      }),
    ]);

    const runtime = toRuntimeJourney(record);
    expect(runtime.steps).toHaveLength(12);
    expect(runtime.successCondition).toEqual({
      type: 'visible',
      selector: '[data-testid="order-id"]',
    });
    expect(runtime.steps.filter((step) => step.screenshotCheckpoint)).toHaveLength(2);
  });

  it('persists two enabled READY Invariants using only registered evaluator definitions', () => {
    const records = demoInvariantFixtures.map(invariantRecord);
    const mapped = records.map(mapInvariant);
    const runtime = records.map(mapPersistedInvariantToRuntimeDefinition);

    expect(mapped).toEqual([
      expect.objectContaining({
        id: demoProductFixtureIds.invariant,
        name: 'No duplicate payment',
        type: 'NO_DUPLICATE_PAYMENT',
        severity: 'CRITICAL',
        enabled: true,
        validationStatus: 'READY',
      }),
      expect.objectContaining({
        id: demoProductFixtureIds.orderInvariant,
        name: 'No duplicate order',
        type: 'NO_DUPLICATE_ORDER',
        severity: 'HIGH',
        enabled: true,
        validationStatus: 'READY',
      }),
    ]);
    expect(runtime).toEqual([
      expect.objectContaining({ type: 'NO_DUPLICATE_PAYMENT', severity: 'CRITICAL' }),
      expect.objectContaining({ type: 'NO_DUPLICATE_ORDER', severity: 'HIGH' }),
    ]);
    expect(
      records.every((record) => persistedInvariantAssertionSchema.safeParse(record.assertion).success),
    ).toBe(true);
    expect(JSON.stringify(records)).not.toContain('NO_DUPLICATE_CHECKOUT');
  });

  it('contains the exact prepared Scenario prompt and no runtime-owned record creation', async () => {
    expect(demoScenarioFixture.prompt).toBe(
      'Test the checkout flow under delayed payment responses and repeated user interaction. Verify that one checkout never creates duplicate payments or duplicate orders.',
    );

    const seedSource = await readFile(
      new URL('../../packages/database/prisma/seed.ts', import.meta.url),
      'utf8',
    );
    for (const delegate of [
      'investigation',
      'experimentPlan',
      'experiment',
      'world',
      'worker',
      'workerJob',
      'workerResult',
      'finding',
      'evidence',
      'investigationEvent',
      'repair',
    ]) {
      expect(seedSource).not.toMatch(new RegExp(`transaction\\.${delegate}\\.(?:create|upsert)`));
    }
    expect(seedSource).not.toContain('passwordHash');
  });
});

function journeyRecord(): JourneyRecord {
  return {
    id: demoProductFixtureIds.journey,
    projectId: demoProductFixtureIds.project,
    name: demoCheckoutJourneyFixture.name,
    description: demoCheckoutJourneyFixture.description,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    steps: demoCheckoutJourneySteps.map((step) => ({ ...step })),
  };
}

function invariantRecord(
  fixture: (typeof demoInvariantFixtures)[number],
): InvariantRecord {
  return {
    id: fixture.id,
    organisationId: demoProductFixtureIds.organisation,
    projectId: demoProductFixtureIds.project,
    name: fixture.name,
    description: fixture.description,
    assertion: fixture.assertion,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    deletedAt: null,
  };
}
