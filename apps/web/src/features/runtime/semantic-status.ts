export type SemanticTone = 'pass' | 'running' | 'pending' | 'fail' | 'neutral';
export type SemanticStatusTone = SemanticTone;

export interface SemanticStatusDefinition {
  tone: SemanticTone;
  label: string;
  accessibleText: string;
  description?: string;
}

type StatusMap = Readonly<Record<string, readonly [SemanticTone, string, string?]>>;

const executionStatuses = {
  COMPLETED: ['pass', 'Completed'], PASSED: ['pass', 'Passed'], SUCCEEDED: ['pass', 'Succeeded'], VERIFIED: ['pass', 'Verified'],
  RUNNING: ['running', 'Running'], OBSERVING: ['running', 'Observing'], ADAPTING: ['running', 'Adapting'], REPRODUCING: ['running', 'Reproducing'], MINIMISING: ['running', 'Minimising'], COLLECTING_EVIDENCE: ['running', 'Collecting evidence'], DOWNLOADING_ARTIFACTS: ['running', 'Downloading artifacts'],
  QUEUED: ['pending', 'Queued'], PENDING: ['pending', 'Pending'], PLANNING: ['pending', 'Planning'], PROVISIONING: ['pending', 'Provisioning'], STARTING: ['pending', 'Starting'], RETRYING: ['pending', 'Retrying'], WAITING_FOR_INPUT: ['pending', 'Waiting for input'],
  FAILED: ['fail', 'Failed'], ERROR: ['fail', 'Error'], TIMED_OUT: ['fail', 'Timed out'], BLOCKED: ['fail', 'Blocked'],
  CANCELLED: ['neutral', 'Cancelled'], DISABLED: ['neutral', 'Disabled'],
} as const satisfies StatusMap;

const outcomes = {
  PASS: ['pass', 'Pass'], PASSED: ['pass', 'Passed'], SUCCESS: ['pass', 'Success'],
  FAIL: ['fail', 'Fail'], FAILED: ['fail', 'Failed'], RUNNING: ['running', 'Running'], PENDING: ['pending', 'Pending'], MIXED: ['pending', 'Mixed'], INCONCLUSIVE: ['pending', 'Inconclusive'],
} as const satisfies StatusMap;

const validationStates = {
  READY: ['pass', 'Ready'], PASSED: ['pass', 'Passed'], VALID: ['pass', 'Valid'], COMPATIBLE: ['pass', 'Runtime compatible'], SUPPORTED: ['pass', 'Supported'], ELIGIBLE: ['pass', 'Eligible'],
  DRAFT: ['pending', 'Draft'], WARNING: ['pending', 'Warning'], INCOMPLETE: ['pending', 'Incomplete'],
  INVALID: ['fail', 'Invalid'], FAILED: ['fail', 'Failed'], UNSUPPORTED: ['fail', 'Runtime unsupported'], INELIGIBLE: ['fail', 'Ineligible'], BLOCKED: ['fail', 'Blocked'],
  DISABLED: ['neutral', 'Disabled'], SKIPPED: ['neutral', 'Skipped'], NOT_APPLICABLE: ['neutral', 'Not applicable'], UNKNOWN: ['neutral', 'Unknown'],
} as const satisfies StatusMap;

function key(value: string | null | undefined) { return value?.trim().toUpperCase().replace(/[\s-]+/g, '_') ?? ''; }
function readable(value: string | null | undefined, fallback = 'Unknown') {
  const text = value?.trim();
  return text ? text.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}
function mapped(value: string | null | undefined, map: StatusMap, fallback = 'Unknown'): SemanticStatusDefinition {
  const entry = map[key(value)];
  const label = entry?.[1] ?? readable(value, fallback);
  return { tone: entry?.[0] ?? 'neutral', label, accessibleText: `${label} status`, ...(entry?.[2] ? { description: entry[2] } : {}) };
}

export const investigationExecutionStatus = (status: string | null | undefined) => mapped(status, executionStatuses);
export const worldExecutionStatus = investigationExecutionStatus;
export const businessResultStatus = (result: string | null | undefined) => mapped(result, outcomes, 'No business result');
export const validationStatus = (status: string | null | undefined) => mapped(status, validationStates);
export const invariantReadinessStatus = validationStatus;
export const environmentStatus = validationStatus;
export const repairVerificationStatus = (status: string | null | undefined, result?: string | null) => result
  ? mapped(result, { ...outcomes, REPAIR_VERIFIED: ['pass', 'Repair verified'], VERIFIED_FIXED: ['pass', 'Verified fixed'], REGRESSION_DETECTED: ['fail', 'Regression detected'], REPAIR_FAILED: ['fail', 'Repair failed'] })
  : investigationExecutionStatus(status);

