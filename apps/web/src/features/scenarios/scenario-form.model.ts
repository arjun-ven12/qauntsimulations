import type { Environment } from '../../services/environment-api.js';
import type { Invariant } from '../invariants/invariant-api.js';
import type { Journey } from '../journeys/journey-api.js';
import type { ScenarioLaunchInput } from './scenario-api.js';

export type ScenarioFormValue = ScenarioLaunchInput;

export const commerceScenarioPrompt =
  'Test the checkout flow under delayed payment responses and repeated user interaction. Verify that one checkout never creates duplicate payments or duplicate orders.';

export const supportedScenarioControls = [
  'browsers',
  'viewports',
  'networkProfiles',
  'maximumWorlds',
  'maximumConcurrentWorkers',
] as const;

export const browserOptions = [{ value: 'chromium', label: 'Chromium' }] as const;
export const viewportOptions = [
  { value: 'desktop-1440x900', label: 'Desktop · 1440 × 900' },
  { value: 'mobile-390x844', label: 'Mobile · 390 × 844' },
] as const;
export const networkProfileOptions = [
  { value: 'normal', label: 'Normal' },
  { value: 'delayed-payment', label: 'Delayed payment' },
] as const;

export function scenarioDefaults(environments: Environment[] = []): ScenarioFormValue {
  const environment =
    environments.find((candidate) => candidate.isDefault && candidate.validationStatus === 'READY') ??
    environments.find((candidate) => candidate.validationStatus === 'READY');
  return {
    environmentId: environment?.id ?? '',
    journeyId: '',
    invariantIds: [],
    scenario: {
      prompt: '',
      controls: {
        browsers: ['chromium'],
        viewports: ['desktop-1440x900'],
        networkProfiles: ['normal', 'delayed-payment'],
        maximumWorlds: 4,
        maximumConcurrentWorkers: 2,
      },
    },
  };
}

export function toScenarioLaunchInput(value: ScenarioFormValue): ScenarioLaunchInput {
  return {
    environmentId: value.environmentId,
    journeyId: value.journeyId,
    invariantIds: [...new Set(value.invariantIds)],
    scenario: {
      prompt: value.scenario.prompt.trim(),
      controls: {
        browsers: [...new Set(value.scenario.controls.browsers)],
        viewports: [...new Set(value.scenario.controls.viewports)],
        networkProfiles: [...new Set(value.scenario.controls.networkProfiles)],
        maximumWorlds: value.scenario.controls.maximumWorlds,
        maximumConcurrentWorkers: value.scenario.controls.maximumConcurrentWorkers,
      },
    },
  };
}

export function scenarioFormErrors(
  value: ScenarioFormValue,
  journeys: Journey[],
  invariants: Invariant[],
) {
  const errors: Record<string, string> = {};
  if (!value.environmentId) errors.environmentId = 'Select a READY Environment.';
  const selectedJourney = journeys.find((journey) => journey.id === value.journeyId);
  if (!selectedJourney) errors.journeyId = 'Select a READY, enabled Journey.';
  else if (!isJourneySelectable(selectedJourney, value.environmentId))
    errors.journeyId = 'The Journey is not READY, enabled, and compatible with this Environment.';
  if (!value.invariantIds.length) errors.invariantIds = 'Select at least one READY, enabled Invariant.';
  else if (
    value.invariantIds.some(
      (id) => !invariants.some((invariant) => invariant.id === id && isInvariantSelectable(invariant)),
    )
  )
    errors.invariantIds = 'Selected Invariants must remain READY and enabled.';
  const prompt = value.scenario.prompt.trim();
  if (!prompt) errors.prompt = 'Enter a natural-language Scenario prompt.';
  else if (prompt.length > 5_000) errors.prompt = 'Use 5,000 characters or fewer.';
  else if (!isNaturalLanguagePrompt(prompt))
    errors.prompt = 'Use natural language, not executable code, SQL, or shell commands.';
  const controls = value.scenario.controls;
  if (!controls.browsers.length) errors.browsers = 'Select at least one browser.';
  if (!controls.viewports.length) errors.viewports = 'Select at least one viewport.';
  if (!controls.networkProfiles.length)
    errors.networkProfiles = 'Select at least one network profile.';
  if (!Number.isInteger(controls.maximumWorlds) || controls.maximumWorlds < 1 || controls.maximumWorlds > 100)
    errors.maximumWorlds = 'Maximum worlds must be an integer from 1 to 100.';
  if (
    !Number.isInteger(controls.maximumConcurrentWorkers) ||
    controls.maximumConcurrentWorkers < 1 ||
    controls.maximumConcurrentWorkers > 20
  )
    errors.maximumConcurrentWorkers = 'Maximum workers must be an integer from 1 to 20.';
  else if (controls.maximumConcurrentWorkers > controls.maximumWorlds)
    errors.maximumConcurrentWorkers = 'Maximum workers cannot exceed maximum worlds.';
  return errors;
}

export function isJourneySelectable(journey: Journey, environmentId: string) {
  return (
    journey.state === 'ENABLED' &&
    journey.validationStatus === 'READY' &&
    journey.environmentId === environmentId
  );
}

export function isInvariantSelectable(invariant: Invariant) {
  return (
    invariant.enabled &&
    invariant.validationStatus === 'READY' &&
    (invariant.type === 'NO_DUPLICATE_PAYMENT' || invariant.type === 'NO_DUPLICATE_ORDER')
  );
}

export function payloadKey(value: ScenarioLaunchInput) {
  return JSON.stringify(value);
}

export function preflightMatchesPayload(
  preflighted: ScenarioLaunchInput | null,
  current: ScenarioLaunchInput,
) {
  return preflighted !== null && payloadKey(preflighted) === payloadKey(current);
}

export function createRequestLock() {
  let locked = false;
  return {
    enter() {
      if (locked) return false;
      locked = true;
      return true;
    },
    leave() {
      locked = false;
    },
  };
}

export function liveWorldLabRoute(investigationId: string) {
  return `/investigations/${investigationId}`;
}

function isNaturalLanguagePrompt(value: string) {
  return ![
    /```/,
    /<script\b/i,
    /javascript:/i,
    /\b(?:bash|powershell|cmd\.exe|node|python)\s+(?:-[a-z]+\s+)?["']/i,
    /\b(?:rm|chmod|chown|curl|wget)\s+-/i,
    /\b(?:select\s+.+\s+from|insert\s+into|drop\s+table|alter\s+table|delete\s+from)\b/i,
    /(?:\.\.\/|file:\/\/|\/etc\/|[A-Za-z]:\\)/,
    /\bfunction\s*\(|=>\s*[{(]/,
  ].some((pattern) => pattern.test(value));
}
