import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseClient, Prisma } from '@taskos/database';
import type { CreateInvestigationInput } from '@taskos/shared-types';
import { ApplicationError } from '../../core/errors/application-error.js';
import { hasOrganisationPermission } from '../organisations/organisation.permissions.js';
import type { DeterministicExperimentPlan } from '../experiments/services/deterministic-experiment-plan.service.js';
import { readJourneyConfiguration, toRuntimeJourney } from '../journeys/journeys.mapper.js';
import { persistedInvariantAssertionSchema } from '../invariants/invariants.schema.js';
import { mapPersistedInvariantToRuntimeDefinition } from '../invariants/invariants.mapper.js';
import type {
  AdaptiveFindingCandidate,
  AdaptiveFindingUpdateInput,
  AdaptiveWorldResultRecord,
  CompletedExecutionInput,
  CreatedWorldRecord,
  InvestigationCreationScope,
  InvestigationOrchestrationContext,
  InvestigationProgressRecord,
  CompleteMinimisationInput,
  MinimisationCandidateCreationResult,
  MinimisationCandidateDefinition,
  MinimisationCandidateUpdateInput,
  MinimisationFindingCandidate,
  MinimisationPlan,
  MinimisationPlanCreationResult,
  MinimisationRunRecord,
  MinimisationWorldResultRecord,
  PersistedExecutionEvent,
  PersistedFleetEvent,
  PersistedWorldExecution,
} from './investigations.types.js';
import type { WorkerExecutionProvider } from '../execution/worker-executor.types.js';
import type { AdaptiveReproductionPlan } from '../experiments/services/adaptive-reproduction-plan.service.js';
import type { DeterministicWorldDefinition } from '../experiments/services/deterministic-experiment-plan.service.js';
import { aggregateMinimisationDelayBounds } from './minimisation-bounds.js';
import { correlateInvariantEvaluations } from './invariant-evaluation-correlation.js';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const messageData = (message: string, metadata: Record<string, unknown> = {}): Prisma.InputJsonValue => json({ message, ...metadata });
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const numberValue = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const supportedJourneyActions = new Set(['GOTO', 'CLICK', 'FILL', 'WAIT_FOR', 'ASSERT_VISIBLE', 'NAVIGATE', 'WAIT', 'ASSERT']);

const minimisationRunRecord = (run: {
  id: string;
  status: string;
  completedTrials: number;
  currentRetainedConditions: unknown;
  removedConditions: unknown;
  inconclusiveConditions: unknown;
  knownPassingDelayMs: number | null;
  knownFailingDelayMs: number | null;
  finalReportEvidenceId: string | null;
}): MinimisationRunRecord => ({
  id: run.id,
  status: run.status,
  completedTrials: run.completedTrials,
  retainedConditions: record(run.currentRetainedConditions),
  removedConditions: record(run.removedConditions),
  inconclusiveConditions: record(run.inconclusiveConditions),
  ...(run.knownPassingDelayMs !== null ? { knownPassingDelayMs: run.knownPassingDelayMs } : {}),
  ...(run.knownFailingDelayMs !== null ? { knownFailingDelayMs: run.knownFailingDelayMs } : {}),
  ...(run.finalReportEvidenceId ? { finalReportEvidenceId: run.finalReportEvidenceId } : {}),
});

interface LaunchSafetyConfiguration {
  allowedHttpMethods: string[];
  permitCheckoutSubmission: boolean;
  permitMockPayment: boolean;
  permitTestOrderCreation: boolean;
}

function parseLaunchSafety(value: unknown): LaunchSafetyConfiguration | null {
  const configuration = record(value);
  const allowedHttpMethods = stringArray(configuration.allowedHttpMethods);
  if (!allowedHttpMethods.length) return null;
  const permitOrderCreation = configuration.permitTestOrderCreation ?? configuration.permitOrderCreation;
  if (
    typeof configuration.permitCheckoutSubmission !== 'boolean' ||
    typeof configuration.permitMockPayment !== 'boolean' ||
    typeof permitOrderCreation !== 'boolean'
  ) return null;
  return {
    allowedHttpMethods,
    permitCheckoutSubmission: configuration.permitCheckoutSubmission,
    permitMockPayment: configuration.permitMockPayment,
    permitTestOrderCreation: permitOrderCreation,
  };
}

function validateEnvironmentSafety(
  environment: { baseUrl: string; apiBaseUrl: string | null },
  configuration: Record<string, unknown>,
  allowlist: string[],
  safety: LaunchSafetyConfiguration,
): void {
  const reset = record(configuration.reset);
  const payment = record(configuration.payment);
  const allowedActions = stringArray(configuration.allowedActions);
  const hostCandidates = [environment.baseUrl, environment.apiBaseUrl, stringValue(reset.endpoint)].filter(
    (value): value is string => Boolean(value),
  );
  const allowedHosts = new Set(allowlist.map((host) => host.toLowerCase()));
  for (const candidate of hostCandidates) {
    const host = new URL(candidate, environment.baseUrl).hostname.toLowerCase();
    if (!allowedHosts.has(host)) {
      throw new ApplicationError('PROJECT_SAFETY_BLOCKED', `Environment host ${host} is not allowed by Project Safety`, 403);
    }
  }
  for (const method of [stringValue(reset.method)].filter((value): value is string => Boolean(value))) {
    if (!safety.allowedHttpMethods.includes(method)) {
      throw new ApplicationError('PROJECT_SAFETY_BLOCKED', `${method} is not allowed by Project Safety`, 403);
    }
  }
  if (allowedActions.includes('PERFORM_CHECKOUT') && !safety.permitCheckoutSubmission) {
    throw new ApplicationError('PROJECT_SAFETY_BLOCKED', 'Checkout submission is blocked by Project Safety', 403);
  }
  if ((allowedActions.includes('SUBMIT_MOCK_PAYMENT') || payment.mode === 'MOCK') && !safety.permitMockPayment) {
    throw new ApplicationError('PROJECT_SAFETY_BLOCKED', 'Mock payment is blocked by Project Safety', 403);
  }
  if (allowedActions.includes('CREATE_TEST_ORDER') && !safety.permitTestOrderCreation) {
    throw new ApplicationError('PROJECT_SAFETY_BLOCKED', 'Test order creation is blocked by Project Safety', 403);
  }
}

function validateJourneySafety(
  journey: { steps: Array<{ order: number; action: string; selector: string | null; value: string | null; metadata: unknown }> },
  startPath: string,
  environmentBaseUrl: string,
  allowlist: string[],
  prohibitedActions: string[],
  safety: LaunchSafetyConfiguration,
): void {
  const allowedHosts = new Set(allowlist.map((host) => host.toLowerCase()));
  validateNavigation(startPath, environmentBaseUrl, allowedHosts);
  const ordered = [...journey.steps].sort((left, right) => left.order - right.order);
  ordered.forEach((step, index) => {
    if (step.order !== index) throw new ApplicationError('JOURNEY_NOT_READY', 'Journey steps must be ordered contiguously', 422);
    if (!supportedJourneyActions.has(step.action)) throw new ApplicationError('JOURNEY_ACTION_UNSUPPORTED', `Unsupported Journey action: ${step.action}`, 422);
    const action = normaliseJourneyAction(step.action);
    if (action === 'GOTO') validateNavigation(requiredValue(step.value, 'GOTO requires a path'), environmentBaseUrl, allowedHosts);
    if (['CLICK', 'FILL', 'WAIT_FOR', 'ASSERT_VISIBLE'].includes(action) && !step.selector) {
      throw new ApplicationError('JOURNEY_NOT_READY', `${action} requires a selector`, 422);
    }
    if (action === 'FILL' && step.value === null) {
      throw new ApplicationError('JOURNEY_NOT_READY', 'FILL requires a value', 422);
    }
    const signal = `${action} ${step.selector ?? ''} ${step.value ?? ''} ${JSON.stringify(record(step.metadata))}`.toLowerCase();
    const checkout = /checkout-button|pay-button|\/checkout\b/.test(signal);
    const payment = /pay-button|payment/.test(signal);
    const order = /pay-button|create[^a-z]*order|order-confirmation|order-id/.test(signal);
    if (checkout && !safety.permitCheckoutSubmission) throw new ApplicationError('PROJECT_SAFETY_BLOCKED', 'Checkout Journey action is blocked by Project Safety', 403);
    if (payment && !safety.permitMockPayment) throw new ApplicationError('PROJECT_SAFETY_BLOCKED', 'Mock-payment Journey action is blocked by Project Safety', 403);
    if (order && !safety.permitTestOrderCreation) throw new ApplicationError('PROJECT_SAFETY_BLOCKED', 'Test-order Journey action is blocked by Project Safety', 403);
    for (const prohibited of prohibitedActions) {
      const blocked = prohibited.toLowerCase();
      if (
        (blocked.includes('checkout') && checkout) ||
        (blocked.includes('payment') && !blocked.includes('real payment') && payment) ||
        (blocked.includes('order') && order)
      ) {
        throw new ApplicationError('PROJECT_SAFETY_BLOCKED', `Journey conflicts with prohibited action: ${prohibited}`, 403);
      }
    }
  });
}

function runtimeEnvironmentConfiguration(configuration: Record<string, unknown>) {
  const reset = record(configuration.reset);
  const payment = record(configuration.payment);
  const testData = record(configuration.testData);
  const resetEndpoint = stringValue(reset.endpoint);
  const resetMethod = stringValue(reset.method);
  const paymentMode = stringValue(payment.mode);
  const paymentResult = stringValue(payment.result);
  return {
    reset: {
      mode: stringValue(reset.mode) ?? 'NONE',
      ...(resetEndpoint ? { endpoint: resetEndpoint } : {}),
      ...(resetMethod ? { method: resetMethod } : {}),
      ...(typeof reset.beforeEachWorld === 'boolean' ? { beforeEachWorld: reset.beforeEachWorld } : {}),
      ...(typeof reset.expectedStatus === 'number' ? { expectedStatus: reset.expectedStatus } : {}),
    },
    payment: {
      ...(paymentMode ? { mode: paymentMode } : {}),
      ...(typeof payment.delayMs === 'number' ? { delayMs: payment.delayMs } : {}),
      ...(paymentResult ? { result: paymentResult } : {}),
    },
    testData,
    allowedActions: stringArray(configuration.allowedActions),
  };
}