export const findingSeverityStatus = (severity: string | null | undefined) => mapped(severity, { CRITICAL: ['fail', 'Critical'], HIGH: ['fail', 'High'], MEDIUM: ['pending', 'Medium'], LOW: ['neutral', 'Low'], INFO: ['neutral', 'Info'] });
export const confidenceStatus = (confidence: string | null | undefined) => mapped(confidence, { CONFIRMED: ['pass', 'Confirmed'], DETERMINISTIC: ['pass', 'Deterministic'], HIGH: ['pass', 'High confidence'], PROBABLE: ['pending', 'Probable'], MEDIUM: ['pending', 'Medium confidence'], POSSIBLE: ['pending', 'Possible'], LOW: ['neutral', 'Low confidence'], INCONCLUSIVE: ['neutral', 'Inconclusive'] });
export const findingStateStatus = (status: string | null | undefined) => mapped(status, { OPEN: ['pending', 'Open'], UNREVIEWED: ['pending', 'Unreviewed'], REPRODUCED: ['fail', 'Reproduced'], SUPPORTED: ['pass', 'Supported'], RESOLVED: ['pass', 'Resolved'], VERIFIED_FIXED: ['pass', 'Verified fixed'], FLAKY: ['pending', 'Flaky'], INCONCLUSIVE: ['neutral', 'Inconclusive'], DISMISSED: ['neutral', 'Dismissed'] });
export function projectReadinessStatus(ready: boolean | string | null | undefined): SemanticStatusDefinition {
  return typeof ready === 'boolean' ? mapped(ready ? 'READY' : 'INCOMPLETE', validationStates) : mapped(ready, validationStates);
}
export const setupStatus = (state: 'configured' | 'incomplete' | 'invalid' | 'optional' | 'disabled' | string) => mapped(state, { CONFIGURED: ['pass', 'Configured'], COMPLETE: ['pass', 'Complete'], INCOMPLETE: ['pending', 'Incomplete'], REQUIRED: ['pending', 'Required'], INVALID: ['fail', 'Invalid'], UNSAFE: ['fail', 'Unsafe'], OPTIONAL: ['neutral', 'Optional'], DISABLED: ['neutral', 'Disabled'] });
export const investigationPhaseStatus = (state: string | null | undefined) => mapped(state, { COMPLETED: ['pass', 'Completed'], ACTIVE: ['running', 'Active'], CURRENT: ['running', 'Current'], RUNNING: ['running', 'Running'], WAITING: ['pending', 'Waiting for input'], PENDING: ['pending', 'Pending'], BLOCKED: ['fail', 'Blocked'], FAILED: ['fail', 'Failed'], FUTURE: ['neutral', 'Not started'], NOT_STARTED: ['neutral', 'Not started'], SKIPPED: ['neutral', 'Skipped'], STOPPED: ['fail', 'Stopped'] });
export function plannerFallbackStatus(status: string | null | undefined, fallbackUsed = false): SemanticStatusDefinition {
  return fallbackUsed ? { tone: 'pending', label: 'Fallback used', accessibleText: 'Planner fallback used status' } : mapped(status, { ACCEPTED: ['pass', 'Accepted'], FALLBACK: ['pending', 'Fallback'], WARNING: ['pending', 'Warning'], PARTIAL: ['pending', 'Partial'], FAILED: ['fail', 'Failed'], REJECTED: ['fail', 'Rejected'] });
}
export const causalConditionStatus = (role: string | null | undefined) => mapped(role, { RETAINED: ['fail', 'Retained failure condition'], REQUIRED: ['fail', 'Required failure condition'], REMOVED: ['pass', 'Removed'], NOT_REQUIRED: ['pass', 'Not required'], INCONCLUSIVE: ['pending', 'Inconclusive'], UNTESTED: ['neutral', 'Untested'] });

export const executionStatusTone = (value: string | null | undefined) => investigationExecutionStatus(value).tone;
export const businessOutcomeTone = (value: string | null | undefined) => businessResultStatus(value).tone;
export const findingSeverityTone = (value: string | null | undefined) => findingSeverityStatus(value).tone;
export const confidenceTone = (value: string | null | undefined) => confidenceStatus(value).tone;
export const plannerStatusTone = (value: string | null | undefined, fallbackUsed = false) => plannerFallbackStatus(value, fallbackUsed).tone;
export const repairVerificationTone = (status: string | null | undefined, result?: string | null) => repairVerificationStatus(status, result).tone;
export const conditionRoleTone = (role: 'retained' | 'removed' | 'inconclusive') => causalConditionStatus(role).tone;
