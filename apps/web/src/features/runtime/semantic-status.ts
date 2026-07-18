export type SemanticStatusTone = 'pass' | 'running' | 'pending' | 'fail' | 'neutral';

export function executionStatusTone(status: string | null | undefined): SemanticStatusTone {
  const value = status?.toUpperCase() ?? '';
  if (['COMPLETED', 'PASSED', 'SUCCEEDED', 'VERIFIED'].includes(value)) return 'pass';
  if (['FAILED', 'ERROR', 'TIMED_OUT'].includes(value)) return 'fail';
  if (['RUNNING', 'OBSERVING', 'ADAPTING', 'REPRODUCING', 'MINIMISING', 'COLLECTING_EVIDENCE', 'DOWNLOADING_ARTIFACTS'].includes(value)) return 'running';
  if (['QUEUED', 'PENDING', 'PLANNING', 'PROVISIONING', 'STARTING', 'RETRYING'].includes(value)) return 'pending';
  return 'neutral';
}

export function businessOutcomeTone(outcome: string | null | undefined): SemanticStatusTone {
  const value = outcome?.toUpperCase() ?? '';
  if (value === 'PASS') return 'pass';
  if (value === 'FAIL') return 'fail';
  if (value === 'RUNNING') return 'running';
  if (value === 'MIXED' || value === 'INCONCLUSIVE') return 'pending';
  return 'neutral';
}

export function findingSeverityTone(severity: string | null | undefined): SemanticStatusTone {
  const value = severity?.toUpperCase() ?? '';
  if (value === 'CRITICAL' || value === 'HIGH') return 'fail';
  if (value === 'MEDIUM') return 'pending';
  return 'neutral';
}

export function confidenceTone(confidence: string | null | undefined): SemanticStatusTone {
  const value = confidence?.toUpperCase() ?? '';
  if (value === 'CONFIRMED') return 'pass';
  if (value === 'PROBABLE') return 'running';
  if (value === 'POSSIBLE') return 'pending';
  return 'neutral';
}

export function plannerStatusTone(status: string | null | undefined, fallbackUsed = false): SemanticStatusTone {
  const value = status?.toUpperCase() ?? '';
  if (fallbackUsed || value.includes('FALLBACK') || value.includes('WARNING') || value.includes('PARTIAL')) return 'pending';
  if (value.includes('FAILED') || value.includes('REJECTED')) return 'fail';
  if (value === 'ACCEPTED') return 'pass';
  return 'neutral';
}

export function repairVerificationTone(status: string | null | undefined, result?: string | null): SemanticStatusTone {
  const outcome = result?.toUpperCase() ?? '';
  if (['REPAIR_VERIFIED', 'VERIFIED', 'PASS', 'PASSED'].includes(outcome)) return 'pass';
  if (['REPAIR_FAILED', 'REGRESSION_DETECTED', 'FAIL', 'FAILED'].includes(outcome)) return 'fail';
  return executionStatusTone(status);
}

export function conditionRoleTone(role: 'retained' | 'removed' | 'inconclusive'): SemanticStatusTone {
  if (role === 'retained') return 'fail';
  if (role === 'removed') return 'pass';
  return 'pending';
}
