import { createHash } from 'node:crypto';
import type { DeterministicWorldDefinition } from './deterministic-experiment-plan.service.js';

export type MinimisationVariableType = 'BOOLEAN' | 'ENUM' | 'INTEGER' | 'STRING';
export type MinimisationStrategy = 'GREEDY_CONDITION_REMOVAL' | 'BOUNDED_NUMERIC_SEARCH';
export type CandidateResult =
  | 'FAILURE_REPRODUCED'
  | 'FAILURE_NOT_REPRODUCED'
  | 'INCONCLUSIVE'
  | 'EXECUTION_FAILED'
  | 'CANCELLED';
export type ConditionDecision = 'RETAINED' | 'REMOVED' | 'INCONCLUSIVE';

export interface MinimisationVariable {
  name:
    | 'duplicateSubmissionBug'
    | 'doubleSubmit'
    | 'paymentDelayMs'
    | 'doubleSubmitIntervalMs'
    | 'userProfile'
    | 'viewport'
    | 'networkProfile'
    | 'browser';
  type: MinimisationVariableType;
  sourceValue: unknown;
  neutralValue?: unknown;
  lowerKnownPassingValue?: number;
  upperKnownFailingValue?: number;
  priority: number;
  removable: boolean;
  reason: string;
}

export interface MinimisationPlan {
  id: string;
  investigationId: string;
  findingId: string;
  sourceWorldId: string;
  sourceExperimentId: string;
  reproductionRunId: string;
  strategy: MinimisationStrategy;
  strategyVersion: string;
  baselineFailingConfiguration: DeterministicWorldDefinition;
  candidateVariables: MinimisationVariable[];
  fixedVariables: Record<string, unknown>;
  maximumTrials: number;
  targetPrecisionMs: number;
  createdAt: string;
}

export interface MinimisationCandidateDefinition {
  id: string;
  minimisationRunId: string;
  sequence: number;
  purpose: string;
  variable: MinimisationVariable;
  candidateValue: unknown;
  expectedInterpretation: string;
  world: DeterministicWorldDefinition;
}

export interface DelayRange {
  lowerPassingBoundMs?: number;
  upperFailingBoundMs?: number;
  targetPrecisionMs: number;
}

export interface MinimisationState {
  retainedConditions: Record<string, unknown>;
  removedConditions: Record<string, unknown>;
  inconclusiveConditions: Record<string, unknown>;
  currentConfiguration: DeterministicWorldDefinition;
  completedTrials: number;
  delayRange: DelayRange;
}

export interface ConditionDecisionResult {
  decision: ConditionDecision;
  result: CandidateResult;
  retainedConditions: Record<string, unknown>;
  removedConditions: Record<string, unknown>;
  inconclusiveConditions: Record<string, unknown>;
  currentConfiguration: DeterministicWorldDefinition;
  delayRange: DelayRange;
  explanation: string;
}

export interface ConfidenceUpdate {
  previousConfidence: number;
  finalConfidence: number;
  confidenceLabel: 'POSSIBLE' | 'PROBABLE' | 'CONFIRMED';
  explanation: string[];
}

export interface DeterministicMinimisationPlanInput {
  investigationId: string;
  findingId: string;
  findingFingerprint: string;
  sourceWorldId: string;
  sourceExperimentId: string;
  reproductionRunId: string;
  sourceWorld: DeterministicWorldDefinition;
  causalConditions: Record<string, unknown>;
  maximumTrials: number;
  targetPrecisionMs: number;
  createdAt?: string;
}

const stableId = (prefix: string, material: unknown): string =>
  `${prefix}_${createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 20)}`;

const seed = (value: string): number =>
  Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 7), 16);

