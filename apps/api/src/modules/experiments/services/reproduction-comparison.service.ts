import type { AdaptivePurpose } from './adaptive-reproduction-plan.service.js';
import type { DeterministicWorldDefinition } from './deterministic-experiment-plan.service.js';

export type ComparisonOutcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
export type VariableInterpretation =
  | 'LIKELY_REQUIRED'
  | 'LIKELY_CONTRIBUTING'
  | 'NOT_REQUIRED'
  | 'INCONCLUSIVE';

export interface ReproductionWorldOutcome {
  worldId: string;
  experimentId: string;
  purpose: AdaptivePurpose;
  world: DeterministicWorldDefinition;
  outcome: ComparisonOutcome;
  invariantEvaluationIds: string[];
  evidenceArtifactIds: string[];
}

export interface VariableComparison {
  variable: string;
  sourceValue: unknown;
  comparisonValue: unknown;
  sourceOutcome: 'FAIL';
  comparisonOutcome: ComparisonOutcome;
  interpretation: VariableInterpretation;
  supportingWorldIds: string[];
}

export interface FailureRegionEstimate {
  findingCategory: 'DUPLICATE_CHECKOUT_SUBMISSION';
  supportedConditions: Record<string, unknown>;
  delayObservations: Array<{ paymentDelayMs: number; failed: boolean; worldId: string }>;
  estimatedDelayRegion: {
    lowerPassingBoundMs?: number;
    upperFailingBoundMs?: number;
    classification: 'FAILURE_OBSERVED_ABOVE_COMPARISON_RANGE' | 'INCONCLUSIVE';
  };
  causalStatus: 'UNCONFIRMED' | 'REPRODUCED' | 'SUPPORTED' | 'INCONCLUSIVE';
  limitations: string[];
}

export interface ReproductionComparisonResult {
  exactReproduced: boolean;
  comparisons: VariableComparison[];
  failureRegion: FailureRegionEstimate;
  causalStatus: FailureRegionEstimate['causalStatus'];
  supportingWorldIds: string[];
  supportingInvariantEvaluationIds: string[];
  evidenceArtifactIds: string[];
}

export class ReproductionComparisonService {
  compare(sourceWorld: DeterministicWorldDefinition, outcomes: ReproductionWorldOutcome[], sourceWorldId = sourceWorld.key): ReproductionComparisonResult {
    const exact = outcomes.find(({ purpose }) => purpose === 'EXACT_REPRODUCTION');
    const bug = outcomes.find(({ purpose }) => purpose === 'BUG_FLAG_CONTROL');
    const interaction = outcomes.find(({ purpose }) => purpose === 'INTERACTION_CONTROL');
    const delayOutcomes = outcomes
      .filter(({ purpose }) => purpose === 'DELAY_COMPARISON' || purpose === 'LOW_DELAY_COMPARISON')
      .sort((left, right) => left.world.paymentDelayMs - right.world.paymentDelayMs);
    const exactReproduced = exact?.outcome === 'FAIL';
    const comparisons: VariableComparison[] = [
      this.comparison('duplicateSubmissionBug', sourceWorld.duplicateSubmissionBug, bug?.world.duplicateSubmissionBug, bug),
      this.comparison('doubleSubmit', sourceWorld.doubleSubmit, interaction?.world.doubleSubmit, interaction),
      ...delayOutcomes.map((outcome) =>
        this.comparison('paymentDelayMs', sourceWorld.paymentDelayMs, outcome.world.paymentDelayMs, outcome, outcome.outcome === 'PASS' ? 'LIKELY_CONTRIBUTING' : 'INCONCLUSIVE'),
      ),
    ];
    const passingDelays = delayOutcomes.filter(({ outcome }) => outcome === 'PASS').map(({ world }) => world.paymentDelayMs);
    const failingDelays = [sourceWorld.paymentDelayMs, ...delayOutcomes.filter(({ outcome }) => outcome === 'FAIL').map(({ world }) => world.paymentDelayMs)];
    const supportedConditions: Record<string, unknown> = {};
    if (exactReproduced && bug?.outcome === 'PASS') supportedConditions.duplicateSubmissionBug = true;
    if (exactReproduced && interaction?.outcome === 'PASS') supportedConditions.doubleSubmit = true;
    const causalStatus = exactReproduced
      ? bug?.outcome === 'PASS' || interaction?.outcome === 'PASS'
        ? 'SUPPORTED'
        : 'REPRODUCED'
      : 'INCONCLUSIVE';
    const supporting = outcomes.filter(({ outcome }) => outcome === 'FAIL');
    return {
      exactReproduced,
      comparisons,
      failureRegion: {
        findingCategory: 'DUPLICATE_CHECKOUT_SUBMISSION',
        supportedConditions,
        delayObservations: [
          ...delayOutcomes.map(({ world, outcome, worldId }) => ({ paymentDelayMs: world.paymentDelayMs, failed: outcome === 'FAIL', worldId })),
          { paymentDelayMs: sourceWorld.paymentDelayMs, failed: true, worldId: sourceWorldId },
        ].sort((left, right) => left.paymentDelayMs - right.paymentDelayMs),
        estimatedDelayRegion: passingDelays.length && failingDelays.length
          ? {
              lowerPassingBoundMs: Math.max(...passingDelays),
              upperFailingBoundMs: Math.min(...failingDelays.filter((delay) => delay >= Math.max(...passingDelays))),
              classification: 'FAILURE_OBSERVED_ABOVE_COMPARISON_RANGE',
            }
          : { classification: 'INCONCLUSIVE' },
        causalStatus,
        limitations: [
          'Small deterministic sample',
          'No full threshold minimisation performed',
          'Results apply to the tested journey and fixture',
        ],
      },
      causalStatus,
      supportingWorldIds: supporting.map(({ worldId }) => worldId),
      supportingInvariantEvaluationIds: supporting.flatMap(({ invariantEvaluationIds }) => invariantEvaluationIds),
      evidenceArtifactIds: outcomes.flatMap(({ evidenceArtifactIds }) => evidenceArtifactIds),
    };
  }

  private comparison(
    variable: string,
    sourceValue: unknown,
    comparisonValue: unknown,
    outcome?: ReproductionWorldOutcome,
    passInterpretation: VariableInterpretation = 'LIKELY_REQUIRED',
  ): VariableComparison {
    const comparisonOutcome = outcome?.outcome ?? 'INCONCLUSIVE';
    return {
      variable,
      sourceValue,
      comparisonValue,
      sourceOutcome: 'FAIL',
      comparisonOutcome,
      interpretation: comparisonOutcome === 'PASS' ? passInterpretation : comparisonOutcome === 'FAIL' ? 'NOT_REQUIRED' : 'INCONCLUSIVE',
      supportingWorldIds: outcome ? [outcome.worldId] : [],
    };
  }
}
