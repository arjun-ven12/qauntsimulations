import { describe, expect, it } from 'vitest';
import { preflightMatchesPayload, toScenarioLaunchInput } from './scenario-form.model.js';
import {
  applyScenarioPreset,
  defaultScenarioPresetId,
  isScenarioPresetCustomised,
  scenarioPresets,
} from './scenario-presets.js';
import { invariant, validScenario } from './scenario-test-fixtures.js';

const expectedPresets = [
  {
    id: 'healthy-checkout-baseline',
    name: 'Healthy Checkout Baseline',
    prompt:
      'Run the standard checkout journey under normal conditions. Confirm that checkout completes successfully and that exactly one payment and one order are created.',
    controls: {
      browsers: ['chromium'],
      viewports: ['desktop-1440x900'],
      networkProfiles: ['normal'],
      maximumWorlds: 2,
      maximumConcurrentWorkers: 2,
    },
  },
  {
    id: 'delayed-payment-double-submission',
    name: 'Delayed Payment Double Submission',
    prompt:
      'Test the checkout flow under delayed payment responses and repeated user interaction. Verify that one checkout never creates duplicate payments or duplicate orders.',
    controls: {
      browsers: ['chromium'],
      viewports: ['desktop-1440x900', 'mobile-390x844'],
      networkProfiles: ['normal', 'delayed-payment'],
      maximumWorlds: 4,
      maximumConcurrentWorkers: 2,
    },
  },
  {
    id: 'mobile-checkout-slow-network',
    name: 'Mobile Checkout Under Slow Network',
    prompt:
      'Test the mobile checkout journey under slow network and delayed payment conditions. Identify whether repeated interaction, layout changes or delayed responses cause duplicate payments, duplicate orders or incomplete checkout completion.',
    controls: {
      browsers: ['chromium'],
      viewports: ['mobile-390x844'],
      networkProfiles: ['delayed-payment'],
      maximumWorlds: 3,
      maximumConcurrentWorkers: 2,
    },
  },
  {
    id: 'payment-timeout-retry',
    name: 'Payment Timeout and Retry',
    prompt:
      'Test checkout retry behaviour when the first payment response is delayed or appears to time out. Verify that retries never produce duplicate payment or order requests.',
    controls: {
      browsers: ['chromium'],
      viewports: ['desktop-1440x900'],
      networkProfiles: ['delayed-payment'],
      maximumWorlds: 4,
      maximumConcurrentWorkers: 2,
    },
  },
] as const;

describe('Scenario preset catalogue', () => {
  const invariants = [
    invariant('persisted-payment-record', 'NO_DUPLICATE_PAYMENT'),
    invariant('persisted-order-record', 'NO_DUPLICATE_ORDER'),
  ];

  it('contains the four exact supported presets and marks delayed payment as recommended', () => {
    expect(scenarioPresets).toHaveLength(4);
    expect(
      scenarioPresets.map(({ id, name, prompt, controls }) => ({ id, name, prompt, controls })),
    ).toEqual(expectedPresets);
    expect(defaultScenarioPresetId).toBe('delayed-payment-double-submission');
    expect(scenarioPresets.find((preset) => preset.id === defaultScenarioPresetId)?.recommended).toBe(
      true,
    );
    expect(
      scenarioPresets.every(
        (preset) =>
          preset.recommendedInvariantTypes.join(',') ===
          'NO_DUPLICATE_PAYMENT,NO_DUPLICATE_ORDER',
      ),
    ).toBe(true);
  });

  it.each(expectedPresets)(
    'applies the exact prompt and supported controls for $name',
    ({ id, prompt, controls }) => {
      const preset = scenarioPresets.find((candidate) => candidate.id === id)!;
      const applied = applyScenarioPreset(validScenario(), preset, invariants);
      expect(applied.value.scenario).toEqual({ prompt, controls });
    },
  );

  it('maps recommended evaluator types to selectable persisted records without hardcoded IDs', () => {
    const applied = applyScenarioPreset(validScenario(), scenarioPresets[1]!, invariants);
    expect(applied.value.invariantIds).toEqual([
      'persisted-payment-record',
      'persisted-order-record',
    ]);
    expect(JSON.stringify(scenarioPresets)).not.toMatch(
      /invariant_(?:single_checkout_submission|no_duplicate_order)/,
    );
  });

  it('leaves unavailable recommended Invariants unselected and reports their evaluator types', () => {
    const applied = applyScenarioPreset(validScenario(), scenarioPresets[1]!, [
      invariant('payment-disabled', 'NO_DUPLICATE_PAYMENT', { enabled: false }),
      invariant('persisted-order-record', 'NO_DUPLICATE_ORDER'),
    ]);
    expect(applied.value.invariantIds).toEqual(['persisted-order-record']);
    expect(applied.unavailableInvariantTypes).toEqual(['NO_DUPLICATE_PAYMENT']);
  });

  it('preserves Environment and Journey selections and never duplicates selected IDs', () => {
    const current = validScenario();
    current.environmentId = 'environment-selected-by-user';
    current.journeyId = 'journey-selected-by-user';
    const once = applyScenarioPreset(current, scenarioPresets[1]!, invariants).value;
    const twice = applyScenarioPreset(once, scenarioPresets[1]!, invariants).value;
    expect(twice.environmentId).toBe('environment-selected-by-user');
    expect(twice.journeyId).toBe('journey-selected-by-user');
    expect(twice.invariantIds).toEqual(['persisted-payment-record', 'persisted-order-record']);
  });

  it('invalidates a previous READY payload and detects later customisation', () => {
    const readyPayload = toScenarioLaunchInput(validScenario());
    const applied = applyScenarioPreset(validScenario(), scenarioPresets[0]!, invariants).value;
    expect(preflightMatchesPayload(readyPayload, toScenarioLaunchInput(applied))).toBe(false);
    expect(isScenarioPresetCustomised(applied, structuredClone(applied))).toBe(false);

    const edited = structuredClone(applied);
    edited.scenario.controls.maximumWorlds = 3;
    expect(isScenarioPresetCustomised(applied, edited)).toBe(true);
  });

  it('keeps manual prompt editing and the existing launch payload structure unchanged', () => {
    const manual = validScenario();
    manual.scenario.prompt = '  Manually investigate checkout completion under normal traffic.  ';
    const payload = toScenarioLaunchInput(manual);
    expect(payload.scenario.prompt).toBe(
      'Manually investigate checkout completion under normal traffic.',
    );
    expect(Object.keys(payload)).toEqual([
      'environmentId',
      'journeyId',
      'invariantIds',
      'scenario',
    ]);
    expect(Object.keys(payload.scenario)).toEqual(['prompt', 'controls']);
    expect(Object.keys(payload.scenario.controls)).toEqual([
      'browsers',
      'viewports',
      'networkProfiles',
      'maximumWorlds',
      'maximumConcurrentWorkers',
    ]);
  });
});
