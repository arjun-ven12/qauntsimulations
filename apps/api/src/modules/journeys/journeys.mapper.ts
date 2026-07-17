import type {
  CompletionCondition,
  JourneyPersistenceInput,
  JourneyRecord,
  JourneyRecordStep,
  JourneyStepMetadata,
  PersistedJourneyConfiguration,
  RuntimeJourney,
  RuntimeJourneyStep,
} from './journeys.types.js';

const CONFIGURATION_KEY = 'taskosJourney';

export function mapJourney(record: JourneyRecord) {
  const configuration = readJourneyConfiguration(record);
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    description: record.description,
    environmentId: configuration?.environmentId ?? null,
    startPath: configuration?.startPath ?? legacyStartPath(record.steps),
    state: configuration?.state ?? 'DRAFT',
    completionCondition: configuration?.completionCondition ?? legacyCompletion(record.steps),
    validationStatus: configuration?.validationStatus ?? 'DRAFT',
    steps: record.steps.map(mapStep),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapStep(step: JourneyRecordStep) {
  return {
    id: step.id,
    order: step.order,
    action: normaliseLegacyAction(step.action),
    selector: step.selector,
    value: step.value,
    metadata: publicMetadata(step.metadata),
  };
}

export function encodeSteps(input: JourneyPersistenceInput) {
  return input.steps.map((step, index) => ({
    order: index,
    action: step.action,
    selector: step.selector,
    value: step.value,
    metadata: {
      ...publicMetadata(step.metadata),
      ...(index === 0
        ? {
            [CONFIGURATION_KEY]: {
              version: 1,
              environmentId: input.environmentId,
              startPath: input.startPath,
              state: input.state,
              completionCondition: input.completionCondition,
              validationStatus: input.validationStatus,
            } satisfies PersistedJourneyConfiguration,
          }
        : {}),
    },
  }));
}

export function readJourneyConfiguration(
  record: Pick<JourneyRecord, 'steps'>,
): PersistedJourneyConfiguration | null {
  const first = record.steps[0];
  if (!first || !isRecord(first.metadata)) return null;
  const value = first.metadata[CONFIGURATION_KEY];
  if (!isRecord(value) || value.version !== 1) return null;
  if (
    typeof value.environmentId !== 'string' ||
    typeof value.startPath !== 'string' ||
    (value.state !== 'DRAFT' && value.state !== 'ENABLED') ||
    (value.validationStatus !== 'DRAFT' &&
      value.validationStatus !== 'READY' &&
      value.validationStatus !== 'INVALID') ||
    !isCompletionCondition(value.completionCondition)
  )
    return null;
  return value as unknown as PersistedJourneyConfiguration;
}

export function toRuntimeJourney(record: JourneyRecord): RuntimeJourney {
  const configuration = readJourneyConfiguration(record);
  const completionCondition =
    configuration?.completionCondition ?? legacyCompletion(record.steps);
  if (!completionCondition) throw new Error('Journey completion condition is missing');
  return {
    id: record.id,
    name: record.name,
    steps: record.steps.map(toRuntimeStep),
    successCondition:
      completionCondition.type === 'VISIBLE'
        ? { type: 'visible', selector: completionCondition.selector }
        : {
            type: 'text',
            selector: completionCondition.selector,
            expectedText: completionCondition.expectedText,
          },
  };
}

function toRuntimeStep(step: JourneyRecordStep): RuntimeJourneyStep {
  const action = normaliseLegacyAction(step.action);
  const metadata = publicMetadata(step.metadata);
  const common = {
    ...(metadata.name ? { name: metadata.name } : {}),
    ...(metadata.screenshotCheckpoint ? { screenshotCheckpoint: true } : {}),
    ...(metadata.continueOnFailure ? { continueOnFailure: true } : {}),
  };
  if (action === 'GOTO') return { ...common, type: 'goto', path: required(step.value) };
  if (action === 'CLICK') return { ...common, type: 'click', selector: required(step.selector) };
  if (action === 'FILL')
    return {
      ...common,
      type: 'fill',
      selector: required(step.selector),
      value: required(step.value, true),
    };
  if (action === 'WAIT_FOR')
    return {
      ...common,
      type: 'waitFor',
      selector: required(step.selector),
      ...(metadata.timeoutMs ? { timeoutMs: metadata.timeoutMs } : {}),
    };
  if (action === 'ASSERT_VISIBLE')
    return { ...common, type: 'assertVisible', selector: required(step.selector) };
  throw new Error(`Unsupported persisted Journey action: ${step.action}`);
}

function publicMetadata(value: unknown): JourneyStepMetadata {
  if (!isRecord(value)) return {};
  return {
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof value.timeoutMs === 'number' ? { timeoutMs: value.timeoutMs } : {}),
    ...(value.expectedState === 'VISIBLE' ? { expectedState: 'VISIBLE' as const } : {}),
    ...(typeof value.screenshotCheckpoint === 'boolean'
      ? { screenshotCheckpoint: value.screenshotCheckpoint }
      : {}),
    ...(typeof value.screenshotCheckpointName === 'string'
      ? { screenshotCheckpointName: value.screenshotCheckpointName }
      : {}),
    ...(typeof value.continueOnFailure === 'boolean'
      ? { continueOnFailure: value.continueOnFailure }
      : {}),
  };
}

function normaliseLegacyAction(action: string) {
  if (action === 'NAVIGATE') return 'GOTO' as const;
  if (action === 'WAIT') return 'WAIT_FOR' as const;
  if (action === 'ASSERT') return 'ASSERT_VISIBLE' as const;
  return action;
}

function legacyStartPath(steps: JourneyRecordStep[]) {
  return steps.find((step) => normaliseLegacyAction(step.action) === 'GOTO')?.value ?? null;
}

function legacyCompletion(steps: JourneyRecordStep[]): CompletionCondition | null {
  const step = [...steps]
    .reverse()
    .find((candidate) => normaliseLegacyAction(candidate.action) === 'ASSERT_VISIBLE');
  return step?.selector ? { type: 'VISIBLE', selector: step.selector } : null;
}

function isCompletionCondition(value: unknown): value is CompletionCondition {
  if (!isRecord(value) || typeof value.selector !== 'string') return false;
  return (
    value.type === 'VISIBLE' ||
    (value.type === 'TEXT' && typeof value.expectedText === 'string')
  );
}

function required(value: string | null, allowEmpty = false) {
  if (value === null || (!allowEmpty && value.length === 0))
    throw new Error('Persisted Journey step is missing a required field');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
