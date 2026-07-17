import {
  type ExperimentPlanner,
  type GeneratedExperimentPlan,
  type PlannerGenerationResult,
  type PlannerProvider,
  type PlannerRequest,
  type PlannerStatus,
  experimentPlannerPromptVersion,
} from '@taskos/ai-providers';
import type { CreateInvestigationInput } from '@taskos/shared-types';
import type {
  DeterministicExperimentPlan,
  DeterministicWorldDefinition,
} from './deterministic-experiment-plan.service.js';
import { DeterministicExperimentPlanService } from './deterministic-experiment-plan.service.js';
import type { PersistedLaunchSnapshot } from '../../investigations/investigations.types.js';

export interface PlanningScope {
  projectId: string;
  projectName: string;
  environmentId: string;
  environmentName: string;
  journeyId: string;
  journeyName: string;
  scenarioId: string;
  invariantIds: string[];
  invariants: Array<{ id: string; name: string; description?: string }>;
  launch?: PersistedLaunchSnapshot;
}

export interface PlannerValidationResult {
  accepted: boolean;
  partiallyAccepted: boolean;
  acceptedWorlds: DeterministicWorldDefinition[];
  rejectedWorlds: Array<{ index: number; name?: string; reasons: string[] }>;
  warnings: string[];
  normalizedFields: Array<{ path: string; previousValue: unknown; normalizedValue: unknown }>;
}

export interface InvestigationPlanningOptions {
  requestedProvider: 'deterministic' | 'openai';
  fallbackEnabled: boolean;
  maximumWorlds: number;
  maximumVariables: number;
  maximumAssumptions: number;
  maximumWarnings: number;
  timeoutMs: number;
  maxProviderAttempts: number;
  maxOutputTokens: number;
  model?: string;
}

export interface InvestigationPlanningResult {
  plan: DeterministicExperimentPlan;
  requestedProvider: Exclude<PlannerProvider, 'FALLBACK'>;
  effectiveProvider: PlannerProvider;
  plannerStatus: PlannerStatus;
  validation: PlannerValidationResult;
  assumptions: string[];
  warnings: string[];
  rejectedPlanItems: PlannerValidationResult['rejectedWorlds'];
  normalizedFields: PlannerValidationResult['normalizedFields'];
  fallbackReason?: string;
  generation?: PlannerGenerationResult;
  generationDurationMs: number;
  validationDurationMs: number;
  completedAt: string;
}

const supportedFaults = [
  { id: 'payment-delay', type: 'PAYMENT_DELAY', allowedValues: { paymentDelayMs: { min: 0, max: 10_000 } } },
  { id: 'double-submit', type: 'DOUBLE_SUBMIT', allowedValues: { doubleSubmit: true, doubleSubmitIntervalMs: { min: 0, max: 5_000 } } },
];

const unsafePattern = /(https?:\/\/|file:\/\/|\.\.\/|\/etc\/|\brm\s+-|\bcurl\b|\bwget\b|\bnpm\s+install\b|\bpnpm\s+install\b|\bbash\b|\bsh\s+-c\b|api[\s_-]?key|secret|token|password)/i;

export class PlannerConfigurationError extends Error {}
export class PlannerPolicyValidationError extends Error {}

export class DeterministicExperimentPlanner {
  readonly provider = 'DETERMINISTIC' as const;
  constructor(private readonly deterministic = new DeterministicExperimentPlanService()) {}

  generate(input: CreateInvestigationInput, scope: PlanningScope): DeterministicExperimentPlan {
    return {
      ...this.deterministic.create(input, scope.scenarioId),
      planner: {
        version: experimentPlannerPromptVersion,
        requestedProvider: 'DETERMINISTIC',
        effectiveProvider: 'DETERMINISTIC',
        plannerStatus: 'ACCEPTED',
        assumptions: ['Deterministic fallback planner uses the known checkout reliability fixture.'],
        warnings: [],
        rejectedPlanItems: [],
        normalizedFields: [],
        acceptedWorldCount: Math.min(4, input.scenario.controls.maximumWorlds),
        rejectedWorldCount: 0,
      },
    };
  }
}