function validateNavigation(target: string, baseUrl: string, allowedHosts: Set<string>): void {
  if (/^(javascript|file|data|ftp):/i.test(target) || target.startsWith('//') || target.includes('\\')) {
    throw new ApplicationError('JOURNEY_ACTION_UNSUPPORTED', 'Navigation target is not supported', 422);
  }
  const url = target.startsWith('/') ? new URL(target, baseUrl) : new URL(target);
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApplicationError('JOURNEY_ACTION_UNSUPPORTED', 'Only HTTP and HTTPS navigation is supported', 422);
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new ApplicationError('PROJECT_SAFETY_BLOCKED', `Navigation host ${url.hostname.toLowerCase()} is not allowed by Project Safety`, 403);
  }
}

function normaliseJourneyAction(action: string): string {
  if (action === 'NAVIGATE') return 'GOTO';
  if (action === 'WAIT') return 'WAIT_FOR';
  if (action === 'ASSERT') return 'ASSERT_VISIBLE';
  return action;
}

function requiredValue(value: string | null, message: string): string {
  if (!value) throw new ApplicationError('JOURNEY_NOT_READY', message, 422);
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function scenarioName(prompt: string): string {
  return `Scenario launch ${new Date().toISOString()} ${prompt.trim().slice(0, 60)}`.slice(0, 180);
}

export class InvestigationRepository {
  constructor(private readonly database: DatabaseClient) {}

  async validateCreationScope(organisationId: string, userId: string, input: CreateInvestigationInput): Promise<InvestigationCreationScope | null> {
    const [membership, project, environment, journey, invariants] = await Promise.all([
      this.database.organisationMember.findFirst({ where: { userId, organisationId, user: { deletedAt: null }, organisation: { deletedAt: null } }, select: { role: true } }),
      this.database.project.findFirst({
        where: { id: input.projectId, organisationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          safetyPolicies: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { id: true, domainAllowlist: true, blockedActions: true, configuration: true },
          },
        },
      }),
      this.database.environment.findFirst({
        where: { id: input.environmentId, projectId: input.projectId, deletedAt: null },
        select: {
          id: true,
          name: true,
          type: true,
          baseUrl: true,
          apiBaseUrl: true,
          validationStatus: true,
          configuration: true,
        },
      }),
      this.database.journey.findFirst({
        where: { id: input.journeyId, projectId: input.projectId, deletedAt: null },
        include: { steps: { orderBy: { order: 'asc' } } },
      }),
      this.database.invariant.findMany({
        where: { id: { in: input.invariantIds }, projectId: input.projectId, organisationId, deletedAt: null },
        orderBy: { id: 'asc' },
      }),
    ]);
    if (!project) return null;
    if (!membership || !hasOrganisationPermission(membership.role, 'EDIT_PROJECTS') || membership.role === 'VIEWER') {
      throw new ApplicationError('INSUFFICIENT_PERMISSION', 'Your organisation role does not permit investigation launch', 403);
    }
    const safetyPolicy = project.safetyPolicies[0];
    if (!safetyPolicy) {
      throw new ApplicationError('PROJECT_SAFETY_BLOCKED', 'Project Safety must be configured before launch', 409);
    }
    const safety = parseLaunchSafety(safetyPolicy.configuration);
    if (!safety) {
      throw new ApplicationError('PROJECT_SAFETY_BLOCKED', 'Project Safety configuration is invalid', 409);
    }
    if (!environment) return null;
    if (!environment.baseUrl) throw new ApplicationError('ENVIRONMENT_NOT_READY', 'Environment is missing a runtime base URL', 422);
    if (environment.validationStatus !== 'READY') throw new ApplicationError('ENVIRONMENT_NOT_READY', `Environment status is ${environment.validationStatus}`, 422);
    const environmentConfiguration = record(environment.configuration);
    validateEnvironmentSafety(environment, environmentConfiguration, safetyPolicy.domainAllowlist, safety);
    if (!journey) return null;
    const journeyConfiguration = readJourneyConfiguration(journey);
    if (!journeyConfiguration) throw new ApplicationError('JOURNEY_NOT_READY', 'Journey must use the Builder runtime contract before launch', 422);
    if (journeyConfiguration.state !== 'ENABLED') throw new ApplicationError('JOURNEY_DISABLED', 'Journey must be enabled before launch', 422);
    if (journeyConfiguration.validationStatus !== 'READY') throw new ApplicationError('JOURNEY_NOT_READY', `Journey validation status is ${journeyConfiguration.validationStatus}`, 422);
    if (journeyConfiguration.environmentId !== environment.id) throw new ApplicationError('JOURNEY_ENVIRONMENT_MISMATCH', 'Journey is not configured for the selected Environment', 422);
    validateJourneySafety(journey, journeyConfiguration.startPath, environment.baseUrl, safetyPolicy.domainAllowlist, safetyPolicy.blockedActions, safety);
    const runtimeJourney = toRuntimeJourney(journey);
    const invariantById = new Map(invariants.map((invariant) => [invariant.id, invariant]));
    const orderedInvariants = input.invariantIds.map((id) => invariantById.get(id));
    if (orderedInvariants.some((invariant) => !invariant)) return null;
    const runtimeInvariants = orderedInvariants.map((invariant) => {
      const assertion = persistedInvariantAssertionSchema.safeParse(invariant!.assertion);
      if (!assertion.success) throw new ApplicationError('INVARIANT_NOT_READY', `Invariant ${invariant!.id} has invalid structured configuration`, 422);
      if (!assertion.data.enabled) throw new ApplicationError('INVARIANT_DISABLED', `Invariant ${invariant!.id} is disabled`, 422);
      return mapPersistedInvariantToRuntimeDefinition(invariant!);
    });
    const scenarioId = `scenario_launch_${randomUUID()}`;
    const launchedAt = new Date().toISOString();
    return {
      organisationId,
      scenarioId,
      safetyPolicyId: safetyPolicy.id,
      environmentBaseUrl: environment.baseUrl,
      ...(environment.apiBaseUrl ? { environmentApiBaseUrl: environment.apiBaseUrl } : {}),
      projectName: project.name,
      environmentName: environment.name,
      journeyName: journey.name,
      invariantIds: input.invariantIds,
      invariants: orderedInvariants.map((invariant) => ({
        id: invariant!.id,
        name: invariant!.name,
        ...(invariant!.description ? { description: invariant!.description } : {}),
      })),
      launch: {
        inputSource: 'PERSISTED_CONFIGURATION',
        actorUserId: userId,
        launchedAt,
        scenario: { prompt: input.scenario.prompt, controls: input.scenario.controls },
        environment: {
          id: environment.id,
          name: environment.name,
          type: String(environment.type),
          baseUrl: environment.baseUrl,
          ...(environment.apiBaseUrl ? { apiBaseUrl: environment.apiBaseUrl } : {}),
          ...runtimeEnvironmentConfiguration(environmentConfiguration),
        },
        journey: runtimeJourney,
        invariants: runtimeInvariants,
        safety: {
          policyId: safetyPolicy.id,
          domainAllowlist: safetyPolicy.domainAllowlist,
          allowedHttpMethods: safety.allowedHttpMethods,
          permitCheckoutSubmission: safety.permitCheckoutSubmission,
          permitMockPayment: safety.permitMockPayment,
          permitTestOrderCreation: safety.permitTestOrderCreation,
          prohibitedActions: safetyPolicy.blockedActions,
        },
        validation: { status: 'READY', warnings: [] },
      },
    };
  }

  async create(input: CreateInvestigationInput, scope: InvestigationCreationScope): Promise<string> {
    return this.database.$transaction(async (transaction) => {
      await transaction.scenario.create({ data: {
        id: scope.scenarioId,
        projectId: input.projectId,
        name: scenarioName(input.scenario.prompt),
        prompt: input.scenario.prompt,
        controls: json(input.scenario.controls),
      } });
      const investigation = await transaction.investigation.create({ data: {
        organisationId: scope.organisationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        journeyId: input.journeyId,
        scenarioId: scope.scenarioId,
        ...(scope.safetyPolicyId ? { safetyPolicyId: scope.safetyPolicyId } : {}),
        name: `Checkout investigation: ${input.scenario.prompt.slice(0, 120)}`,
        status: 'PLANNING',
        startedAt: new Date(),
      } });
      await transaction.investigationEvent.create({ data: {
        investigationId: investigation.id,
        type: 'investigation_created',
        data: messageData('Investigation created from persisted Project configuration.', {
          status: 'PLANNING',
          projectId: input.projectId,
          environmentId: input.environmentId,
          journeyId: input.journeyId,
          invariantIds: input.invariantIds,
          scenarioId: scope.scenarioId,
          inputSource: scope.launch.inputSource,
        }),
      } });
      return investigation.id;
    });
  }

  async persistPlan(input: CreateInvestigationInput, scope: InvestigationCreationScope, investigationId: string, plan: DeterministicExperimentPlan): Promise<string> {
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.experimentPlan.findFirst({ where: { investigationId }, orderBy: { version: 'desc' } });
      if (existing) return existing.id;
      const planner = plan.planner;
      await transaction.investigationEvent.createMany({ data: [
        { investigationId, type: 'planner_started', data: messageData('Experiment planner started.', { plannerStatus: 'PENDING', requestedProvider: planner?.requestedProvider ?? 'DETERMINISTIC' }) },
        { investigationId, type: 'planner_request_created', data: messageData('Planner request created from validated investigation input.', { plannerVersion: planner?.version, maximumWorlds: input.scenario.controls.maximumWorlds }) },
      ] });
      if (planner?.requestedProvider === 'OPENAI' || planner?.requestedProvider === 'KIMI') {
        const providerLabel = planner.requestedProvider === 'KIMI' ? 'Kimi' : 'OpenAI';
        await transaction.investigationEvent.create({ data: { investigationId, type: 'planner_provider_request_started', data: messageData(`${providerLabel} planner request started.`, { requestedProvider: planner.requestedProvider, model: planner.model }) } });
        await transaction.investigationEvent.create({ data: { investigationId, type: 'planner_provider_request_completed', data: messageData(`${providerLabel} planner request completed.`, { requestedProvider: planner.requestedProvider, model: planner.model, generationDurationMs: planner.generationDurationMs, usage: planner.usage }) } });
        await transaction.investigationEvent.create({ data: { investigationId, type: 'planner_output_received', data: messageData('Planner structured output received.', { requestedProvider: planner.requestedProvider, model: planner.model }) } });
      }
      await transaction.investigationEvent.create({ data: { investigationId, type: 'planner_validation_started', data: messageData('Planner validation started.', { plannerStatus: 'VALIDATING' }) } });
      if (planner?.plannerStatus === 'FALLBACK_USED') {
        await transaction.investigationEvent.create({ data: { investigationId, type: 'planner_plan_rejected', data: messageData('Planner output rejected; deterministic fallback will be used.', { plannerStatus: 'REJECTED', fallbackReason: planner.fallbackReason, rejectedWorldCount: planner.rejectedWorldCount }) } });
        await transaction.investigationEvent.create({ data: { investigationId, type: 'planner_fallback_used', data: messageData('Deterministic fallback planner used.', { requestedProvider: planner.requestedProvider, effectiveProvider: planner.effectiveProvider, plannerStatus: 'FALLBACK_USED', fallbackReason: planner.fallbackReason }) } });
      } else {
        await transaction.investigationEvent.create({ data: { investigationId, type: planner?.plannerStatus === 'PARTIALLY_ACCEPTED' ? 'planner_plan_partially_accepted' : 'planner_plan_accepted', data: messageData('Planner plan accepted.', { plannerStatus: planner?.plannerStatus ?? 'ACCEPTED', effectiveProvider: planner?.effectiveProvider ?? 'DETERMINISTIC', acceptedWorldCount: planner?.acceptedWorldCount ?? plan.worlds.length, rejectedWorldCount: planner?.rejectedWorldCount ?? 0, warningCount: planner?.warnings.length ?? 0 }) } });
      }
      const persisted = await transaction.experimentPlan.create({ data: {
        investigationId,
        journeyId: input.journeyId,
        scenarioId: scope.scenarioId,
        provider: planner?.effectiveProvider === 'OPENAI' ? 'OPENAI' : planner?.effectiveProvider === 'KIMI' ? 'KIMI' : 'MOCK',
        plan: json(plan),
        planningExplanation: plan.planningExplanation,
        estimatedComputeUnits: planner?.usage && typeof planner.usage === 'object' && 'totalTokens' in planner.usage && typeof planner.usage.totalTokens === 'number' ? planner.usage.totalTokens : 0,
      } });
      await transaction.investigationEvent.create({ data: { investigationId, type: 'planner_completed', data: messageData('Experiment planner completed.', { plannerStatus: planner?.plannerStatus ?? 'ACCEPTED', effectiveProvider: planner?.effectiveProvider ?? 'DETERMINISTIC', planId: persisted.id, acceptedWorldCount: planner?.acceptedWorldCount ?? plan.worlds.length, rejectedWorldCount: planner?.rejectedWorldCount ?? 0 }) } });
      return persisted.id;
    });
  }

  async orchestrationContext(id: string): Promise<InvestigationOrchestrationContext | null> {
    const record = await this.database.investigation.findUnique({ where: { id }, select: {
      id: true, organisationId: true, projectId: true, environmentId: true, journeyId: true, scenarioId: true,
      environment: { select: { baseUrl: true } },
      plans: { orderBy: { version: 'desc' }, take: 1, select: { id: true, plan: true } },
    } });
    const persistedPlan = record?.plans[0];
    if (!record || !persistedPlan) return null;
    const plan = persistedPlan.plan as unknown as DeterministicExperimentPlan;
    return {
      id: record.id,
      organisationId: record.organisationId,
      projectId: record.projectId,
      environmentId: record.environmentId,
      journeyId: record.journeyId,
      scenarioId: record.scenarioId,
      environmentBaseUrl: plan.launch?.environment.baseUrl ?? record.environment.baseUrl,
      ...(plan.launch?.environment.apiBaseUrl ? { environmentApiBaseUrl: plan.launch.environment.apiBaseUrl } : {}),
      planId: persistedPlan.id,
      plan,
    };
  }

  async queueInitialWorlds(context: InvestigationOrchestrationContext): Promise<CreatedWorldRecord[]> {
    return this.database.$transaction(async (transaction) => {
      const preparedRepairVerification = (context.plan as unknown as { executionMode?: unknown }).executionMode === 'REPAIR_VERIFICATION';
      const changed = await transaction.investigation.updateMany({
        where: { id: context.id, status: preparedRepairVerification ? 'QUEUED' : 'PLANNING' },
        data: { status: 'QUEUED' },
      });
      if (changed.count !== 1) throw new Error(preparedRepairVerification ? 'Prepared Repair Verification is not queued' : 'Investigation is not in PLANNING state');
      await transaction.investigationEvent.create({ data: { investigationId: context.id, type: 'plan_created', data: messageData('Deterministic experiment plan created.', { status: 'QUEUED', maximumConcurrentWorkers: context.plan.maximumConcurrentWorkers }) } });
      const created: CreatedWorldRecord[] = [];
      for (const definition of context.plan.worlds) {
        const world = await transaction.world.create({ data: { investigationId: context.id, experimentPlanId: context.planId, status: 'QUEUED', configuration: json(definition), reason: definition.reason, randomSeed: definition.randomSeed } });
        const experiment = await transaction.experiment.create({ data: { investigationId: context.id, worldId: world.id, status: 'QUEUED', kind: 'INITIAL' } });
        await transaction.investigationEvent.createMany({ data: [
          { investigationId: context.id, type: 'world_generated', data: json({ message: `${definition.name} generated.`, worldId: world.id, creationOrder: definition.creationOrder }) },
          { investigationId: context.id, type: 'world_queued', data: json({ message: `${definition.name} queued for execution.`, worldId: world.id, experimentId: experiment.id }) },
        ] });
        created.push({ id: world.id, experimentId: experiment.id, definition });
      }
      return created;
    });
  }

  async eligibleAdaptiveFindings(investigationId: string, limit: number): Promise<AdaptiveFindingCandidate[]> {
    const findings = await this.database.finding.findMany({
      where: { investigationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        conditions: true,
      },
    });
    const candidates: AdaptiveFindingCandidate[] = [];
    for (const finding of findings) {
      if (candidates.length >= limit) break;
      const conditions = record(finding.causalConditions);
      if (conditions.causalStatus && conditions.causalStatus !== 'UNCONFIRMED') continue;
      if (finding.conditions.some(({ kind }) => kind === 'ADAPTIVE_REPRODUCTION_COMPLETED')) continue;
      const sourceWorldId = typeof conditions.worldId === 'string' ? conditions.worldId : undefined;
      const sourceExperimentId = typeof conditions.experimentId === 'string' ? conditions.experimentId : undefined;
      if (!sourceWorldId || !sourceExperimentId) continue;
      const world = await this.database.world.findUnique({ where: { id: sourceWorldId }, select: { configuration: true, status: true } });
      const sourceWorld = record(world?.configuration) as unknown as DeterministicWorldDefinition;
      if (!world || world.status === 'CANCELLED' || world.status === 'QUEUED' || world.status === 'RUNNING') continue;
      if (sourceWorld.origin === 'ADAPTIVE_REPRODUCTION') continue;
      if (!sourceWorld.duplicateSubmissionBug || !sourceWorld.doubleSubmit) continue;
      candidates.push({
        id: finding.id,
        fingerprint: finding.fingerprint ?? finding.id,
        title: finding.title,
        confidence: finding.confidence,
        reproductionCount: finding.reproductionCount,
        causalConditions: conditions,
        sourceWorldId,
        sourceExperimentId,
        sourceWorld,
        invariantEvaluationIds: stringArray(conditions.invariantEvaluationIds),
        evidenceArtifactIds: stringArray(conditions.evidenceArtifactIds),
      });
    }
    await this.database.investigationEvent.create({
      data: {
        investigationId,
        type: 'follow_up_generated',
        data: messageData(`${candidates.length} adaptive reproduction candidate(s) found.`, { phase: 'adaptive_eligibility_checked', candidateCount: candidates.length }),
      },
    });
    return candidates;
  }

  async transitionToObserving(id: string, message = 'Initial worlds settled; observing validated findings.'): Promise<boolean> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'OBSERVING' } });
    if (changed.count === 1) {
      await this.database.investigationEvent.create({ data: { investigationId: id, type: 'follow_up_generated', data: messageData(message, { phase: 'observing_started', status: 'OBSERVING' }) } });
      return true;
    }
    return (await this.database.investigation.findUnique({ where: { id }, select: { status: true } }))?.status === 'OBSERVING';
  }

  async transitionToAdapting(id: string, findingId: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'OBSERVING' }, data: { status: 'ADAPTING' } });
    if (changed.count !== 1) throw new Error('Investigation is not in OBSERVING state');
    await this.database.investigationEvent.create({ data: { investigationId: id, type: 'reproduction_started', data: messageData('Adaptive reproduction started.', { status: 'ADAPTING', findingId }) } });
  }

  async transitionToReproducing(id: string, findingId: string, reproductionRunId: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'ADAPTING' }, data: { status: 'REPRODUCING' } });
    if (changed.count !== 1) throw new Error('Investigation is not in ADAPTING state');
    await this.database.investigationEvent.create({ data: { investigationId: id, type: 'reproduction_started', data: messageData('Adaptive follow-up worlds are running.', { status: 'REPRODUCING', findingId, reproductionRunId }) } });
  }

  async completeAdaptiveStage(id: string, findingId: string, reproductionRunId: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'REPRODUCING' }, data: { status: 'OBSERVING' } });
    if (changed.count === 1) {
      await this.database.investigationEvent.create({ data: { investigationId: id, type: 'follow_up_generated', data: messageData('Adaptive reproduction completed.', { phase: 'reproduction_completed', status: 'OBSERVING', findingId, reproductionRunId }) } });
    }
  }

  async eligibleMinimisationFindings(investigationId: string, limit: number, maximumTotalWorlds: number): Promise<MinimisationFindingCandidate[]> {
    const investigation = await this.database.investigation.findUnique({
      where: { id: investigationId },
      select: { status: true, _count: { select: { worlds: true } } },
    });
    if (!investigation || investigation.status === 'CANCELLED' || investigation._count.worlds >= maximumTotalWorlds || limit <= 0) {
      await this.database.investigationEvent.create({ data: { investigationId, type: 'minimisation_eligibility_checked', data: messageData('No minimisation candidates are eligible.', { phase: 'minimisation_eligibility_checked', candidateCount: 0 }) } });
      return [];
    }
    const findings = await this.database.finding.findMany({
      where: { investigationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        conditions: true,
        reproductions: { where: { reproduced: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        evidence: { select: { artifactId: true } },
      },
    });
    const candidates: MinimisationFindingCandidate[] = [];
    for (const finding of findings) {
      if (candidates.length >= limit) break;
      const conditions = record(finding.causalConditions);
      if (finding.conditions.some(({ kind }) => kind === 'MINIMISATION_COMPLETED')) continue;
      if (conditions.minimisationStatus === 'COMPLETED') continue;
      const causalStatus = typeof conditions.causalStatus === 'string' ? conditions.causalStatus : 'UNCONFIRMED';
      if (causalStatus !== 'REPRODUCED' && causalStatus !== 'SUPPORTED') continue;
      const reproductionRunId = typeof conditions.latestReproductionRunId === 'string'
        ? conditions.latestReproductionRunId
        : finding.reproductions[0]?.id;
      const sourceWorldId = typeof conditions.worldId === 'string' ? conditions.worldId : undefined;
      const sourceExperimentId = typeof conditions.experimentId === 'string' ? conditions.experimentId : undefined;
      if (!sourceWorldId || !sourceExperimentId || !reproductionRunId) continue;
      if (!finding.reproductions.length) continue;
      const world = await this.database.world.findUnique({ where: { id: sourceWorldId }, select: { configuration: true, status: true } });
      const sourceWorld = record(world?.configuration) as unknown as DeterministicWorldDefinition;
      if (!world || world.status === 'CANCELLED' || sourceWorld.origin === 'MINIMISATION') continue;
      if (!sourceWorld.duplicateSubmissionBug || !sourceWorld.doubleSubmit) continue;
      const evidenceArtifactIds = [...new Set([...finding.evidence.map(({ artifactId }) => artifactId), ...stringArray(conditions.evidenceArtifactIds)])];
      if (evidenceArtifactIds.length === 0) continue;
      candidates.push({
        id: finding.id,
        fingerprint: finding.fingerprint ?? finding.id,
        title: finding.title,
        summary: finding.summary,
        severity: finding.severity,
        confidence: finding.confidence,
        reproductionCount: finding.reproductionCount,
        causalConditions: conditions,
        numericConfidence: numberValue(conditions.numericConfidence) ?? 0.75,
        sourceWorldId,
        sourceExperimentId,
        sourceWorld,
        reproductionRunId,
        invariantEvaluationIds: stringArray(conditions.supportingInvariantEvaluationIds).length
          ? stringArray(conditions.supportingInvariantEvaluationIds)
          : stringArray(conditions.invariantEvaluationIds),
        evidenceArtifactIds,
      });
    }
    await this.database.investigationEvent.create({ data: { investigationId, type: 'minimisation_eligibility_checked', data: messageData(`${candidates.length} minimisation candidate(s) found.`, { phase: 'minimisation_eligibility_checked', candidateCount: candidates.length }) } });
    return candidates;
  }

  async transitionToMinimising(id: string, findingId: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'OBSERVING' }, data: { status: 'MINIMISING' } });
    if (changed.count !== 1) throw new Error('Investigation is not in OBSERVING state');
    await this.database.investigationEvent.create({ data: { investigationId: id, type: 'minimisation_started', data: messageData('Deterministic failure-condition minimisation started.', { status: 'MINIMISING', findingId }) } });
  }

  async completeMinimisationStage(id: string, findingId: string, runId: string, status: 'COMPLETED' | 'INCONCLUSIVE' | 'CANCELLED'): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'MINIMISING' }, data: { status: 'OBSERVING' } });
    if (changed.count === 1) {
      await this.database.investigationEvent.create({ data: { investigationId: id, type: status === 'COMPLETED' ? 'minimisation_completed' : status === 'CANCELLED' ? 'minimisation_cancelled' : 'minimisation_inconclusive', data: messageData(`Minimisation ${status.toLowerCase()}.`, { phase: `minimisation_${status.toLowerCase()}`, status: 'OBSERVING', findingId, minimisationRunId: runId }) } });
    }
  }

  async createMinimisationRun(plan: MinimisationPlan): Promise<MinimisationPlanCreationResult> {
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.minimisationRun.findUnique({ where: { id: plan.id } });
      if (existing) return { run: minimisationRunRecord(existing), created: false };
      const created = await transaction.minimisationRun.create({ data: {
        id: plan.id,
        investigationId: plan.investigationId,
        findingId: plan.findingId,
        sourceWorldId: plan.sourceWorldId,
        reproductionRunId: plan.reproductionRunId,
        status: 'RUNNING',
        strategyVersion: plan.strategyVersion,
        originalFailingConfiguration: json(plan.baselineFailingConfiguration),
        currentRetainedConditions: json({}),
        removedConditions: json({}),
        inconclusiveConditions: json({}),
        ...(plan.candidateVariables.find(({ name }) => name === 'paymentDelayMs')?.lowerKnownPassingValue !== undefined ? { knownPassingDelayMs: plan.candidateVariables.find(({ name }) => name === 'paymentDelayMs')!.lowerKnownPassingValue } : {}),
        ...(plan.candidateVariables.find(({ name }) => name === 'paymentDelayMs')?.upperKnownFailingValue !== undefined ? { knownFailingDelayMs: plan.candidateVariables.find(({ name }) => name === 'paymentDelayMs')!.upperKnownFailingValue } : {}),
        maximumTrials: plan.maximumTrials,
      } });
      await transaction.findingCondition.create({ data: { findingId: plan.findingId, kind: 'MINIMISATION_PLAN', condition: json(plan) } });
      await transaction.investigationEvent.create({ data: { investigationId: plan.investigationId, type: 'minimisation_plan_created', data: messageData('Deterministic minimisation plan created.', { phase: 'minimisation_plan_created', findingId: plan.findingId, minimisationRunId: plan.id, generatedCandidateCount: plan.candidateVariables.length, maximumTrials: plan.maximumTrials }) } });
      return { run: minimisationRunRecord(created), created: true };
    });
  }

  async createMinimisationCandidateWorld(context: InvestigationOrchestrationContext, candidate: MinimisationCandidateDefinition): Promise<MinimisationCandidateCreationResult> {
    return this.database.$transaction(async (transaction) => {
      const existingCandidate = await transaction.minimisationCandidate.findUnique({ where: { id: candidate.id } });
      if (existingCandidate?.worldId && existingCandidate.experimentId) {
        const world = await transaction.world.findUnique({ where: { id: existingCandidate.worldId } });
        return {
          record: {
            id: existingCandidate.worldId,
            experimentId: existingCandidate.experimentId,
            definition: record(world?.configuration) as unknown as DeterministicWorldDefinition,
          },
          created: false,
        };
      }
      const world = await transaction.world.create({ data: { investigationId: context.id, experimentPlanId: context.planId, status: 'QUEUED', configuration: json(candidate.world), reason: candidate.world.reason, randomSeed: candidate.world.randomSeed } });
      const experiment = await transaction.experiment.create({ data: { investigationId: context.id, worldId: world.id, status: 'QUEUED', kind: 'MINIMISATION' } });
      await transaction.minimisationCandidate.upsert({
        where: { id: candidate.id },
        update: { worldId: world.id, experimentId: experiment.id, result: 'QUEUED', conditionDecision: 'INCONCLUSIVE' },
        create: {
          id: candidate.id,
          minimisationRunId: candidate.minimisationRunId,
          worldId: world.id,
          experimentId: experiment.id,
          sequence: candidate.sequence,
          purpose: candidate.purpose,
          variableName: candidate.variable.name,
          sourceValue: json(candidate.variable.sourceValue),
          candidateValue: json(candidate.candidateValue),
        },
      });
      await transaction.investigationEvent.createMany({ data: [
        { investigationId: context.id, type: candidate.purpose === 'DELAY_BOUNDARY_SEARCH' ? 'minimisation_range_candidate_generated' : candidate.purpose === 'CONFIRM_MINIMAL_SET' ? 'minimal_reproduction_candidate_created' : 'minimisation_candidate_generated', data: json({ message: `${candidate.world.name} generated.`, phase: 'minimisation_candidate_generated', minimisationRunId: candidate.minimisationRunId, candidateId: candidate.id, worldId: world.id, experimentId: experiment.id, variable: candidate.variable.name, sourceValue: candidate.variable.sourceValue, candidateValue: candidate.candidateValue, purpose: candidate.purpose }) },
        { investigationId: context.id, type: 'minimisation_candidate_queued', data: json({ message: `${candidate.world.name} queued for minimisation.`, phase: 'minimisation_candidate_queued', minimisationRunId: candidate.minimisationRunId, candidateId: candidate.id, worldId: world.id, experimentId: experiment.id }) },
      ] });
      return { record: { id: world.id, experimentId: experiment.id, definition: candidate.world }, created: true };
    });
  }

  async minimisationWorldResult(candidateId: string): Promise<MinimisationWorldResultRecord | null> {
    const candidate = await this.database.minimisationCandidate.findUnique({
      where: { id: candidateId },
      include: {
        world: true,
        experiment: {
          include: {
            evaluations: { select: { id: true, passed: true } },
            artifacts: { select: { id: true } },
          },
        },
      },
    });
    if (!candidate?.world || !candidate.experiment) return null;
    return {
      candidateId: candidate.id,
      worldId: candidate.world.id,
      experimentId: candidate.experiment.id,
      purpose: candidate.purpose,
      variableName: candidate.variableName,
      world: record(candidate.world.configuration) as unknown as DeterministicWorldDefinition,
      status: candidate.experiment.status,
      invariantEvaluationIds: candidate.experiment.evaluations.filter(({ passed }) => !passed).map(({ id }) => id),
      evidenceArtifactIds: candidate.experiment.artifacts.map(({ id }) => id),
    };
  }

  async updateMinimisationCandidate(input: MinimisationCandidateUpdateInput): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const existingRun = await transaction.minimisationRun.findUnique({ where: { id: input.runId } });
      const generated = stringArray(existingRun?.generatedCandidateWorldIds);
      const candidate = await transaction.minimisationCandidate.findUnique({ where: { id: input.candidateId } });
      await transaction.minimisationCandidate.update({ where: { id: input.candidateId }, data: {
        result: input.result,
        conditionDecision: input.decision,
        invariantIds: json(input.invariantIds),
        supportingEvidenceIds: json(input.evidenceArtifactIds),
        completedAt: new Date(),
      } });
      const candidates = await transaction.minimisationCandidate.findMany({
        where: { minimisationRunId: input.runId },
        select: { variableName: true, candidateValue: true, result: true },
      });
      const bounds = aggregateMinimisationDelayBounds({
        existingPassingDelayMs: existingRun?.knownPassingDelayMs ?? null,
        existingFailingDelayMs: existingRun?.knownFailingDelayMs ?? null,
        candidates,
      });
      if (bounds.contradictory) {
        throw new Error('Contradictory minimisation delay bounds detected');
      }
      await transaction.minimisationRun.update({ where: { id: input.runId }, data: {
        currentRetainedConditions: json(input.retainedConditions),
        removedConditions: json(input.removedConditions),
        inconclusiveConditions: json(input.inconclusiveConditions),
        ...(bounds.knownPassingDelayMs !== undefined ? { knownPassingDelayMs: bounds.knownPassingDelayMs } : {}),
        ...(bounds.knownFailingDelayMs !== undefined ? { knownFailingDelayMs: bounds.knownFailingDelayMs } : {}),
        generatedCandidateWorldIds: json([...new Set([...generated, ...(candidate?.worldId ? [candidate.worldId] : [])])]),
        completedTrials: { increment: candidate?.completedAt ? 0 : 1 },
      } });
      await transaction.investigationEvent.create({ data: { investigationId: existingRun!.investigationId, type: 'minimisation_candidate_completed', data: messageData('Minimisation candidate completed.', { phase: 'minimisation_candidate_completed', minimisationRunId: input.runId, candidateId: input.candidateId, variable: candidate?.variableName, result: input.result, conditionDecision: input.decision, evidenceArtifactIds: input.evidenceArtifactIds, explanation: input.explanation }) } });
      if (input.decision === 'RETAINED') {
        await transaction.investigationEvent.create({ data: { investigationId: existingRun!.investigationId, type: 'minimisation_condition_retained', data: messageData('Condition retained in the minimal tested set.', { phase: 'minimisation_condition_retained', minimisationRunId: input.runId, candidateId: input.candidateId, variable: candidate?.variableName, conditionDecision: input.decision }) } });
      } else if (input.decision === 'REMOVED') {
        await transaction.investigationEvent.create({ data: { investigationId: existingRun!.investigationId, type: candidate?.purpose === 'DELAY_BOUNDARY_SEARCH' ? 'minimisation_range_updated' : 'minimisation_condition_removed', data: messageData(candidate?.purpose === 'DELAY_BOUNDARY_SEARCH' ? 'Failure range updated.' : 'Condition removed from the minimal tested set.', { phase: candidate?.purpose === 'DELAY_BOUNDARY_SEARCH' ? 'minimisation_range_updated' : 'minimisation_condition_removed', minimisationRunId: input.runId, candidateId: input.candidateId, variable: candidate?.variableName, conditionDecision: input.decision, passingBound: input.delayRange.lowerPassingBoundMs, failingBound: input.delayRange.upperFailingBoundMs }) } });
      } else {
        await transaction.investigationEvent.create({ data: { investigationId: existingRun!.investigationId, type: 'minimisation_condition_inconclusive', data: messageData('Condition remained inconclusive.', { phase: 'minimisation_condition_inconclusive', minimisationRunId: input.runId, candidateId: input.candidateId, variable: candidate?.variableName }) } });
      }
    });
  }

  async createAdaptiveWorlds(context: InvestigationOrchestrationContext, plan: AdaptiveReproductionPlan): Promise<CreatedWorldRecord[]> {
    return this.database.$transaction(async (transaction) => {
      const existingWorlds = await transaction.world.findMany({ where: { investigationId: context.id }, include: { experiments: { orderBy: { createdAt: 'asc' }, take: 1 } } });
      const existingByPurpose = new Map<string, CreatedWorldRecord>();
      for (const world of existingWorlds) {
        const configuration = record(world.configuration) as unknown as DeterministicWorldDefinition;
        const adaptive = configuration.adaptive;
        if (adaptive && adaptive.reproductionRunId === plan.generatedWorlds[0]?.adaptive.reproductionRunId) {
          const experiment = world.experiments[0];
          if (experiment) existingByPurpose.set(adaptive.adaptivePurpose, { id: world.id, experimentId: experiment.id, definition: configuration });
        }
      }
      const created: CreatedWorldRecord[] = [];
      const alreadyStoredPlan = await transaction.findingCondition.findFirst({ where: { findingId: plan.findingId, kind: 'ADAPTIVE_REPRODUCTION_PLAN' } });
      if (!alreadyStoredPlan) {
        await transaction.findingCondition.create({ data: { findingId: plan.findingId, kind: 'ADAPTIVE_REPRODUCTION_PLAN', condition: json(plan) } });
        await transaction.investigationEvent.create({ data: { investigationId: context.id, type: 'follow_up_generated', data: messageData('Deterministic adaptive reproduction plan created.', { phase: 'adaptive_plan_created', findingId: plan.findingId, reproductionRunId: plan.generatedWorlds[0]?.adaptive.reproductionRunId, generatedWorldCount: plan.generatedWorlds.length }) } });
      }
      for (const definition of plan.generatedWorlds) {
        const existing = existingByPurpose.get(definition.adaptive.adaptivePurpose);
        if (existing) {
          created.push(existing);
          continue;
        }
        const world = await transaction.world.create({ data: { investigationId: context.id, experimentPlanId: context.planId, status: 'QUEUED', configuration: json(definition), reason: definition.reason, randomSeed: definition.randomSeed } });
        const experiment = await transaction.experiment.create({ data: { investigationId: context.id, worldId: world.id, status: 'QUEUED', kind: 'ADAPTIVE_REPRODUCTION' } });
        await transaction.investigationEvent.createMany({ data: [
          { investigationId: context.id, type: 'world_generated', data: json({ message: `${definition.name} generated.`, phase: 'adaptive_world_generated', worldId: world.id, experimentId: experiment.id, findingId: plan.findingId, reproductionRunId: definition.adaptive.reproductionRunId, adaptivePurpose: definition.adaptive.adaptivePurpose, changedVariables: definition.adaptive.changedVariables }) },
          { investigationId: context.id, type: 'world_queued', data: json({ message: `${definition.name} queued for adaptive reproduction.`, phase: 'reproduction_world_queued', worldId: world.id, experimentId: experiment.id, findingId: plan.findingId, reproductionRunId: definition.adaptive.reproductionRunId }) },
        ] });
        created.push({ id: world.id, experimentId: experiment.id, definition });
      }
      return created.sort((left, right) => left.definition.creationOrder - right.definition.creationOrder);
    });
  }

  async transitionToRunning(id: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'RUNNING' } });
    if (changed.count !== 1) throw new Error('Investigation is not in QUEUED state');
  }

  async beginWorld(context: InvestigationOrchestrationContext, record: CreatedWorldRecord, provider: WorkerExecutionProvider, attemptNumber = 1, maximumAttempts = 1): Promise<PersistedWorldExecution | null> {
    return this.database.$transaction(async (transaction) => {
      const investigation = await transaction.investigation.findUnique({ where: { id: context.id }, select: { status: true } });
      if (!investigation || investigation.status === 'CANCELLED') return null;
      await transaction.world.update({ where: { id: record.id }, data: { status: 'RUNNING' } });
      await transaction.experiment.update({ where: { id: record.experimentId }, data: { status: 'RUNNING' } });
      const worker = await transaction.worker.create({ data: {
        organisationId: context.organisationId,
        providerId: provider,
        status: 'RUNNING',
        lastHeartbeatAt: new Date(),
        metadata: json({ provider, investigationId: context.id, worldId: record.id, experimentId: record.experimentId, attemptNumber, maximumAttempts }),
      } });
      const attempt = await transaction.executionAttempt.create({ data: { experimentId: record.experimentId, workerId: worker.id, attempt: attemptNumber, status: 'RUNNING', provider, startedAt: new Date(), metrics: json({ attemptNumber, maximumAttempts, queuedAt: new Date().toISOString() }) } });
      await transaction.investigationEvent.create({ data: { investigationId: context.id, type: 'worker_started', data: json({ message: `${record.definition.name} attempt ${attemptNumber} started.`, provider, status: 'RUNNING', worldId: record.id, experimentId: record.experimentId, workerId: worker.id, attemptId: attempt.id, attemptNumber, maximumAttempts }) } });
      if (!context.plan.launch) throw new Error('Persisted launch snapshot is missing');
      return {
        investigationId: context.id,
        organisationId: context.organisationId,
        projectId: context.projectId,
        environmentBaseUrl: context.environmentBaseUrl,
        ...(context.environmentApiBaseUrl ? { environmentApiBaseUrl: context.environmentApiBaseUrl } : {}),
        invariantId: context.plan.invariantIds[0]!,
        journey: context.plan.launch.journey,
        invariants: context.plan.launch.invariants,
        launch: context.plan.launch,
        worldId: record.id,
        experimentId: record.experimentId,
        workerId: worker.id,
        attemptId: attempt.id,
        world: record.definition,
        provider,
        attemptNumber,
        maximumAttempts,
      };
    });
  }

  async recordExecutionEvent(execution: PersistedWorldExecution, event: PersistedExecutionEvent): Promise<void> {
    const type = event.phase.includes('evidence')
      ? 'evidence_captured'
      : event.phase.includes('worker_execution')
        ? 'experiment_started'
        : event.phase.includes('ready') || event.phase.includes('setup_completed')
          ? 'sandbox_ready'
          : 'sandbox_provisioning';
    await this.database.investigationEvent.create({ data: {
      investigationId: execution.investigationId,
      type,
      data: json({
        message: event.message,
        phase: event.phase,
        provider: execution.provider,
        worldId: execution.worldId,
        experimentId: execution.experimentId,
        workerId: execution.workerId,
        attemptId: execution.attemptId,
        attemptNumber: execution.attemptNumber,
        ...(event.sandboxId ? { sandboxId: event.sandboxId } : {}),
        ...(event.metadata ?? {}),
      }),
    } });
  }

  async recordFleetEvent(investigationId: string, event: PersistedFleetEvent): Promise<void> {
    const type = event.phase.includes('evidence')
      ? 'evidence_captured'
      : event.phase.includes('completed') || event.phase.includes('terminal')
        ? 'worker_completed'
        : event.phase.includes('failed')
          ? 'worker_failed'
          : event.phase.includes('ready') || event.phase.includes('capacity')
            ? 'sandbox_ready'
            : 'sandbox_provisioning';
    await this.database.investigationEvent.create({ data: {
      investigationId,
      type,
      data: json({
        message: event.message,
        phase: event.phase,
        ...(event.worldId ? { worldId: event.worldId } : {}),
        ...(event.experimentId ? { experimentId: event.experimentId } : {}),
        ...(event.workerId ? { workerId: event.workerId } : {}),
        ...(event.sandboxId ? { sandboxId: event.sandboxId } : {}),
        ...(event.metadata ?? {}),
      }),
    } });
  }

  async recordMinimisationEvent(investigationId: string, type: string, message: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.database.investigationEvent.create({ data: {
      investigationId,
      type: type as never,
      data: messageData(message, { phase: type, ...metadata }),
    } });
  }

  async completeExecution(input: CompletedExecutionInput): Promise<void> {
    const { execution, result } = input;
    const correlatedEvaluations = correlateInvariantEvaluations(
      execution.invariants,
      result.invariantEvaluations,
    );
    const isCompleted = result.status === 'PASSED' || result.status === 'INVARIANT_VIOLATION';
    const experimentStatus = result.status === 'PASSED' ? 'PASSED' : result.status === 'INVARIANT_VIOLATION' ? 'FAILED' : 'ERROR';
    await this.database.$transaction(async (transaction) => {
      await transaction.executionAttempt.update({ where: { id: execution.attemptId }, data: {
        status: experimentStatus,
        completedAt: new Date(result.completedAt),
        exitCode: input.exitCode,
        durationMs: result.durationMs,
        result: json(result),
        resultPath: join(dirname(result.evidence.manifestPath), 'worker-result.json'),
        evidenceManifestPath: result.evidence.manifestPath,
        metrics: json({ ...result.metrics, providerMetadata: input.providerMetadata, attemptNumber: input.attemptNumber ?? execution.attemptNumber, maximumAttempts: input.maximumAttempts ?? execution.maximumAttempts }),
        provider: input.providerMetadata.provider,
        ...(input.stdoutSummary ? { stdoutSummary: input.stdoutSummary } : {}),
        ...(input.stderrSummary ? { stderrSummary: input.stderrSummary } : {}),
        ...(result.error ? { error: json(result.error) } : {}),
      } });
      await transaction.worker.update({ where: { id: execution.workerId }, data: {
        providerId: input.providerMetadata.provider,
        status: isCompleted ? 'COMPLETED' : 'FAILED',
        lastHeartbeatAt: new Date(),
        metadata: json({
          investigationId: execution.investigationId,
          worldId: execution.worldId,
          experimentId: execution.experimentId,
          attemptId: execution.attemptId,
          attemptNumber: input.attemptNumber ?? execution.attemptNumber,
          maximumAttempts: input.maximumAttempts ?? execution.maximumAttempts,
          ...input.providerMetadata,
        }),
      } });
      await transaction.experiment.update({ where: { id: execution.experimentId }, data: { status: experimentStatus } });
      await transaction.world.update({ where: { id: execution.worldId }, data: { status: isCompleted ? 'COMPLETED' : 'FAILED' } });

      const artifactIds: string[] = [];
      for (const artifact of input.artifacts) {
        const created = await transaction.evidenceArtifact.create({ data: {
          experimentId: execution.experimentId,
          executionAttemptId: execution.attemptId,
          type: artifact.type,
          storageProvider: input.providerMetadata.provider,
          storageKey: artifact.storageKey,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.sizeBytes,
          ...(artifact.checksum ? { checksum: artifact.checksum } : {}),
          redacted: artifact.type === 'CONSOLE_LOG' || artifact.type === 'NETWORK_LOG',
          metadata: json({ workerId: execution.workerId, worldId: execution.worldId, investigationId: execution.investigationId, ...(artifact.metadata ?? {}) }),
        } });
        artifactIds.push(created.id);
      }

      const evaluationIds: string[] = [];
      for (const { invariant, evaluation } of correlatedEvaluations) {
        const created = await transaction.invariantEvaluation.create({ data: {
          experimentId: execution.experimentId,
          invariantId: invariant.id,
          executionAttemptId: execution.attemptId,
          workerId: execution.workerId,
          passed: evaluation.passed,
          expected: json(evaluation.expected),
          observed: json({ type: evaluation.type, invariantResultId: evaluation.invariantId, value: evaluation.observed }),
          confidence: evaluation.confidence,
          evidenceReferences: json(evaluation.evidenceReferences),
          explanation: evaluation.explanation,
        } });
        evaluationIds.push(created.id);
        if (!evaluation.passed) await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'invariant_violated', data: json({ message: `${evaluation.type} was violated.`, worldId: execution.worldId, experimentId: execution.experimentId, evaluationId: created.id }) } });
      }

      await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: isCompleted ? 'worker_completed' : 'worker_failed', data: json({ message: `${execution.world.name} ${isCompleted ? 'completed' : 'failed to execute'}.`, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, attemptId: execution.attemptId, attemptNumber: input.attemptNumber ?? execution.attemptNumber, workerStatus: result.status, durationMs: result.durationMs }) } });
      if (artifactIds.length) await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'evidence_captured', data: json({ message: `${artifactIds.length} evidence artifacts recorded.`, worldId: execution.worldId, experimentId: execution.experimentId, artifactCount: artifactIds.length }) } });

      if (result.invariantEvaluations.some((evaluation) => !evaluation.passed)) {
        const title = 'Duplicate checkout submission under delayed payment response';
        const fingerprint = `${execution.investigationId}:duplicate-checkout:journey_checkout:delayed-repeat`;
        const finding = await transaction.finding.upsert({ where: { fingerprint }, update: { reproductionCount: { increment: 1 } }, create: {
            fingerprint,
            organisationId: execution.organisationId,
            projectId: execution.projectId,
            investigationId: execution.investigationId,
            title,
            severity: 'CRITICAL',
            confidence: 'POSSIBLE',
            reproductionCount: 1,
            summary: 'An impatient repeated submission during a delayed payment response produced more than one payment request and more than one order request.',
            causalConditions: json({
              fingerprint,
              causalStatus: 'UNCONFIRMED',
              businessImpact: 'A customer may be charged or create orders more than once for one intended checkout. This run used test payments only.',
              firstDivergence: result.firstDivergence ?? null,
              worldId: execution.worldId,
              experimentId: execution.experimentId,
              minimalConditions: { paymentDelayMs: execution.world.paymentDelayMs, doubleSubmit: execution.world.doubleSubmit, duplicateSubmissionBug: execution.world.duplicateSubmissionBug },
              invariantEvaluationIds: evaluationIds,
              failedInvariantIds: correlatedEvaluations
                .filter(({ evaluation }) => !evaluation.passed)
                .map(({ invariant }) => invariant.id),
              evidenceArtifactIds: artifactIds,
              numericConfidence: 0.75,
            }),
          } });
        if (finding.reproductionCount === 1) await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'finding_created', data: json({ message: title, worldId: execution.worldId, experimentId: execution.experimentId, findingId: finding.id }) } });
        if (artifactIds.length) await transaction.findingEvidence.createMany({ data: artifactIds.map((artifactId) => ({ findingId: finding.id, artifactId })), skipDuplicates: true });
      }
    });
  }

  async failExecution(execution: PersistedWorldExecution, error: unknown, metadata: Record<string, unknown> = {}): Promise<void> {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown local worker error';
    const code = typeof metadata.errorCode === 'string' ? metadata.errorCode : `${execution.provider}_WORKER_ERROR`;
    await this.database.$transaction(async (transaction) => {
      await transaction.executionAttempt.update({ where: { id: execution.attemptId }, data: { status: 'ERROR', completedAt: new Date(), error: json({ code, message, ...metadata }) } });
      await transaction.worker.update({ where: { id: execution.workerId }, data: { status: 'FAILED', lastHeartbeatAt: new Date() } });
      await transaction.experiment.update({ where: { id: execution.experimentId }, data: { status: 'ERROR' } });
      await transaction.world.update({ where: { id: execution.worldId }, data: { status: 'FAILED' } });
      await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'worker_failed', data: json({ message: `${execution.provider} worker execution failed.`, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, attemptId: execution.attemptId, attemptNumber: execution.attemptNumber, errorCode: code, errorMessage: message, ...metadata }) } });
    });
  }

  async adaptiveWorldResults(investigationId: string, reproductionRunId: string): Promise<AdaptiveWorldResultRecord[]> {
    const worlds = await this.database.world.findMany({
      where: { investigationId },
      orderBy: { createdAt: 'asc' },
      include: {
        experiments: {
          orderBy: { createdAt: 'asc' },
          include: {
            evaluations: { select: { id: true, passed: true, observed: true } },
            artifacts: { select: { id: true } },
          },
        },
      },
    });
    return worlds.flatMap((world) => {
      const definition = record(world.configuration) as unknown as DeterministicWorldDefinition;
      if (definition.adaptive?.reproductionRunId !== reproductionRunId) return [];
      const experiment = world.experiments[0];
      if (!experiment) return [];
      return [{
        worldId: world.id,
        experimentId: experiment.id,
        purpose: definition.adaptive.adaptivePurpose,
        world: definition,
        status: experiment.status,
        invariantEvaluationIds: experiment.evaluations.filter(({ passed }) => !passed).map(({ id }) => id),
        evidenceArtifactIds: experiment.artifacts.map(({ id }) => id),
      }];
    });
  }

  async updateFindingAfterAdaptive(input: AdaptiveFindingUpdateInput): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const finding = await transaction.finding.findUnique({ where: { id: input.findingId } });
      if (!finding) throw new Error('Finding disappeared before adaptive update');
      const existingConditions = record(finding.causalConditions);
      const previousReproductionCount = finding.reproductionCount;
      const existingRuns = await transaction.reproductionRun.findMany({ where: { findingId: input.findingId }, select: { experimentId: true } });
      const existingExperimentIds = new Set(existingRuns.map(({ experimentId }) => experimentId));
      let reproductionIncrement = 0;
      const adaptiveWorlds = await transaction.world.findMany({
        where: { investigationId: input.plan.investigationId },
        include: { experiments: { orderBy: { createdAt: 'asc' }, take: 1 } },
      });
      for (const world of adaptiveWorlds) {
        const configuration = record(world.configuration) as unknown as DeterministicWorldDefinition;
        if (configuration.adaptive?.reproductionRunId !== input.reproductionRunId) continue;
        const experimentId = world.experiments[0]?.id;
        if (!experimentId || existingExperimentIds.has(experimentId)) continue;
        const reproduced = input.comparison.supportingWorldIds.includes(world.id);
        await transaction.reproductionRun.create({ data: { findingId: input.findingId, experimentId, reproduced } });
        if (reproduced && configuration.adaptive.adaptivePurpose === 'EXACT_REPRODUCTION') reproductionIncrement++;
      }
      const nextConditions = {
        ...existingConditions,
        latestReproductionRunId: input.reproductionRunId,
        reproductionPlanId: input.plan.id,
        causalStatus: input.comparison.causalStatus,
        numericConfidence: input.updatedConfidence,
        confidenceExplanation: input.confidenceExplanation,
        failureRegion: input.comparison.failureRegion,
        variableComparisons: input.comparison.comparisons,
        supportingWorldIds: input.comparison.supportingWorldIds,
        supportingInvariantEvaluationIds: input.comparison.supportingInvariantEvaluationIds,
        evidenceArtifactIds: [...new Set([...stringArray(existingConditions.evidenceArtifactIds), ...input.comparison.evidenceArtifactIds])],
      };
      await transaction.finding.update({
        where: { id: input.findingId },
        data: {
          confidence: input.confidenceLabel,
          reproductionCount: previousReproductionCount + reproductionIncrement,
          causalConditions: json(nextConditions),
        },
      });
      if (input.comparison.evidenceArtifactIds.length) {
        await transaction.findingEvidence.createMany({
          data: input.comparison.evidenceArtifactIds.map((artifactId) => ({ findingId: input.findingId, artifactId })),
          skipDuplicates: true,
        });
      }
      const completed = await transaction.findingCondition.findFirst({ where: { findingId: input.findingId, kind: 'ADAPTIVE_REPRODUCTION_COMPLETED' } });
      if (!completed) {
        await transaction.findingCondition.create({ data: { findingId: input.findingId, kind: 'ADAPTIVE_REPRODUCTION_COMPLETED', condition: json({ reproductionRunId: input.reproductionRunId, completedAt: new Date().toISOString(), comparison: input.comparison }) } });
      }
      await transaction.investigationEvent.createMany({ data: [
        { investigationId: input.plan.investigationId, type: 'finding_confirmed', data: json({ message: 'Adaptive comparison analysis completed.', phase: 'comparison_analysis_completed', findingId: input.findingId, reproductionRunId: input.reproductionRunId, causalStatus: input.comparison.causalStatus }) },
        { investigationId: input.plan.investigationId, type: 'finding_confirmed', data: json({ message: 'Finding confidence updated from adaptive reproduction.', phase: 'confidence_updated', findingId: input.findingId, reproductionRunId: input.reproductionRunId, previousConfidence: input.previousConfidence, updatedConfidence: input.updatedConfidence, reproductionCount: previousReproductionCount + reproductionIncrement }) },
        { investigationId: input.plan.investigationId, type: 'finding_confirmed', data: json({ message: 'Failure-region estimate updated.', phase: 'failure_region_updated', findingId: input.findingId, reproductionRunId: input.reproductionRunId, failureRegion: input.comparison.failureRegion }) },
      ] });
    });
  }

  async completeMinimisation(input: CompleteMinimisationInput): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const finding = await transaction.finding.findUnique({ where: { id: input.findingId } });
      if (!finding) throw new Error('Finding disappeared before minimisation completion');
      const existingConditions = record(finding.causalConditions);
      const existingEvidence = stringArray(existingConditions.evidenceArtifactIds);
      const reportArtifactIds: string[] = [];
      let finalReportEvidenceId: string | undefined;
      if (input.report) {
        const jsonArtifact = await transaction.evidenceArtifact.create({ data: {
          experimentId: input.report.report.originalObservation.experimentId,
          type: input.report.jsonArtifact.type,
          storageProvider: 'LOCAL_REPORT',
          storageKey: input.report.jsonArtifact.storageKey,
          mimeType: input.report.jsonArtifact.mimeType,
          sizeBytes: input.report.jsonArtifact.sizeBytes,
          ...(input.report.jsonArtifact.checksum ? { checksum: input.report.jsonArtifact.checksum } : {}),
          redacted: true,
          metadata: json({ ...input.report.jsonArtifact.metadata, investigationId: input.investigationId, findingId: input.findingId, path: input.report.jsonPath, checksum: input.report.jsonChecksum }),
        } });
        const markdownArtifact = await transaction.evidenceArtifact.create({ data: {
          experimentId: input.report.report.originalObservation.experimentId,
          type: input.report.markdownArtifact.type,
          storageProvider: 'LOCAL_REPORT',
          storageKey: input.report.markdownArtifact.storageKey,
          mimeType: input.report.markdownArtifact.mimeType,
          sizeBytes: input.report.markdownArtifact.sizeBytes,
          ...(input.report.markdownArtifact.checksum ? { checksum: input.report.markdownArtifact.checksum } : {}),
          redacted: true,
          metadata: json({ ...input.report.markdownArtifact.metadata, investigationId: input.investigationId, findingId: input.findingId, path: input.report.markdownPath, checksum: input.report.markdownChecksum }),
        } });
        reportArtifactIds.push(jsonArtifact.id, markdownArtifact.id);
        finalReportEvidenceId = jsonArtifact.id;
        await transaction.investigationEvent.create({ data: { investigationId: input.investigationId, type: 'final_report_artifact_created', data: messageData('Final evidence report artifacts were created.', { phase: 'final_report_artifact_created', findingId: input.findingId, minimisationRunId: input.runId, finalReportEvidenceId, artifactIds: reportArtifactIds }) } });
      }

      const finalConditions = {
        retainedConditions: input.retainedConditions,
        removedConditions: input.removedConditions,
        inconclusiveConditions: input.inconclusiveConditions,
        timingRange: {
          lowerPassingBoundMs: input.boundedRange.lowerPassingBoundMs,
          upperFailingBoundMs: input.boundedRange.upperFailingBoundMs,
          targetPrecisionMs: input.boundedRange.targetPrecisionMs,
        },
        confirmation: {
          ...(input.confirmationWorldId ? { worldId: input.confirmationWorldId } : {}),
          reproduced: input.confirmationReproduced,
        },
        claimLevel: 'MINIMAL_TESTED_SET',
        limitations: [
          'Greedy single-variable removal',
          'No exhaustive interaction search',
          'Results apply to the tested fixture and journey',
        ],
      };
      const nextConditions = {
        ...existingConditions,
        minimisationStatus: input.confirmationReproduced ? 'COMPLETED' : 'INCONCLUSIVE',
        minimisationRunId: input.runId,
        minimalTestedConditions: finalConditions,
        retainedConditions: input.retainedConditions,
        removedConditions: input.removedConditions,
        inconclusiveConditions: input.inconclusiveConditions,
        finalReproductionSteps: input.report?.report.reproductionSteps ?? [],
        finalEvidenceSummary: input.report?.report.summary,
        finalReportEvidenceId,
        finalReportEvidenceIds: reportArtifactIds,
        causalStatus: input.confirmationReproduced ? 'SUPPORTED' : 'INCONCLUSIVE',
        numericConfidence: input.finalConfidence,
        confidenceExplanation: input.confidenceExplanation,
        evidenceArtifactIds: [...new Set([...existingEvidence, ...reportArtifactIds])],
      };
      await transaction.finding.update({ where: { id: input.findingId }, data: {
        confidence: input.confidenceLabel,
        causalConditions: json(nextConditions),
      } });
      if (reportArtifactIds.length) {
        await transaction.findingEvidence.createMany({
          data: reportArtifactIds.map((artifactId) => ({ findingId: input.findingId, artifactId })),
          skipDuplicates: true,
        });
      }
      await transaction.findingCondition.upsert({
        where: { id: `${input.runId}:completed` },
        update: { condition: json({ completedAt: new Date().toISOString(), finalConditions }) },
        create: { id: `${input.runId}:completed`, findingId: input.findingId, kind: 'MINIMISATION_COMPLETED', condition: json({ completedAt: new Date().toISOString(), finalConditions }) },
      });
      await transaction.minimisationRun.update({ where: { id: input.runId }, data: {
        status: input.confirmationReproduced ? 'COMPLETED' : 'INCONCLUSIVE',
        completedAt: new Date(),
        finalMinimalTestedConditions: json(finalConditions),
        finalBoundedRange: json(finalConditions.timingRange),
        finalConfidence: input.finalConfidence,
        ...(finalReportEvidenceId ? { finalReportEvidenceId } : {}),
      } });
      await transaction.investigationEvent.createMany({ data: [
        { investigationId: input.investigationId, type: input.confirmationReproduced ? 'minimal_reproduction_found' : 'minimal_reproduction_inconclusive', data: messageData(input.confirmationReproduced ? 'Minimal tested condition set confirmed.' : 'Minimal tested condition set was inconclusive.', { phase: input.confirmationReproduced ? 'minimal_reproduction_found' : 'minimal_reproduction_inconclusive', findingId: input.findingId, minimisationRunId: input.runId, confirmationWorldId: input.confirmationWorldId, retainedConditions: input.retainedConditions, removedConditions: input.removedConditions, inconclusiveConditions: input.inconclusiveConditions }) },
        { investigationId: input.investigationId, type: 'final_report_completed', data: messageData('Final evidence report completed.', { phase: 'final_report_completed', findingId: input.findingId, minimisationRunId: input.runId, finalReportEvidenceId, finalConfidence: input.finalConfidence }) },
      ] });
    });
  }

  async finishInvestigation(id: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const moved = await transaction.investigation.updateMany({ where: { id, status: { in: ['RUNNING', 'OBSERVING'] } }, data: { status: 'OBSERVING' } });
      if (moved.count !== 1) return;
      await transaction.investigation.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await transaction.investigationEvent.create({ data: { investigationId: id, type: 'investigation_completed', data: messageData('All worlds reached a terminal state and their evidence was processed.', { status: 'COMPLETED' }) } });
    });
  }

  async failInvestigation(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown orchestration error';
    await this.database.$transaction(async (transaction) => {
      await transaction.investigation.updateMany({ where: { id, status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] } }, data: { status: 'FAILED', completedAt: new Date() } });
      await transaction.investigationEvent.create({ data: { investigationId: id, type: 'investigation_failed', data: messageData('Investigation orchestration failed.', { status: 'FAILED', errorCode: 'ORCHESTRATION_FAILED', errorMessage: message }) } });
    });
  }

  async isCancelled(id: string): Promise<boolean> {
    return (await this.database.investigation.findUnique({ where: { id }, select: { status: true } }))?.status === 'CANCELLED';
  }

  async cancel(organisationId: string, id: string): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const changed = await transaction.investigation.updateMany({ where: { id, organisationId, status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] } }, data: { status: 'CANCELLED', completedAt: new Date() } });
      if (changed.count !== 1) return false;
      await transaction.world.updateMany({ where: { investigationId: id, status: { in: ['GENERATED', 'QUEUED'] } }, data: { status: 'CANCELLED' } });
      await transaction.experiment.updateMany({ where: { investigationId: id, status: 'QUEUED' }, data: { status: 'CANCELLED' } });
      await transaction.investigationEvent.create({ data: { investigationId: id, type: 'investigation_cancelled', data: messageData('Cancellation requested; queued local workers will not start.', { status: 'CANCELLED' }) } });
      return true;
    });
  }

  async markStaleLocalExecutions(staleBefore: Date): Promise<number> {
    const attempts = await this.database.executionAttempt.findMany({ where: { provider: 'LOCAL', status: 'RUNNING', startedAt: { lt: staleBefore } }, select: { id: true, workerId: true, experimentId: true, experiment: { select: { worldId: true, investigationId: true } } } });
    if (!attempts.length) return 0;
    await this.database.$transaction(async (transaction) => {
      for (const attempt of attempts) {
        await transaction.executionAttempt.update({ where: { id: attempt.id }, data: { status: 'ERROR', completedAt: new Date(), error: json({ code: 'API_PROCESS_RESTARTED', message: 'The in-process local worker was abandoned by an API process restart.' }) } });
        if (attempt.workerId) await transaction.worker.update({ where: { id: attempt.workerId }, data: { status: 'FAILED', lastHeartbeatAt: new Date() } });
        await transaction.experiment.update({ where: { id: attempt.experimentId }, data: { status: 'ERROR' } });
        await transaction.world.update({ where: { id: attempt.experiment.worldId }, data: { status: 'FAILED' } });
        await transaction.investigationEvent.create({ data: { investigationId: attempt.experiment.investigationId, type: 'worker_failed', data: messageData('A stale local worker was marked failed during startup cleanup.', { worldId: attempt.experiment.worldId, experimentId: attempt.experimentId, workerId: attempt.workerId, errorCode: 'API_PROCESS_RESTARTED' }) } });
      }
      for (const investigationId of new Set(attempts.map((attempt) => attempt.experiment.investigationId))) {
        await transaction.investigation.updateMany({ where: { id: investigationId, status: { in: ['QUEUED', 'RUNNING', 'OBSERVING'] } }, data: { status: 'FAILED', completedAt: new Date() } });
        await transaction.investigationEvent.create({ data: { investigationId, type: 'investigation_failed', data: messageData('Investigation could not resume after the API process stopped.', { errorCode: 'API_PROCESS_RESTARTED' }) } });
      }
    });
    return attempts.length;
  }

  async progress(organisationId: string, id: string): Promise<InvestigationProgressRecord | null> {
    const record = await this.database.investigation.findFirst({ where: { id, organisationId }, select: {
      id: true, status: true,
      worlds: { select: {
        id: true,
        status: true,
        experiments: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            status: true,
            evaluations: { select: { passed: true, executionAttemptId: true } },
            attempts: { orderBy: { attempt: 'desc' }, take: 1, select: { id: true, status: true, result: true, completedAt: true } },
          },
        },
      } },
      experiments: { select: { status: true } },
      events: { orderBy: { occurredAt: 'desc' }, take: 20, select: { id: true, type: true, occurredAt: true, data: true } },
      _count: { select: { findings: true } },
    } });
    return record ? { id: record.id, status: record.status, worlds: record.worlds, experiments: record.experiments, events: record.events, findingsCount: record._count.findings } : null;
  }

  async listWorlds(organisationId: string, id: string) {
    return this.database.world.findMany({ where: { investigationId: id, investigation: { organisationId } }, orderBy: { createdAt: 'asc' }, include: { experiments: { orderBy: { createdAt: 'asc' }, take: 1, include: { evaluations: { select: { passed: true, executionAttemptId: true } }, attempts: { orderBy: { attempt: 'desc' }, take: 1, select: { id: true, status: true, result: true, workerId: true, startedAt: true, completedAt: true } } } } } });
  }
  async listExperiments(organisationId: string, id: string) {
    return this.database.experiment.findMany({
      where: { investigationId: id, investigation: { organisationId } },
      orderBy: { createdAt: 'asc' },
      include: {
        world: { select: { status: true } },
        evaluations: { select: { passed: true, executionAttemptId: true } },
        _count: { select: { attempts: true } },
        attempts: {
          orderBy: { attempt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            result: true,
            startedAt: true,
            completedAt: true,
            exitCode: true,
            durationMs: true,
          },
        },
      },
    });
  }
  async listWorkers(organisationId: string, id: string) {
    return this.database.worker.findMany({
      where: { organisationId, attempts: { some: { experiment: { investigationId: id } } } },
      orderBy: { createdAt: 'asc' },
      include: {
        attempts: {
          where: { experiment: { investigationId: id } },
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            exitCode: true,
            durationMs: true,
            experiment: { select: { worldId: true, investigationId: true } },
          },
        },
      },
    });
  }
  async listEvidence(organisationId: string, id: string) {
    return this.database.evidenceArtifact.findMany({ where: { experiment: { investigationId: id, investigation: { organisationId } } }, orderBy: { createdAt: 'asc' } });
  }
  async listFindings(organisationId: string, id: string) {
    return this.database.finding.findMany({ where: { investigationId: id, organisationId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }
  async getFinding(organisationId: string, id: string, findingId: string) {
    return this.database.finding.findFirst({
      where: { id: findingId, investigationId: id, organisationId, deletedAt: null },
      include: {
        evidence: { include: { artifact: true } },
        reproductions: { orderBy: { createdAt: 'asc' } },
        minimisationRuns: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            completedTrials: true,
            currentRetainedConditions: true,
            removedConditions: true,
            inconclusiveConditions: true,
            knownPassingDelayMs: true,
            knownFailingDelayMs: true,
            finalReportEvidenceId: true,
          },
        },
        minimalReproduction: true,
      },
    });
  }
  async getEvidenceArtifact(organisationId: string, investigationId: string, evidenceId: string) {
    return this.database.evidenceArtifact.findFirst({
      where: {
        id: evidenceId,
        experiment: { investigationId, investigation: { organisationId } },
      },
    });
  }
}
