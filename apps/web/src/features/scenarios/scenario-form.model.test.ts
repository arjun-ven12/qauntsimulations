import { describe, expect, it } from 'vitest';
import {
  createRequestLock,
  isInvariantSelectable,
  isJourneySelectable,
  liveWorldLabRoute,
  preflightMatchesPayload,
  runRequestOnce,
  scenarioFormErrors,
  supportedScenarioControls,
  toScenarioLaunchInput,
} from './scenario-form.model.js';
import { environment, invariant, journey, validScenario } from './scenario-test-fixtures.js';

describe('Scenario form model', () => {
  const environments = [environment()];
  const journeys = [journey()];
  const invariants = [
    invariant('invariant-payment', 'NO_DUPLICATE_PAYMENT'),
    invariant('invariant-order', 'NO_DUPLICATE_ORDER'),
  ];

  it('accepts one Environment, one compatible Journey, and multiple Invariants', () => {
    const value = validScenario();
    expect(scenarioFormErrors(value, journeys, invariants)).toEqual({});
    expect(value.environmentId).toBe(environments[0]!.id);
    expect(value.journeyId).toBe(journeys[0]!.id);
    expect(value.invariantIds).toEqual(['invariant-payment', 'invariant-order']);
  });

  it('emits the exact de-duplicated invariantIds string array', () => {
    const value = validScenario();
    value.invariantIds.push('invariant-payment');
    expect(toScenarioLaunchInput(value).invariantIds).toEqual([
      'invariant-payment',
      'invariant-order',
    ]);
  });

  it('exposes only controls confirmed by the backend schema', () => {
    expect(supportedScenarioControls).toEqual([
      'browsers',
      'viewports',
      'networkProfiles',
      'maximumWorlds',
      'maximumConcurrentWorkers',
    ]);
    expect(Object.keys(validScenario().scenario.controls)).toEqual(supportedScenarioControls);
  });

  it('rejects executable prompt content', () => {
    const value = validScenario();
    value.scenario.prompt = 'Run ```sql SELECT customer FROM payments``` during checkout';
    expect(scenarioFormErrors(value, journeys, invariants).prompt).toContain('natural language');
  });

  it('invalidates a READY preflight whenever form data changes', () => {
    const readyPayload = validScenario();
    expect(preflightMatchesPayload(readyPayload, structuredClone(readyPayload))).toBe(true);
    const changed = structuredClone(readyPayload);
    changed.scenario.controls.maximumWorlds = 5;
    expect(preflightMatchesPayload(readyPayload, changed)).toBe(false);
  });

  it('runs one submission callback for two immediate attempts while the first is pending', async () => {
    const lock = createRequestLock();
    let posts = 0;
    let completePost!: () => void;
    const pendingPost = new Promise<void>((resolve) => {
      completePost = resolve;
    });
    const post = async () => {
      posts += 1;
      await pendingPost;
    };

    const first = runRequestOnce(lock, post);
    const second = runRequestOnce(lock, post);

    expect(posts).toBe(1);
    expect(await second).toBe(false);
    completePost();
    expect(await first).toBe(true);
  });

  it('excludes disabled, non-READY, unsupported, and incompatible persisted records', () => {
    expect(isJourneySelectable(journey(), 'environment-1')).toBe(true);
    expect(isJourneySelectable(journey({ state: 'DRAFT' }), 'environment-1')).toBe(false);
    expect(isJourneySelectable(journey(), 'environment-2')).toBe(false);
    expect(isInvariantSelectable(invariants[0]!)).toBe(true);
    expect(isInvariantSelectable(invariant('disabled', 'NO_DUPLICATE_PAYMENT', { enabled: false }))).toBe(false);
    expect(isInvariantSelectable(invariant('invalid', 'NO_DUPLICATE_ORDER', { validationStatus: 'INVALID' }))).toBe(false);
    expect(isInvariantSelectable({ ...invariants[0]!, type: null })).toBe(false);
  });

  it('redirects successful launches to the existing Live WorldLab route', () => {
    expect(liveWorldLabRoute('investigation-1')).toBe('/investigations/investigation-1');
  });
});
