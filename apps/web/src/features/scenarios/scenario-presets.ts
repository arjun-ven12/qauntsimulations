import type { Invariant, InvariantType } from '../invariants/invariant-api.js';
import type { ScenarioControls } from './scenario-api.js';
import {
  isInvariantSelectable,
  preflightMatchesPayload,
  toScenarioLaunchInput,
  type ScenarioFormValue,
} from './scenario-form.model.js';

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
  controls: ScenarioControls;
  recommendedInvariantTypes: InvariantType[];
  recommended?: boolean;
}

export const defaultScenarioPresetId = 'delayed-payment-double-submission';

export const scenarioPresets: readonly ScenarioPreset[] = [
  {
    id: 'healthy-checkout-baseline',
    name: 'Healthy Checkout Baseline',
    description:
      'Confirm that the standard checkout journey completes successfully under normal conditions without duplicate payments or orders.',
    prompt:
      'Run the standard checkout journey under normal conditions. Confirm that checkout completes successfully and that exactly one payment and one order are created.',
    controls: {
      browsers: ['chromium'],
      viewports: ['desktop-1440x900'],
      networkProfiles: ['normal'],
      maximumWorlds: 2,
      maximumConcurrentWorkers: 2,
    },
    recommendedInvariantTypes: ['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER'],
  },
  {
    id: defaultScenarioPresetId,
    name: 'Delayed Payment Double Submission',
    description:
      'Challenge the checkout while the payment response is delayed and the user submits repeatedly.',
    prompt:
      'Test the checkout flow under delayed payment responses and repeated user interaction. Verify that one checkout never creates duplicate payments or duplicate orders.',
    controls: {
      browsers: ['chromium'],
      viewports: ['desktop-1440x900', 'mobile-390x844'],
      networkProfiles: ['normal', 'delayed-payment'],
      maximumWorlds: 4,
      maximumConcurrentWorkers: 2,
    },
    recommendedInvariantTypes: ['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER'],
    recommended: true,
  },
  {
    id: 'mobile-checkout-slow-network',
    name: 'Mobile Checkout Under Slow Network',
    description:
      'Explore whether the mobile checkout becomes unreliable under delayed network and payment conditions.',
    prompt:
      'Test the mobile checkout journey under slow network and delayed payment conditions. Identify whether repeated interaction, layout changes or delayed responses cause duplicate payments, duplicate orders or incomplete checkout completion.',
    controls: {
      browsers: ['chromium'],
      viewports: ['mobile-390x844'],
      networkProfiles: ['delayed-payment'],
      maximumWorlds: 3,
      maximumConcurrentWorkers: 2,
    },
    recommendedInvariantTypes: ['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER'],
  },
  {
    id: 'payment-timeout-retry',
    name: 'Payment Timeout and Retry',
    description: 'Challenge payment retry behaviour after a delayed or timed-out payment response.',
    prompt:
      'Test checkout retry behaviour when the first payment response is delayed or appears to time out. Verify that retries never produce duplicate payment or order requests.',
    controls: {
      browsers: ['chromium'],
      viewports: ['desktop-1440x900'],
      networkProfiles: ['delayed-payment'],
      maximumWorlds: 4,
      maximumConcurrentWorkers: 2,
    },
    recommendedInvariantTypes: ['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER'],
  },
];

export interface AppliedScenarioPreset {
  value: ScenarioFormValue;
  unavailableInvariantTypes: InvariantType[];
}

export function applyScenarioPreset(
  current: ScenarioFormValue,
  preset: ScenarioPreset,
  invariants: Invariant[],
): AppliedScenarioPreset {
  const invariantIds: string[] = [];
  const unavailableInvariantTypes: InvariantType[] = [];

  for (const type of preset.recommendedInvariantTypes) {
    const match = invariants.find(
      (invariant) => invariant.type === type && isInvariantSelectable(invariant),
    );
    if (match) invariantIds.push(match.id);
    else unavailableInvariantTypes.push(type);
  }

  return {
    value: {
      ...current,
      invariantIds: [...new Set(invariantIds)],
      scenario: {
        prompt: preset.prompt,
        controls: {
          browsers: [...preset.controls.browsers],
          viewports: [...preset.controls.viewports],
          networkProfiles: [...preset.controls.networkProfiles],
          maximumWorlds: preset.controls.maximumWorlds,
          maximumConcurrentWorkers: preset.controls.maximumConcurrentWorkers,
        },
      },
    },
    unavailableInvariantTypes,
  };
}

export function isScenarioPresetCustomised(
  appliedPayload: ScenarioFormValue,
  current: ScenarioFormValue,
) {
  return !preflightMatchesPayload(
    toScenarioLaunchInput(appliedPayload),
    toScenarioLaunchInput(current),
  );
}
