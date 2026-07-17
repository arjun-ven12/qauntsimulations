import type { ReproductionComparisonResult, ReproductionWorldOutcome } from './reproduction-comparison.service.js';

export interface AdaptiveConfidenceOptions {
  initialConfidence: number;
  maximumConfidence: number;
}

export interface AdaptiveConfidenceResult {
  previousConfidence: number;
  updatedConfidence: number;
  confidenceLabel: 'POSSIBLE' | 'PROBABLE' | 'CONFIRMED';
  explanation: string[];
  reproducedIncrement: number;
}

export class AdaptiveConfidenceService {
  constructor(private readonly options: AdaptiveConfidenceOptions) {}

  update(previousConfidence: number | undefined, comparison: ReproductionComparisonResult, outcomes: ReproductionWorldOutcome[]): AdaptiveConfidenceResult {
    const starting = typeof previousConfidence === 'number' && Number.isFinite(previousConfidence)
      ? previousConfidence
      : this.options.initialConfidence;
    let confidence = starting;
    const explanation: string[] = [];
    let reproducedIncrement = 0;

    if (comparison.exactReproduced) {
      confidence += 0.08;
      reproducedIncrement += 1;
      explanation.push('Exact reproduction produced the same invariant violation.');
    } else {
      explanation.push('Exact reproduction did not produce the same invariant violation.');
    }
    if (outcomes.find(({ purpose, outcome }) => purpose === 'BUG_FLAG_CONTROL' && outcome === 'PASS')) {
      confidence += 0.04;
      explanation.push('Bug-flag control passed while the source condition failed.');
    }
    if (outcomes.find(({ purpose, outcome }) => purpose === 'INTERACTION_CONTROL' && outcome === 'PASS')) {
      confidence += 0.04;
      explanation.push('Interaction control passed while the source condition failed.');
    }
    if (outcomes.find(({ purpose, outcome }) => (purpose === 'DELAY_COMPARISON' || purpose === 'LOW_DELAY_COMPARISON') && outcome === 'PASS')) {
      confidence += 0.02;
      explanation.push('At least one lower-delay comparison passed.');
    }

    const updatedConfidence = Math.min(this.options.maximumConfidence, Number(confidence.toFixed(2)));
    return {
      previousConfidence: starting,
      updatedConfidence,
      confidenceLabel: updatedConfidence >= 0.9 ? 'CONFIRMED' : updatedConfidence >= 0.8 ? 'PROBABLE' : 'POSSIBLE',
      explanation,
      reproducedIncrement,
    };
  }
}
