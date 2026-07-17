import type { CreateInvestigationInput } from '@taskos/shared-types';
import type { PersistedLaunchSnapshot } from '../../investigations/investigations.types.js';

export interface DeterministicWorldDefinition {
  key: string;
  name: string;
  browser: 'chromium' | 'webkit' | 'firefox';
  viewport: 'desktop-1440x900' | 'mobile-390x844';
  networkProfile: 'normal' | 'delayed-payment';
  userProfile: 'normal' | 'impatient';
  paymentDelayMs: number;
  duplicateSubmissionBug: boolean;
  doubleSubmit: boolean;
  doubleSubmitIntervalMs: number;
  expectedOutcome: 'PASS' | 'INVARIANT_VIOLATION' | 'OBSERVE';
  reason: string;
  randomSeed: number;
  creationOrder: number;
  origin?: 'INITIAL' | 'ADAPTIVE_REPRODUCTION' | 'MINIMISATION';
  adaptive?: {
    reproductionRunId: string;
    findingId: string;
    sourceWorldId: string;
    sourceExperimentId: string;
    adaptivePurpose:
      | 'EXACT_REPRODUCTION'
      | 'BUG_FLAG_CONTROL'
      | 'INTERACTION_CONTROL'
      | 'DELAY_COMPARISON'
      | 'LOW_DELAY_COMPARISON';
    changedVariables: Record<string, unknown>;
    fixedVariables: Record<string, unknown>;
    hypothesisContribution: string;
  };
  minimisation?: {
    minimisationRunId: string;
    findingId: string;
    sourceWorldId: string;
    reproductionRunId: string;
    candidateId: string;
    candidateVariable: string;
    candidatePurpose: string;
    sourceValue: unknown;
    candidateValue: unknown;
    retainedConditions: Record<string, unknown>;
    candidateSequence: number;
    expectedInterpretation: string;
  };
}

export interface DeterministicExperimentPlan {
  objective: string;
  journeyId: string;
  scenarioId: string;
  selectedVariables: string[];
  selectedControls: CreateInvestigationInput['scenario']['controls'];
  invariantIds: string[];
  executionProvider: 'LOCAL_PLAYWRIGHT';
  maximumConcurrentWorkers: number;
  worlds: DeterministicWorldDefinition[];
  planningExplanation: string;
  launch?: PersistedLaunchSnapshot;
  planner?: {
    version: string;
    requestedProvider: 'DETERMINISTIC' | 'OPENAI' | 'KIMI';
    effectiveProvider: 'DETERMINISTIC' | 'OPENAI' | 'KIMI' | 'FALLBACK';
    plannerStatus: string;
    model?: string;
    assumptions: string[];
    warnings: string[];
    rejectedPlanItems: unknown[];
    normalizedFields: unknown[];
    acceptedWorldCount: number;
    rejectedWorldCount: number;
    fallbackReason?: string;
    generationDurationMs?: number;
    validationDurationMs?: number;
    generatedAt?: string;
    usage?: unknown;
  };
}

const initialWorlds: Omit<DeterministicWorldDefinition, 'creationOrder' | 'randomSeed'>[] = [
  {
    key: 'baseline', name: 'Baseline checkout', browser: 'chromium', viewport: 'desktop-1440x900',
    networkProfile: 'normal', userProfile: 'normal', paymentDelayMs: 0,
    duplicateSubmissionBug: false, doubleSubmit: false, doubleSubmitIntervalMs: 100,
    expectedOutcome: 'PASS', reason: 'Establishes the healthy checkout baseline.',
  },
  {
    key: 'protected-repeat', name: 'Healthy repeated submission protection', browser: 'chromium', viewport: 'desktop-1440x900',
    networkProfile: 'delayed-payment', userProfile: 'impatient', paymentDelayMs: 1200,
    duplicateSubmissionBug: false, doubleSubmit: true, doubleSubmitIntervalMs: 100,
    expectedOutcome: 'PASS', reason: 'Verifies that healthy checkout logic prevents duplicate activity.',
  },
  {
    key: 'defective-repeat', name: 'Duplicate submission under delayed payment', browser: 'chromium', viewport: 'mobile-390x844',
    networkProfile: 'delayed-payment', userProfile: 'impatient', paymentDelayMs: 1200,
    duplicateSubmissionBug: true, doubleSubmit: true, doubleSubmitIntervalMs: 100,
    expectedOutcome: 'INVARIANT_VIOLATION', reason: 'Tests the known duplicate-submission failure condition.',
  },
  {
    key: 'reduced-latency', name: 'Duplicate mode with reduced latency', browser: 'chromium', viewport: 'mobile-390x844',
    networkProfile: 'delayed-payment', userProfile: 'impatient', paymentDelayMs: 600,
    duplicateSubmissionBug: true, doubleSubmit: true, doubleSubmitIntervalMs: 100,
    expectedOutcome: 'OBSERVE', reason: 'Provides an initial comparison below the known failing delay.',
  },
];

export class DeterministicExperimentPlanService {
  constructor(private readonly hardConcurrencyMaximum = 2) {}

  create(input: CreateInvestigationInput, scenarioId: string): DeterministicExperimentPlan {
    const worldCount = Math.min(4, input.scenario.controls.maximumWorlds);
    const worlds = initialWorlds.slice(0, worldCount).map((world, creationOrder) => ({
      ...world,
      creationOrder,
      randomSeed: 41_000 + creationOrder,
    }));
    return {
      objective: input.scenario.prompt,
      journeyId: input.journeyId,
      scenarioId,
      selectedVariables: ['browser', 'viewport', 'payment delay', 'user profile', 'duplicate-submission mode'],
      selectedControls: input.scenario.controls,
      invariantIds: input.invariantIds,
      executionProvider: 'LOCAL_PLAYWRIGHT',
      maximumConcurrentWorkers: Math.min(this.hardConcurrencyMaximum, input.scenario.controls.maximumConcurrentWorkers),
      worlds,
      planningExplanation: `Deterministic local plan with ${worlds.length} initial worlds and maximum concurrency ${Math.min(this.hardConcurrencyMaximum, input.scenario.controls.maximumConcurrentWorkers)}. No AI provider was used.`,
    };
  }
}