export class InvestigationPlanningService {
  constructor(
    private readonly options: InvestigationPlanningOptions,
    private readonly deterministicPlanner = new DeterministicExperimentPlanner(),
    private readonly openAIPlanner?: ExperimentPlanner,
  ) {}

  async plan(input: CreateInvestigationInput, scope: PlanningScope, signal?: AbortSignal): Promise<InvestigationPlanningResult> {
    const requestedProvider = this.options.requestedProvider === 'openai' ? 'OPENAI' : 'DETERMINISTIC';
    if (requestedProvider === 'DETERMINISTIC') return this.deterministic(input, scope, 'DETERMINISTIC');
    if (!this.openAIPlanner) {
      if (!this.options.fallbackEnabled) throw new PlannerConfigurationError('OPENAI_API_KEY is required when PLANNER_PROVIDER=openai and fallback is disabled');
      return this.deterministic(input, scope, 'FALLBACK', 'OpenAI planner is not configured.');
    }

    const request = this.request(input, scope);
    const generation = await this.generateWithProvider(request, signal);
    if (!generation.output) {
      if (!this.options.fallbackEnabled) throw new PlannerPolicyValidationError(generation.error?.message ?? 'OpenAI planner failed');
      return this.deterministic(input, scope, 'FALLBACK', generation.error?.message ?? 'OpenAI planner failed.', generation);
    }

    const validationStarted = Date.now();
    const validation = this.validateGeneratedPlan(generation.output, input, scope);
    const validationDurationMs = Date.now() - validationStarted;
    const enoughWorlds = validation.acceptedWorlds.length >= 1 && validation.acceptedWorlds.some(isBaseline);
    if (!validation.accepted || !enoughWorlds) {
      const reason = validation.rejectedWorlds.length
        ? validation.rejectedWorlds.flatMap((world) => world.reasons).join('; ').slice(0, 500)
        : 'OpenAI plan did not leave a meaningful accepted baseline/control world.';
      if (!this.options.fallbackEnabled) throw new PlannerPolicyValidationError(reason);
      return this.deterministic(input, scope, 'FALLBACK', reason, generation, validationDurationMs);
    }

    const plannerStatus: PlannerStatus = validation.partiallyAccepted ? 'PARTIALLY_ACCEPTED' : 'ACCEPTED';
    const plan = this.buildPlanFromGenerated(input, scope, generation.output, validation, 'OPENAI', plannerStatus, generation);
    return {
      plan,
      requestedProvider,
      effectiveProvider: 'OPENAI',
      plannerStatus,
      validation,
      assumptions: generation.output.assumptions,
      warnings: validation.warnings,
      rejectedPlanItems: validation.rejectedWorlds,
      normalizedFields: validation.normalizedFields,
      generation,
      generationDurationMs: generation.durationMs,
      validationDurationMs,
      completedAt: new Date().toISOString(),
    };
  }

