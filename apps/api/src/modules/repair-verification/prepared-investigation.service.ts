import { createHash, randomUUID } from 'node:crypto';
import type { RepairVerificationPlanPreview, RepairVerificationTargetInput } from './repair-verification.schema.js';
import type {
  JsonRecord,
  PreparedRepairVerificationPersistence,
  RepairVerificationEligibilityContext,
} from './repair-verification.types.js';

export class PreparedRepairVerificationInvestigationService {
  prepare(input: {
    context: RepairVerificationEligibilityContext;
    target: RepairVerificationTargetInput;
    planPreview: RepairVerificationPlanPreview;
    idempotencyKey: string;
    requestFingerprint: string;
    actorUserId: string;
  }): PreparedRepairVerificationPersistence {
    const finding = input.context.finding;
    const environment = input.context.targetEnvironment;
    const launch = input.context.launchSnapshot;
    const safety = input.context.safetyPolicy;
    if (!finding || !environment || !launch || !safety) {
      throw new Error('Eligible Repair Verification context is incomplete');
    }
    const repairVerificationId = `repair_verification_${randomUUID()}`;
    const verificationInvestigationId = `investigation_repair_${randomUUID()}`;
    const scenarioId = `scenario_repair_${randomUUID()}`;
    const maximumConcurrentWorkers = Math.min(2, input.planPreview.worlds.length);
    const controls = {
      browsers: unique(input.planPreview.worlds.map(({ configuration }) => stringValue(configuration.browser) ?? 'chromium')),
      viewports: unique(input.planPreview.worlds.map(({ configuration }) => stringValue(configuration.viewport) ?? 'desktop-1440x900')),
      networkProfiles: unique(input.planPreview.worlds.map(({ configuration }) => stringValue(configuration.networkProfile) ?? 'normal')),
      maximumWorlds: input.planPreview.worlds.length,
      maximumConcurrentWorkers,
    };
    const prompt = `Verify repaired deployment for Finding ${finding.id} using its minimal reproduction and passing controls.`;
    const worlds = input.planPreview.worlds.map((world, index) => preparedWorld(world, index));
    const environmentConfiguration = environment.configuration;
    const preparedPlan: JsonRecord = {
      objective: `Repair Verification for Finding ${finding.id}`,
      journeyId: finding.originalJourneyId,
      scenarioId,
      selectedVariables: ['repairVerificationPurpose'],
      selectedControls: controls,
      invariantIds: launch.invariants.map(({ id }) => id),
      executionProvider: 'LOCAL_PLAYWRIGHT',
      maximumConcurrentWorkers,
      worlds,
      planningExplanation: 'Prepared deterministically from the original minimal reproduction, passing controls, and bounded adjacent Worlds.',
      executionMode: 'REPAIR_VERIFICATION',
      repairVerification: {
        version: 1,
        repairVerificationId,
        findingId: finding.id,
        originalInvestigationId: finding.investigationId,
        deploymentVersion: input.target.deploymentVersion ?? null,
        worldPurposes: worlds.map((world) => world.repairVerification),
      },
      launch: {
        inputSource: 'PERSISTED_CONFIGURATION',
        actorUserId: input.actorUserId,
        launchedAt: new Date().toISOString(),
        scenario: { prompt, controls },
        environment: {
          id: environment.id,
          name: environment.name,
          type: environment.type,
          baseUrl: environment.baseUrl,
          ...(environment.apiBaseUrl ? { apiBaseUrl: environment.apiBaseUrl } : {}),
          ...selectedEnvironmentConfiguration(environmentConfiguration),
        },
        journey: launch.journey,
        invariants: launch.invariants,
        safety: {
          policyId: safety.id,
          domainAllowlist: safety.domainAllowlist,
          allowedHttpMethods: stringArray(safety.configuration.allowedHttpMethods),
          permitCheckoutSubmission: safety.configuration.permitCheckoutSubmission === true,
          permitMockPayment: safety.configuration.permitMockPayment === true,
          permitTestOrderCreation: (safety.configuration.permitTestOrderCreation ?? safety.configuration.permitOrderCreation) === true,
          prohibitedActions: safety.blockedActions,
        },
        validation: { status: 'READY', warnings: [] },
      },
    };
    return {
      repairVerificationId,
      verificationInvestigationId,
      scenario: {
        id: scenarioId,
        name: `Repair verification ${repairVerificationId.slice(-12)}`,
        prompt,
        controls,
      },
      investigation: {
        name: `Repair Verification: ${finding.id}`.slice(0, 180),
        journeyId: finding.originalJourneyId,
        safetyPolicyId: safety.id,
      },
      experimentPlan: {
        plan: preparedPlan,
        planningExplanation: String(preparedPlan.planningExplanation),
        estimatedComputeUnits: worlds.length,
      },
      repairVerification: {
        organisationId: input.context.organisationId,
        projectId: finding.projectId,
        findingId: finding.id,
        originalInvestigationId: finding.investigationId,
        environmentId: environment.id,
        createdByUserId: input.actorUserId,
        ...(input.target.notes ? { notes: input.target.notes } : {}),
        planSnapshot: preparedPlan,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
      },
    };
  }
}

function preparedWorld(
  world: RepairVerificationPlanPreview['worlds'][number],
  index: number,
): JsonRecord {
  const configuration = world.configuration;
  return {
    ...configuration,
    key: world.key,
    name: purposeName(world.purpose, index),
    browser: enumValue(configuration.browser, ['chromium', 'webkit', 'firefox'], 'chromium'),
    viewport: stringValue(configuration.viewport) ?? 'desktop-1440x900',
    networkProfile: stringValue(configuration.networkProfile) ?? 'normal',
    userProfile: enumValue(configuration.userProfile, ['normal', 'impatient'], 'normal'),
    paymentDelayMs: nonNegativeInteger(configuration.paymentDelayMs, 0),
    duplicateSubmissionBug: configuration.duplicateSubmissionBug === true,
    doubleSubmit: configuration.doubleSubmit === true,
    doubleSubmitIntervalMs: nonNegativeInteger(configuration.doubleSubmitIntervalMs, 100),
    expectedOutcome: 'OBSERVE',
    reason: world.reason,
    randomSeed: stableSeed(world.key),
    creationOrder: index,
    origin: 'REPAIR_VERIFICATION',
    repairVerification: {
      purpose: world.purpose,
      ...(world.sourceWorldId ? { sourceWorldId: world.sourceWorldId } : {}),
    },
  };
}

function selectedEnvironmentConfiguration(configuration: JsonRecord): JsonRecord {
  return {
    ...(object(configuration.reset) ? { reset: object(configuration.reset) } : {}),
    ...(object(configuration.payment) ? { payment: object(configuration.payment) } : {}),
    ...(object(configuration.testData) ? { testData: object(configuration.testData) } : {}),
    ...(Array.isArray(configuration.allowedActions) ? { allowedActions: configuration.allowedActions } : {}),
  };
}

function purposeName(purpose: string, index: number): string {
  return `${purpose.toLowerCase().replaceAll('_', ' ')} ${index + 1}`;
}
function stableSeed(key: string): number {
  return Number.parseInt(createHash('sha256').update(key).digest('hex').slice(0, 7), 16);
}
function stringValue(value: unknown): string | null { return typeof value === 'string' && value ? value : null; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function object(value: unknown): JsonRecord | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null; }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T { return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback; }
function nonNegativeInteger(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback; }