const failureRegionBounds = (conditions: Record<string, unknown>) => {
  const failureRegion = record(conditions.failureRegion);
  const estimate = record(failureRegion.estimatedDelayRegion);
  return {
    lowerPassingBoundMs: numberValue(estimate.lowerPassingBoundMs),
    upperFailingBoundMs: numberValue(estimate.upperFailingBoundMs),
  };
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export class DeterministicMinimisationPlanService {
  readonly strategyVersion = 'duplicate-checkout-greedy-v1';

  create(input: DeterministicMinimisationPlanInput): MinimisationPlan {
    const source = input.sourceWorld;
    const bounds = failureRegionBounds(input.causalConditions);
    const id = stableId('min_run', {
      investigationId: input.investigationId,
      findingFingerprint: input.findingFingerprint,
      strategyVersion: this.strategyVersion,
    });
    const variables = [
      {
        name: 'duplicateSubmissionBug',
        type: 'BOOLEAN',
        sourceValue: source.duplicateSubmissionBug,
        neutralValue: false,
        priority: 1,
        removable: source.duplicateSubmissionBug !== false,
        reason: 'Tests whether defective duplicate-submission mode is required.',
      },
      {
        name: 'doubleSubmit',
        type: 'BOOLEAN',
        sourceValue: source.doubleSubmit,
        neutralValue: false,
        priority: 2,
        removable: source.doubleSubmit !== false,
        reason: 'Tests whether repeated user submission is required.',
      },
      {
        name: 'paymentDelayMs',
        type: 'INTEGER',
        sourceValue: source.paymentDelayMs,
        ...(bounds.lowerPassingBoundMs !== undefined ? { lowerKnownPassingValue: bounds.lowerPassingBoundMs } : {}),
        upperKnownFailingValue: bounds.upperFailingBoundMs ?? source.paymentDelayMs,
        priority: 3,
        removable: false,
        reason: 'Bounds the payment-delay region where the duplicate submission reproduces.',
      },
      {
        name: 'doubleSubmitIntervalMs',
        type: 'INTEGER',
        sourceValue: source.doubleSubmitIntervalMs,
        neutralValue: 100,
        priority: 4,
        removable: source.doubleSubmitIntervalMs !== 100,
        reason: 'Tests whether a non-default repeated-click interval is required.',
      },
      {
        name: 'userProfile',
        type: 'ENUM',
        sourceValue: source.userProfile,
        neutralValue: 'normal',
        priority: 5,
        removable: source.userProfile !== 'normal',
        reason: 'Tests whether the impatient user profile is required beyond the explicit repeated click.',
      },
      {
        name: 'viewport',
        type: 'ENUM',
        sourceValue: source.viewport,
        neutralValue: 'desktop-1440x900',
        priority: 6,
        removable: source.viewport !== 'desktop-1440x900',
        reason: 'Tests whether the mobile viewport is required for the failure.',
      },
      {
        name: 'networkProfile',
        type: 'ENUM',
        sourceValue: source.networkProfile,
        neutralValue: 'normal',
        priority: 7,
        removable: source.networkProfile !== 'normal',
        reason: 'Tests whether a non-normal network profile is required.',
      },
      {
        name: 'browser',
        type: 'ENUM',
        sourceValue: source.browser,
        neutralValue: 'chromium',
        priority: 8,
        removable: source.browser !== 'chromium',
        reason: 'Tests whether a non-Chromium browser is required.',
      },
    ] satisfies MinimisationVariable[];
    const sortedVariables = [...variables].sort((left, right) => left.priority - right.priority);

    return {
      id,
      investigationId: input.investigationId,
      findingId: input.findingId,
      sourceWorldId: input.sourceWorldId,
      sourceExperimentId: input.sourceExperimentId,
      reproductionRunId: input.reproductionRunId,
      strategy: 'GREEDY_CONDITION_REMOVAL',
      strategyVersion: this.strategyVersion,
      baselineFailingConfiguration: source,
      candidateVariables: sortedVariables,
      fixedVariables: {
        journey: 'commerce-checkout',
        invariantSet: 'duplicate-checkout-submission',
        sourceWorldId: input.sourceWorldId,
        sourceExperimentId: input.sourceExperimentId,
      },
      maximumTrials: input.maximumTrials,
      targetPrecisionMs: input.targetPrecisionMs,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
  }

  categoricalCandidates(plan: MinimisationPlan, state: MinimisationState): MinimisationCandidateDefinition[] {
    return plan.candidateVariables
      .filter((variable) => variable.name !== 'paymentDelayMs' && variable.removable)
      .slice(0, Math.max(0, plan.maximumTrials - state.completedTrials))
      .map((variable, index) =>
        this.candidate(plan, state.currentConfiguration, variable, variable.neutralValue, index + 1, this.purpose(variable.name)),
      );
  }

  nextDelayCandidate(plan: MinimisationPlan, state: MinimisationState, sequence: number): MinimisationCandidateDefinition | null {
    const lower = state.delayRange.lowerPassingBoundMs;
    const upper = state.delayRange.upperFailingBoundMs;
    const variable = plan.candidateVariables.find(({ name }) => name === 'paymentDelayMs');
    if (!variable || lower === undefined || upper === undefined) return null;
    if (upper - lower <= plan.targetPrecisionMs) return null;
    const midpoint = Math.floor((lower + upper) / 2);
    if (midpoint === lower || midpoint === upper) return null;
    return this.candidate(plan, state.currentConfiguration, variable, midpoint, sequence, 'DELAY_BOUNDARY_SEARCH');
  }

  confirmationCandidate(plan: MinimisationPlan, state: MinimisationState, sequence: number): MinimisationCandidateDefinition {
    const variable: MinimisationVariable = {
      name: 'paymentDelayMs',
      type: 'INTEGER',
      sourceValue: plan.baselineFailingConfiguration.paymentDelayMs,
      neutralValue: state.currentConfiguration.paymentDelayMs,
      priority: 99,
      removable: false,
      reason: 'Confirms the final minimal tested condition set reproduces.',
    };
    return this.candidate(plan, state.currentConfiguration, variable, state.currentConfiguration.paymentDelayMs, sequence, 'CONFIRM_MINIMAL_SET');
  }

  initialState(plan: MinimisationPlan): MinimisationState {
    const payment = plan.candidateVariables.find(({ name }) => name === 'paymentDelayMs');
    return {
      retainedConditions: {},
      removedConditions: {},
      inconclusiveConditions: {},
      currentConfiguration: plan.baselineFailingConfiguration,
      completedTrials: 0,
      delayRange: {
        ...(payment?.lowerKnownPassingValue !== undefined ? { lowerPassingBoundMs: payment.lowerKnownPassingValue } : {}),
        ...(payment?.upperKnownFailingValue !== undefined ? { upperFailingBoundMs: payment.upperKnownFailingValue } : {}),
        targetPrecisionMs: plan.targetPrecisionMs,
      },
    };
  }

  decide(
    state: MinimisationState,
    candidate: MinimisationCandidateDefinition,
    result: CandidateResult,
  ): ConditionDecisionResult {
    const sourceValue = candidate.variable.sourceValue;
    const name = candidate.variable.name;
    if (candidate.purpose === 'DELAY_BOUNDARY_SEARCH') {
      const delay = Number(candidate.candidateValue);
      const nextRange = { ...state.delayRange };
      if (result === 'FAILURE_REPRODUCED') nextRange.upperFailingBoundMs = delay;
      else if (result === 'FAILURE_NOT_REPRODUCED') nextRange.lowerPassingBoundMs = delay;
      else {
        return this.inconclusive(state, candidate, result, 'Delay candidate did not produce a reliable classification.');
      }
      return {
        decision: 'REMOVED',
        result,
        retainedConditions: state.retainedConditions,
        removedConditions: state.removedConditions,
        inconclusiveConditions: state.inconclusiveConditions,
        currentConfiguration: { ...state.currentConfiguration, paymentDelayMs: nextRange.upperFailingBoundMs ?? state.currentConfiguration.paymentDelayMs },
        delayRange: nextRange,
        explanation: 'Delay range updated from the observed candidate result.',
      };
    }
    if (candidate.purpose === 'CONFIRM_MINIMAL_SET') {
      if (result === 'FAILURE_REPRODUCED') {
        return {
          decision: 'RETAINED',
          result,
          retainedConditions: state.retainedConditions,
          removedConditions: state.removedConditions,
          inconclusiveConditions: state.inconclusiveConditions,
          currentConfiguration: state.currentConfiguration,
          delayRange: state.delayRange,
          explanation: 'Final minimal tested condition set reproduced the invariant violation.',
        };
      }
      return this.inconclusive(state, candidate, result, 'Final confirmation did not reproduce reliably.');
    }
    if (result === 'FAILURE_REPRODUCED') {
      return {
        decision: 'REMOVED',
        result,
        retainedConditions: state.retainedConditions,
        removedConditions: { ...state.removedConditions, [name]: sourceValue },
        inconclusiveConditions: state.inconclusiveConditions,
        currentConfiguration: candidate.world,
        delayRange: state.delayRange,
        explanation: `${name} was removed from the minimal tested set because the failure still reproduced.`,
      };
    }
    if (result === 'FAILURE_NOT_REPRODUCED') {
      return {
        decision: 'RETAINED',
        result,
        retainedConditions: { ...state.retainedConditions, [name]: sourceValue },
        removedConditions: state.removedConditions,
        inconclusiveConditions: state.inconclusiveConditions,
        currentConfiguration: state.currentConfiguration,
        delayRange: state.delayRange,
        explanation: `${name} was retained because removing it stopped the reproduced failure.`,
      };
    }
    return this.inconclusive(state, candidate, result, `${name} remained inconclusive.`);
  }

  updateConfidence(input: {
    previousConfidence: number;
    retainedCount: number;
    removedCount: number;
    boundedRangeEstablished: boolean;
    finalConfirmationReproduced: boolean;
    maximumConfidence: number;
  }): ConfidenceUpdate {
    let confidence = input.previousConfidence;
    const explanation: string[] = [];
    if (input.retainedCount > 0) {
      confidence += input.retainedCount * 0.005;
      explanation.push(`${input.retainedCount} retained condition(s) were tested conservatively.`);
    }
    if (input.removedCount > 0) {
      confidence += input.removedCount * 0.005;
      explanation.push(`${input.removedCount} nonessential condition(s) were removed in the tested configuration.`);
    }
    if (input.boundedRangeEstablished) {
      confidence += 0.01;
      explanation.push('A bounded payment-delay failure range was established.');
    }
    if (input.finalConfirmationReproduced) {
      confidence += 0.02;
      explanation.push('Final minimal-set confirmation reproduced the invariant violation.');
    }
    const finalConfidence = Math.min(input.maximumConfidence, Number(confidence.toFixed(3)));
    return {
      previousConfidence: input.previousConfidence,
      finalConfidence,
      confidenceLabel: finalConfidence >= 0.9 ? 'CONFIRMED' : finalConfidence >= 0.8 ? 'PROBABLE' : 'POSSIBLE',
      explanation,
    };
  }

  private candidate(
    plan: MinimisationPlan,
    current: DeterministicWorldDefinition,
    variable: MinimisationVariable,
    candidateValue: unknown,
    sequence: number,
    purpose: string,
  ): MinimisationCandidateDefinition {
    const key = stableId('min_world', {
      runId: plan.id,
      purpose,
      variable: variable.name,
      candidateValue,
      sequence,
    });
    const world: DeterministicWorldDefinition = {
      ...current,
      [variable.name]: candidateValue,
      key,
      name: this.name(purpose, variable.name),
      reason: `${variable.reason} Candidate changes ${variable.name} only.`,
      expectedOutcome: purpose === 'CONFIRM_MINIMAL_SET' ? 'INVARIANT_VIOLATION' : 'OBSERVE',
      creationOrder: plan.baselineFailingConfiguration.creationOrder + 2_000 + sequence,
      randomSeed: seed(key),
      origin: 'MINIMISATION',
      minimisation: {
        minimisationRunId: plan.id,
        findingId: plan.findingId,
        sourceWorldId: plan.sourceWorldId,
        reproductionRunId: plan.reproductionRunId,
        candidateId: stableId('min_candidate', { runId: plan.id, sequence, purpose, variable: variable.name, candidateValue }),
        candidateVariable: variable.name,
        candidatePurpose: purpose,
        sourceValue: variable.sourceValue,
        candidateValue,
        retainedConditions: {},
        candidateSequence: sequence,
        expectedInterpretation: purpose === 'CONFIRM_MINIMAL_SET'
          ? 'CONFIRM_MINIMAL_SET'
          : 'Failure persists means removed; failure stops means retained.',
      },
    };
    return {
      id: world.minimisation!.candidateId,
      minimisationRunId: plan.id,
      sequence,
      purpose,
      variable,
      candidateValue,
      expectedInterpretation: world.minimisation!.expectedInterpretation,
      world,
    };
  }

  private inconclusive(
    state: MinimisationState,
    candidate: MinimisationCandidateDefinition,
    result: CandidateResult,
    explanation: string,
  ): ConditionDecisionResult {
    return {
      decision: 'INCONCLUSIVE',
      result,
      retainedConditions: state.retainedConditions,
      removedConditions: state.removedConditions,
      inconclusiveConditions: { ...state.inconclusiveConditions, [candidate.variable.name]: candidate.variable.sourceValue },
      currentConfiguration: state.currentConfiguration,
      delayRange: state.delayRange,
      explanation,
    };
  }

  private purpose(name: MinimisationVariable['name']): string {
    if (name === 'duplicateSubmissionBug') return 'REMOVE_BUG_FLAG';
    if (name === 'doubleSubmit') return 'REMOVE_DOUBLE_SUBMIT';
    if (name === 'userProfile') return 'NORMALISE_USER_PROFILE';
    if (name === 'viewport') return 'NORMALISE_VIEWPORT';
    if (name === 'networkProfile') return 'NORMALISE_NETWORK_PROFILE';
    if (name === 'browser') return 'NORMALISE_BROWSER';
    return `NORMALISE_${name.toUpperCase()}`;
  }

  private name(purpose: string, variable: string): string {
    if (purpose === 'CONFIRM_MINIMAL_SET') return 'Confirm minimal tested checkout failure';
    if (purpose === 'DELAY_BOUNDARY_SEARCH') return 'Payment-delay boundary probe';
    return `Minimise ${variable}`;
  }
}
