import { readFile } from 'node:fs/promises';
import { workerJobSchema } from '@taskos/execution-contracts';
import { describe, expect, it } from 'vitest';
import {
  demoCheckoutJourneySteps,
  demoProductFixtureIds,
} from '../../packages/database/prisma/demo-fixtures.js';

describe('deterministic product fixtures', () => {
  it('keeps product-owned IDs stable', () => {
    expect(demoProductFixtureIds).toEqual({
      organisation: 'organisation_demo_taskos',
      project: 'project_demo_checkout',
      environment: 'environment_demo_local',
      journey: 'journey_checkout',
      scenario: 'scenario_duplicate_submission',
      invariant: 'invariant_single_checkout_submission',
    });
    expect(demoCheckoutJourneySteps).toHaveLength(9);
  });

  it('validates checkout actions and success against the existing journey schema', async () => {
    const fixture = JSON.parse(
      await readFile(new URL('./checkout-journey.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;

    const journey = workerJobSchema.shape.journey.parse(fixture);
    const target = workerJobSchema.shape.target.parse({
      baseUrl: fixture.baseUrl,
      journeyPath: fixture.startPath,
    });

    expect(journey.id).toBe('journey_checkout');
    expect(journey.steps).toHaveLength(9);
    expect(journey.successCondition).toEqual({
      type: 'visible',
      selector: '[data-testid="order-confirmation"]',
    });
    expect(target).toEqual({
      baseUrl: 'http://localhost:5174',
      journeyPath: '/products/test-product',
    });
  });
});