  private async generateWithProvider(request: PlannerRequest, signal?: AbortSignal): Promise<PlannerGenerationResult> {
    if (!this.openAIPlanner) throw new PlannerConfigurationError('OpenAI planner is not configured.');
    try {
      return await this.openAIPlanner.generatePlan(request, {
        plannerVersion: experimentPlannerPromptVersion,
        ...(this.options.model ? { model: this.options.model } : {}),
        timeoutMs: this.options.timeoutMs,
        maxAttempts: this.options.maxProviderAttempts,
        maxOutputTokens: this.options.maxOutputTokens,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      return {
        provider: 'OPENAI',
        status: 'FAILED',
        ...(this.options.model ? { model: this.options.model } : {}),
        durationMs: 0,
        usage: { providerRequestCount: 1 },
        error: {
          code: error instanceof Error && error.name === 'ZodError' ? 'PlannerSchemaValidationError' : 'PlannerProviderError',
          message: error instanceof Error ? error.message.slice(0, 500) : 'Planner provider failed',
        },
      };
    }
  }

  private deterministic(
    input: CreateInvestigationInput,
    scope: PlanningScope,
    effectiveProvider: 'DETERMINISTIC' | 'FALLBACK',
    fallbackReason?: string,
    generation?: PlannerGenerationResult,
    priorValidationDurationMs = 0,
  ): InvestigationPlanningResult {
    const validationStarted = Date.now();
    const plan = this.deterministicPlanner.generate(input, scope);
    if (scope.launch) plan.launch = scope.launch;
    const validation = this.validateDeterministicPlan(plan, input);
    const validationDurationMs = Date.now() - validationStarted + priorValidationDurationMs;
    const plannerStatus: PlannerStatus = effectiveProvider === 'FALLBACK' ? 'FALLBACK_USED' : 'ACCEPTED';
    const existingPlanner = plan.planner;
    if (!existingPlanner) throw new PlannerPolicyValidationError('Deterministic planner did not return planner metadata');
    plan.planner = {
      ...existingPlanner,
      requestedProvider: generation ? 'OPENAI' : 'DETERMINISTIC',
      effectiveProvider,
      plannerStatus,
      ...(fallbackReason ? { fallbackReason } : {}),
      warnings: validation.warnings,
      acceptedWorldCount: validation.acceptedWorlds.length,
      rejectedWorldCount: validation.rejectedWorlds.length,
    };
    const requestedProvider: 'DETERMINISTIC' | 'OPENAI' = generation ? 'OPENAI' : 'DETERMINISTIC';
    const result: InvestigationPlanningResult = {
      plan,
      requestedProvider,
      effectiveProvider,
      plannerStatus,
      validation,
      assumptions: plan.planner.assumptions,
      warnings: validation.warnings,
      rejectedPlanItems: validation.rejectedWorlds,
      normalizedFields: validation.normalizedFields,
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(generation ? { generation } : {}),
      generationDurationMs: generation?.durationMs ?? 0,
      validationDurationMs,
      completedAt: new Date().toISOString(),
    };
    return result;
  }

  private request(input: CreateInvestigationInput, scope: PlanningScope): PlannerRequest {
    return {
      scenarioPrompt: input.scenario.prompt,
      project: { id: input.projectId, name: scope.projectName },
      environment: { id: input.environmentId, name: scope.environmentName },
      journey: {
        id: input.journeyId,
        name: scope.journeyName,
        supportedVariables: ['browser', 'viewport', 'networkProfile', 'userProfile', 'paymentDelayMs', 'duplicateSubmissionBug', 'doubleSubmit', 'doubleSubmitIntervalMs'],
      },
      controls: {
        allowedBrowsers: input.scenario.controls.browsers,
        allowedViewports: input.scenario.controls.viewports,
        allowedNetworkProfiles: input.scenario.controls.networkProfiles,
        maximumWorlds: Math.min(input.scenario.controls.maximumWorlds, this.options.maximumWorlds),
        maximumConcurrentWorkers: input.scenario.controls.maximumConcurrentWorkers,
      },
      invariants: scope.invariants,
      supportedFaults,
    };
  }

  validateGeneratedPlan(output: GeneratedExperimentPlan, input: CreateInvestigationInput, _scope: PlanningScope): PlannerValidationResult {
    const warnings = [...output.warnings.slice(0, this.options.maximumWarnings)];
    const normalizedFields: PlannerValidationResult['normalizedFields'] = [];
    const rejectedWorlds: PlannerValidationResult['rejectedWorlds'] = [];
    const acceptedWorlds: DeterministicWorldDefinition[] = [];
    const seen = new Set<string>();
    const worldLimit = Math.min(input.scenario.controls.maximumWorlds, this.options.maximumWorlds, output.worlds.length);

    const globalUnsafe = [output.objective, output.explanation, ...output.assumptions, ...output.warnings].some((value) => unsafePattern.test(value));
    if (globalUnsafe) {
      return { accepted: false, partiallyAccepted: false, acceptedWorlds: [], rejectedWorlds: [{ index: -1, reasons: ['Plan text contains unsafe URL, command, credential, or filesystem-like content.'] }], warnings, normalizedFields };
    }

    for (const [index, world] of output.worlds.entries()) {
      if (index >= worldLimit) {
        rejectedWorlds.push({ index, name: world.name, reasons: ['World exceeds configured world limit.'] });
        continue;
      }
      const reasons: string[] = [];
      const browser = normalizeToken(world.browser);
      const viewport = normalizeToken(world.viewport);
      const networkProfile = normalizeToken(world.networkProfile);
      const userProfile = normalizeToken(world.userProfile);
      if (!containsNormalized(input.scenario.controls.browsers, browser)) reasons.push(`Unsupported browser: ${world.browser}`);
      if (!containsNormalized(input.scenario.controls.viewports, viewport)) reasons.push(`Unsupported viewport: ${world.viewport}`);
      if (!containsNormalized(input.scenario.controls.networkProfiles, networkProfile)) reasons.push(`Unsupported network profile: ${world.networkProfile}`);
      if (!['normal', 'impatient'].includes(userProfile)) reasons.push(`Unsupported user profile: ${world.userProfile}`);
      if ([world.name, world.purpose, world.reason].some((value) => unsafePattern.test(value))) reasons.push('World text contains unsafe URL, command, credential, or filesystem-like content.');
      const normalized = generatedWorldToRuntime(world, index, browser, viewport, networkProfile, userProfile);
      const fingerprint = worldFingerprint(normalized, input);
      if (seen.has(fingerprint)) {
        warnings.push(`Duplicate world removed: ${world.name}`);
        normalizedFields.push({ path: `worlds.${index}`, previousValue: world.name, normalizedValue: 'deduplicated' });
        continue;
      }
      if (reasons.length) {
        rejectedWorlds.push({ index, name: world.name, reasons });
        continue;
      }
      seen.add(fingerprint);
      acceptedWorlds.push(normalized);
    }

    if (!acceptedWorlds.some(isBaseline)) {
      if (acceptedWorlds.length < Math.min(input.scenario.controls.maximumWorlds, this.options.maximumWorlds)) {
        acceptedWorlds.unshift(deterministicBaseline(acceptedWorlds.length));
        normalizedFields.push({ path: 'worlds', previousValue: 'missing baseline', normalizedValue: 'deterministic baseline inserted' });
        warnings.push('Deterministic baseline inserted because the generated plan omitted one.');
      } else {
        rejectedWorlds.push({ index: -1, reasons: ['Plan omitted a healthy baseline and no world budget remained to insert one.'] });
      }
    }

    const accepted = acceptedWorlds.length > 0 && acceptedWorlds.some(isBaseline);
    return {
      accepted,
      partiallyAccepted: accepted && rejectedWorlds.length > 0,
      acceptedWorlds: acceptedWorlds.map((world, creationOrder) => ({ ...world, creationOrder, randomSeed: 41_000 + creationOrder })),
      rejectedWorlds,
      warnings,
      normalizedFields,
    };
  }

  private validateDeterministicPlan(plan: DeterministicExperimentPlan, input: CreateInvestigationInput): PlannerValidationResult {
    const acceptedWorlds = plan.worlds.slice(0, Math.min(input.scenario.controls.maximumWorlds, this.options.maximumWorlds));
    return {
      accepted: acceptedWorlds.length > 0,
      partiallyAccepted: acceptedWorlds.length < plan.worlds.length,
      acceptedWorlds,
      rejectedWorlds: plan.worlds.length > acceptedWorlds.length ? plan.worlds.slice(acceptedWorlds.length).map((world, index) => ({ index: acceptedWorlds.length + index, name: world.name, reasons: ['World exceeds configured world limit.'] })) : [],
      warnings: [],
      normalizedFields: [],
    };
  }

  private buildPlanFromGenerated(
    input: CreateInvestigationInput,
    scope: PlanningScope,
    output: GeneratedExperimentPlan,
    validation: PlannerValidationResult,
    effectiveProvider: PlannerProvider,
    plannerStatus: PlannerStatus,
    generation: PlannerGenerationResult,
  ): DeterministicExperimentPlan {
    return {
      objective: output.objective,
      journeyId: input.journeyId,
      scenarioId: scope.scenarioId,
      selectedVariables: output.variables.slice(0, this.options.maximumVariables).map((variable: GeneratedExperimentPlan['variables'][number]) => variable.name),
      selectedControls: input.scenario.controls,
      invariantIds: input.invariantIds,
      executionProvider: 'LOCAL_PLAYWRIGHT',
      maximumConcurrentWorkers: Math.min(2, input.scenario.controls.maximumConcurrentWorkers),
      worlds: validation.acceptedWorlds,
      planningExplanation: output.explanation,
      ...(scope.launch ? { launch: scope.launch } : {}),
      planner: {
        version: experimentPlannerPromptVersion,
        requestedProvider: 'OPENAI',
        effectiveProvider,
        plannerStatus,
        ...(generation.model ? { model: generation.model } : {}),
        assumptions: output.assumptions.slice(0, this.options.maximumAssumptions),
        warnings: validation.warnings,
        rejectedPlanItems: validation.rejectedWorlds,
        normalizedFields: validation.normalizedFields,
        acceptedWorldCount: validation.acceptedWorlds.length,
        rejectedWorldCount: validation.rejectedWorlds.length,
        generationDurationMs: generation.durationMs,
        ...(generation.usage ? { usage: generation.usage } : {}),
      },
    };
  }
}

const normalizeToken = (value: string): string => value.trim().toLowerCase();
const containsNormalized = (values: string[], candidate: string): boolean => values.map(normalizeToken).includes(candidate);

function generatedWorldToRuntime(
  world: GeneratedExperimentPlan['worlds'][number],
  creationOrder: number,
  browser: string,
  viewport: string,
  networkProfile: string,
  userProfile: string,
): DeterministicWorldDefinition {
  return {
    key: `ai-${creationOrder}-${slug(world.name)}`,
    name: world.name.trim(),
    browser: browser === 'webkit' || browser === 'firefox' ? browser : 'chromium',
    viewport: viewport.includes('mobile') ? 'mobile-390x844' : 'desktop-1440x900',
    networkProfile: networkProfile.includes('delay') || networkProfile.includes('slow') ? 'delayed-payment' : 'normal',
    userProfile: userProfile === 'impatient' ? 'impatient' : 'normal',
    paymentDelayMs: world.paymentDelayMs,
    duplicateSubmissionBug: world.duplicateSubmissionBug,
    doubleSubmit: world.doubleSubmit,
    doubleSubmitIntervalMs: world.doubleSubmitIntervalMs,
    expectedOutcome: world.expectedOutcome,
    reason: `${world.purpose.trim()} ${world.reason.trim()}`.slice(0, 1_000),
    randomSeed: 41_000 + creationOrder,
    creationOrder,
    origin: 'INITIAL',
  };
}

function deterministicBaseline(creationOrder: number): DeterministicWorldDefinition {
  return {
    key: 'baseline',
    name: 'Baseline checkout',
    browser: 'chromium',
    viewport: 'desktop-1440x900',
    networkProfile: 'normal',
    userProfile: 'normal',
    paymentDelayMs: 0,
    duplicateSubmissionBug: false,
    doubleSubmit: false,
    doubleSubmitIntervalMs: 100,
    expectedOutcome: 'PASS',
    reason: 'Deterministic healthy baseline inserted by planner validation.',
    randomSeed: 41_000 + creationOrder,
    creationOrder,
    origin: 'INITIAL',
  };
}

function isBaseline(world: DeterministicWorldDefinition): boolean {
  return !world.duplicateSubmissionBug && world.paymentDelayMs === 0 && !world.doubleSubmit;
}

function worldFingerprint(world: DeterministicWorldDefinition, input: CreateInvestigationInput): string {
  return JSON.stringify({
    browser: world.browser,
    viewport: world.viewport,
    networkProfile: world.networkProfile,
    userProfile: world.userProfile,
    paymentDelayMs: world.paymentDelayMs,
    duplicateSubmissionBug: world.duplicateSubmissionBug,
    doubleSubmit: world.doubleSubmit,
    doubleSubmitIntervalMs: world.doubleSubmitIntervalMs,
    journeyId: input.journeyId,
    invariantIds: input.invariantIds.slice().sort(),
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'world';
}
