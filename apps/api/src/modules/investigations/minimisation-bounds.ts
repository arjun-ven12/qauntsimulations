export interface MinimisationDelayCandidateEvidence {
  variableName: string;
  candidateValue: unknown;
  result: string | null;
}

export interface AggregatedMinimisationBounds {
  knownPassingDelayMs?: number;
  knownFailingDelayMs?: number;
  contradictory: boolean;
  evidence: Array<{
    delayMs: number;
    result: 'PASS' | 'FAIL';
  }>;
}

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function aggregateMinimisationDelayBounds(input: {
  existingPassingDelayMs?: number | null;
  existingFailingDelayMs?: number | null;
  candidates: MinimisationDelayCandidateEvidence[];
}): AggregatedMinimisationBounds {
  const passing: number[] = [];
  const failing: number[] = [];
  const evidence: AggregatedMinimisationBounds['evidence'] = [];
  const existingPassing = finiteNumber(input.existingPassingDelayMs);
  const existingFailing = finiteNumber(input.existingFailingDelayMs);
  if (existingPassing !== undefined) passing.push(existingPassing);
  if (existingFailing !== undefined) failing.push(existingFailing);

  for (const candidate of input.candidates) {
    if (candidate.variableName !== 'paymentDelayMs') continue;
    const delayMs = finiteNumber(candidate.candidateValue);
    if (delayMs === undefined) continue;
    if (candidate.result === 'FAILURE_NOT_REPRODUCED') {
      passing.push(delayMs);
      evidence.push({ delayMs, result: 'PASS' });
    } else if (candidate.result === 'FAILURE_REPRODUCED') {
      failing.push(delayMs);
      evidence.push({ delayMs, result: 'FAIL' });
    }
  }

  const knownPassingDelayMs = passing.length ? Math.max(...passing) : undefined;
  const knownFailingDelayMs = failing.length ? Math.min(...failing) : undefined;
  return {
    ...(knownPassingDelayMs !== undefined ? { knownPassingDelayMs } : {}),
    ...(knownFailingDelayMs !== undefined ? { knownFailingDelayMs } : {}),
    contradictory: knownPassingDelayMs !== undefined && knownFailingDelayMs !== undefined && knownPassingDelayMs >= knownFailingDelayMs,
    evidence,
  };
}

export function boundedRangeFromAggregatedBounds(bounds: AggregatedMinimisationBounds, targetPrecisionMs?: number): Record<string, unknown> {
  return {
    ...(bounds.knownPassingDelayMs !== undefined ? { lowerPassingBoundMs: bounds.knownPassingDelayMs } : {}),
    ...(bounds.knownFailingDelayMs !== undefined ? { upperFailingBoundMs: bounds.knownFailingDelayMs } : {}),
    ...(targetPrecisionMs !== undefined ? { targetPrecisionMs } : {}),
  };
}
