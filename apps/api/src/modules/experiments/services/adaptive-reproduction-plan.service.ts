import { createHash } from 'node:crypto';
import type { DeterministicWorldDefinition } from './deterministic-experiment-plan.service.js';

export type AdaptivePurpose =
  | 'EXACT_REPRODUCTION'
  | 'BUG_FLAG_CONTROL'
  | 'INTERACTION_CONTROL'
  | 'DELAY_COMPARISON'
  | 'LOW_DELAY_COMPARISON';

export interface AdaptiveVariable {
  name: 'duplicateSubmissionBug' | 'paymentDelayMs' | 'doubleSubmit' | 'doubleSubmitIntervalMs' | 'viewport' | 'userProfile';
  sourceValue: unknown;
  priority: number;
}

export interface AdaptiveWorldDefinition extends DeterministicWorldDefinition {
  origin: 'ADAPTIVE_REPRODUCTION';
  adaptive: NonNullable<DeterministicWorldDefinition['adaptive']>;
}

export interface AdaptiveReproductionPlan {
  id: string;
  investigationId: string;
  findingId: string;
  sourceWorldId: string;
  sourceExperimentId: string;
  strategy: 'EXACT_AND_CONTROLLED_COMPARISONS';
  objective: string;
  hypothesis: string;
  variables: AdaptiveVariable[];
  fixedConditions: Record<string, unknown>;
  generatedWorlds: AdaptiveWorldDefinition[];
  maximumWorlds: number;
  createdAt: string;
}

export interface AdaptivePlanInput {
  investigationId: string;
  findingId: string;
  findingFingerprint: string;
  sourceWorldId: string;
  sourceExperimentId: string;
  sourceWorld: DeterministicWorldDefinition;
  maximumWorlds: number;
  createdAt?: string;
}

const stableId = (prefix: string, material: unknown): string =>
  `${prefix}_${createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 20)}`;

const fixedVariables = (world: DeterministicWorldDefinition): Record<string, unknown> => ({
  browser: world.browser,
  journey: 'commerce-checkout',
  invariantSet: 'duplicate-checkout-submission',
  demoStoreVersion: 'runtime-fixture',
  doubleSubmitIntervalMs: world.doubleSubmitIntervalMs,
  userProfile: world.userProfile,
  viewport: world.viewport,
});

export class AdaptiveReproductionPlanService {
  create(input: AdaptivePlanInput): AdaptiveReproductionPlan {
    const planId = stableId('adaptive_plan', {
      investigationId: input.investigationId,
      findingFingerprint: input.findingFingerprint,
      sourceWorldId: input.sourceWorldId,
      strategy: 'EXACT_AND_CONTROLLED_COMPARISONS',
    });
    const reproductionRunId = stableId('repro_run', { planId, findingId: input.findingId });
    const source = input.sourceWorld;
    const createdAt = input.createdAt ?? new Date().toISOString();
    const fixed = fixedVariables(source);
    const worlds = [
      this.world(input, reproductionRunId, 'EXACT_REPRODUCTION', {}, 'Reruns the exact failing world to test deterministic reproducibility.', 'INVARIANT_VIOLATION', 0),
      this.world(input, reproductionRunId, 'BUG_FLAG_CONTROL', { duplicateSubmissionBug: false }, 'Tests whether duplicate-submission mode is necessary.', 'PASS', 1),
      this.world(input, reproductionRunId, 'INTERACTION_CONTROL', { doubleSubmit: false, userProfile: 'normal' }, 'Tests whether repeated user submission is necessary.', 'PASS', 2),
      this.world(input, reproductionRunId, 'DELAY_COMPARISON', { paymentDelayMs: Math.min(source.paymentDelayMs, 600) }, 'Tests whether the failure persists below the source delay.', 'OBSERVE', 3),
      this.world(input, reproductionRunId, 'LOW_DELAY_COMPARISON', { paymentDelayMs: Math.min(source.paymentDelayMs, 200) }, 'Provides a lower-delay comparison for the failure-region estimate.', 'OBSERVE', 4),
    ].slice(0, Math.max(0, input.maximumWorlds));

    return {
      id: planId,
      investigationId: input.investigationId,
      findingId: input.findingId,
      sourceWorldId: input.sourceWorldId,
      sourceExperimentId: input.sourceExperimentId,
      strategy: 'EXACT_AND_CONTROLLED_COMPARISONS',
      objective: 'Reproduce duplicate checkout submission and compare nearby controlled worlds.',
      hypothesis: 'The failure requires duplicate-submission mode, repeated user interaction, and sufficient payment-response delay.',
      variables: [
        { name: 'duplicateSubmissionBug', sourceValue: source.duplicateSubmissionBug, priority: 1 },
        { name: 'doubleSubmit', sourceValue: source.doubleSubmit, priority: 2 },
        { name: 'paymentDelayMs', sourceValue: source.paymentDelayMs, priority: 3 },
        { name: 'doubleSubmitIntervalMs', sourceValue: source.doubleSubmitIntervalMs, priority: 4 },
        { name: 'viewport', sourceValue: source.viewport, priority: 5 },
        { name: 'userProfile', sourceValue: source.userProfile, priority: 6 },
      ],
      fixedConditions: fixed,
      generatedWorlds: worlds,
      maximumWorlds: input.maximumWorlds,
      createdAt,
    };
  }

  private world(
    input: AdaptivePlanInput,
    reproductionRunId: string,
    purpose: AdaptivePurpose,
    changes: Partial<DeterministicWorldDefinition>,
    hypothesisContribution: string,
    expectedOutcome: DeterministicWorldDefinition['expectedOutcome'],
    index: number,
  ): AdaptiveWorldDefinition {
    const source = input.sourceWorld;
    const changedVariables = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const fixed = Object.fromEntries(
      Object.entries({
        duplicateSubmissionBug: source.duplicateSubmissionBug,
        paymentDelayMs: source.paymentDelayMs,
        doubleSubmit: source.doubleSubmit,
        doubleSubmitIntervalMs: source.doubleSubmitIntervalMs,
        viewport: source.viewport,
        userProfile: source.userProfile,
        browser: source.browser,
      }).filter(([key]) => !(key in changedVariables)),
    );
    const key = stableId('adaptive_world', {
      findingId: input.findingId,
      sourceWorldId: input.sourceWorldId,
      purpose,
      changedVariables,
    });
    return {
      ...source,
      ...changes,
      key,
      name: this.name(purpose),
      expectedOutcome,
      reason: hypothesisContribution,
      creationOrder: source.creationOrder + index + 1_000,
      randomSeed: this.seed(key),
      origin: 'ADAPTIVE_REPRODUCTION',
      adaptive: {
        reproductionRunId,
        findingId: input.findingId,
        sourceWorldId: input.sourceWorldId,
        sourceExperimentId: input.sourceExperimentId,
        adaptivePurpose: purpose,
        changedVariables,
        fixedVariables: fixed,
        hypothesisContribution,
      },
    };
  }

  private seed(value: string): number {
    return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 7), 16);
  }

  private name(purpose: AdaptivePurpose): string {
    if (purpose === 'EXACT_REPRODUCTION') return 'Exact reproduction of duplicate checkout';
    if (purpose === 'BUG_FLAG_CONTROL') return 'Duplicate checkout bug flag control';
    if (purpose === 'INTERACTION_CONTROL') return 'Duplicate checkout interaction control';
    if (purpose === 'DELAY_COMPARISON') return 'Duplicate checkout reduced-delay comparison';
    return 'Duplicate checkout low-delay comparison';
  }
}
