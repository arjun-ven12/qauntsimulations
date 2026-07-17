import type { InvariantEvaluationResult } from '@taskos/execution-contracts';
import type { RuntimeInvariantDefinition } from '../invariants/invariants.types.js';

export type CorrelatedInvariantEvaluation = {
  invariant: RuntimeInvariantDefinition;
  evaluation: InvariantEvaluationResult;
};

export class InvariantEvaluationCorrelationError extends Error {
  readonly code = 'INVARIANT_EVALUATION_CORRELATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'InvariantEvaluationCorrelationError';
  }
}

export function correlateInvariantEvaluations(
  selectedInvariants: RuntimeInvariantDefinition[],
  evaluations: InvariantEvaluationResult[],
): CorrelatedInvariantEvaluation[] {
  const selectedById = new Map<string, RuntimeInvariantDefinition>();
  for (const invariant of selectedInvariants) {
    if (selectedById.has(invariant.id)) {
      throw new InvariantEvaluationCorrelationError(
        `Persisted launch snapshot contains duplicate Invariant ID ${invariant.id}`,
      );
    }
    selectedById.set(invariant.id, invariant);
  }

  const evaluationById = new Map<string, InvariantEvaluationResult>();
  for (const evaluation of evaluations) {
    const invariant = selectedById.get(evaluation.invariantId);
    if (!invariant) {
      throw new InvariantEvaluationCorrelationError(
        `Worker returned unknown Invariant ID ${evaluation.invariantId}`,
      );
    }
    if (invariant.type !== evaluation.type) {
      throw new InvariantEvaluationCorrelationError(
        `Worker evaluator ${evaluation.type} does not match persisted Invariant ${evaluation.invariantId} (${invariant.type})`,
      );
    }
    if (evaluationById.has(evaluation.invariantId)) {
      throw new InvariantEvaluationCorrelationError(
        `Worker returned duplicate output for Invariant ${evaluation.invariantId}`,
      );
    }
    evaluationById.set(evaluation.invariantId, evaluation);
  }

  const missingIds = selectedInvariants
    .filter(({ id }) => !evaluationById.has(id))
    .map(({ id }) => id);
  if (missingIds.length) {
    throw new InvariantEvaluationCorrelationError(
      `Worker did not return evaluations for selected Invariants: ${missingIds.join(', ')}`,
    );
  }

  return evaluations.map((evaluation) => ({
    invariant: selectedById.get(evaluation.invariantId)!,
    evaluation,
  }));
}
