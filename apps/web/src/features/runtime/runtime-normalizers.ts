import type { Finding, InvestigationEvent, InvestigationProgress } from '@taskos/shared-types';
import type { EvidenceArtifactResponse, ExperimentPlanResponse, FindingDetail, InvestigationExperiment, InvestigationWorld } from '../../services/api/index.js';

export type WorldOrigin = 'INITIAL' | 'ADAPTIVE_REPRODUCTION' | 'MINIMISATION' | 'UNKNOWN';
export type WorldFilter = 'ALL' | WorldOrigin | 'PASSED' | 'FAILED' | 'RUNNING';

export const terminalStatuses = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function isTerminalStatus(status: string): boolean {
  return terminalStatuses.has(status);
}

export function phaseLabel(status: string): string {
  const labels: Record<string, string> = {
    PLANNING: 'Planning experiments',
    QUEUED: 'Waiting to start',
    PROVISIONING: 'Preparing isolated worlds',
    RUNNING: 'Exploring worlds',
    OBSERVING: 'Evaluating results',
    ADAPTING: 'Designing follow-up experiments',
    REPRODUCING: 'Reproducing the failure',
    MINIMISING: 'Finding minimal trigger conditions',
    COMPLETED: 'Investigation complete',
    FAILED: 'Investigation failed',
    CANCELLED: 'Investigation cancelled',
  };
  return labels[status] ?? humanize(status);
}

export function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortId(id: string, length = 8): string {
  return id.length <= length ? id : `${id.slice(0, length)}…`;
}

export function formatDate(value?: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString();
}

export function formatDuration(ms?: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 'Not recorded';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : 'Not recorded';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function worldOrigin(world: Pick<InvestigationWorld, 'configuration'>): WorldOrigin {
  const config = object(world.configuration);
  const origin = config.origin;
  if (origin === 'ADAPTIVE_REPRODUCTION' || origin === 'MINIMISATION') return origin;
  if (origin === 'INITIAL') return 'INITIAL';
  if (!('origin' in config)) return 'INITIAL';
  return 'UNKNOWN';
}

export function worldPurpose(world: Pick<InvestigationWorld, 'configuration' | 'reason'>): string {
  const config = object(world.configuration);
  const adaptive = object(config.adaptive);
  const minimisation = object(config.minimisation);
  const purpose = minimisation.purpose ?? minimisation.variable ?? adaptive.purpose ?? config.purpose;
  return typeof purpose === 'string' && purpose.trim() ? humanize(purpose) : world.reason;
}

export function configValue(world: Pick<InvestigationWorld, 'configuration'>, key: string): unknown {
  return object(world.configuration)[key];
}

export function worldBrowser(world: InvestigationWorld): string {
  return formatValue(configValue(world, 'browser') ?? configValue(world, 'browserEngine'));
}

export function worldViewport(world: InvestigationWorld): string {
  const viewport = configValue(world, 'viewport');
  if (viewport && typeof viewport === 'object') {
    const details = object(viewport);
    return `${formatValue(details.width)}×${formatValue(details.height)}`;
  }
  return formatValue(viewport);
}

export function paymentDelay(world: InvestigationWorld): string {
  const value = configValue(world, 'paymentDelayMs');
  return typeof value === 'number' ? `${value.toLocaleString()} ms` : 'Not recorded';
}

export function repeatedSubmit(world: InvestigationWorld): string {
  return configValue(world, 'doubleSubmit') === true ? 'Yes' : 'No';
}

export function bugMode(world: InvestigationWorld): string {
  return configValue(world, 'duplicateSubmissionBug') === true ? 'Defective' : 'Healthy';
}

export function experimentForWorld(world: InvestigationWorld, experiments: InvestigationExperiment[]): InvestigationExperiment | undefined {
  return experiments.find((experiment) => experiment.worldId === world.id || experiment.id === world.experimentId);
}

export function evidenceForExperiment(experimentId: string | undefined, evidence: EvidenceArtifactResponse[]): EvidenceArtifactResponse[] {
  return experimentId ? evidence.filter((artifact) => artifact.experimentId === experimentId) : [];
}

export function worldResult(world: InvestigationWorld, experiments: InvestigationExperiment[]): string {
  const experiment = experimentForWorld(world, experiments);
  if (!experiment) return humanize(world.status);
  if (experiment.status === 'PASSED') return 'PASS';
  if (experiment.status === 'FAILED' || experiment.status === 'ERROR') return 'FAIL';
  return humanize(experiment.status);
}

export function filterWorld(world: InvestigationWorld, filter: WorldFilter, experiments: InvestigationExperiment[]): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'PASSED') return worldResult(world, experiments) === 'PASS';
  if (filter === 'FAILED') return worldResult(world, experiments) === 'FAIL';
  if (filter === 'RUNNING') return world.status === 'RUNNING';
  return worldOrigin(world) === filter;
}

export function completedWorlds(progress: InvestigationProgress['progress']): number {
  return progress.passed + progress.failed + progress.flaky;
}

export function progressPercentage(progress: InvestigationProgress['progress']): number {
  return progress.totalWorlds === 0 ? 0 : Math.min(100, Math.round((completedWorlds(progress) / progress.totalWorlds) * 100));
}

export function providerFromPlan(plan: ExperimentPlanResponse | null | undefined): { requested: string; effective: string; status: string } {
  const metadata = object(plan?.plannerMetadata);
  const requested = typeof metadata.requestedProvider === 'string' ? metadata.requestedProvider : plan?.aiProvider ?? 'Not recorded';
  const effective = typeof metadata.effectiveProvider === 'string' ? metadata.effectiveProvider : plan?.aiProvider ?? 'Not recorded';
  const status = typeof metadata.plannerStatus === 'string' ? metadata.plannerStatus : plan?.plannerStatus ?? 'Not recorded';
  return { requested, effective, status };
}

export function plannerList(plan: ExperimentPlanResponse | null | undefined, key: string): string[] {
  const value = object(plan?.plannerMetadata)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function fallbackReason(plan: ExperimentPlanResponse | null | undefined): string | null {
  const value = object(plan?.plannerMetadata).fallbackReason;
  return typeof value === 'string' ? value : null;
}

export function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    adaptive_plan_created: 'Adaptive plan created',
    minimisation_condition_removed: 'Condition removed from minimal set',
    minimisation_condition_retained: 'Condition retained in minimal set',
    minimal_reproduction_found: 'Minimal tested condition set found',
    final_report_completed: 'Final evidence report generated',
    final_report_artifact_created: 'Final report artifact created',
    worker_started: 'Worker started',
    worker_completed: 'Worker completed',
    evidence_captured: 'Evidence captured',
    invariant_violated: 'Invariant violated',
    reproduction_completed: 'Reproduction completed',
    minimisation_completed: 'Minimisation completed',
  };
  return labels[type] ?? humanize(type);
}

export function eventMetadataSummary(event: InvestigationEvent): string[] {
  const metadata = object(event.metadata);
  const safeKeys = ['provider', 'workerStatus', 'attemptNumber', 'durationMs', 'phase', 'variable', 'result', 'conditionDecision', 'finalConfidence'];
  return safeKeys.flatMap((key) => key in metadata ? [`${humanize(key)}: ${formatValue(metadata[key])}`] : []);
}

export function evidenceGroups(evidence: EvidenceArtifactResponse[]): Record<string, EvidenceArtifactResponse[]> {
  const groups: Record<string, EvidenceArtifactResponse[]> = {
    'Final reports': [],
    Screenshots: [],
    Traces: [],
    Logs: [],
    'Worker outputs': [],
    Other: [],
  };
  for (const artifact of evidence) {
    if (artifact.type === 'FINAL_REPORT') groups['Final reports']!.push(artifact);
    else if (artifact.type === 'SCREENSHOT') groups.Screenshots!.push(artifact);
    else if (artifact.type === 'TRACE') groups.Traces!.push(artifact);
    else if (artifact.type === 'CONSOLE_LOG' || artifact.type === 'NETWORK_LOG') groups.Logs!.push(artifact);
    else if (artifact.type === 'WORKER_RESULT' || artifact.type === 'ENVIRONMENT_MANIFEST') groups['Worker outputs']!.push(artifact);
    else groups.Other!.push(artifact);
  }
  return groups;
}

export function noAbsolutePath(value: unknown): boolean {
  return !JSON.stringify(value).includes('/Users/') && !JSON.stringify(value).match(/[A-Za-z]:[\\/]/);
}

export function causalConditions(finding: Finding | FindingDetail): Record<string, unknown> {
  return object(finding.causalConditions);
}

export function conditionRecord(finding: Finding | FindingDetail, key: 'retainedConditions' | 'removedConditions' | 'inconclusiveConditions'): Record<string, unknown> {
  const conditions = causalConditions(finding);
  const nested = object(conditions.minimisation);
  return object(conditions[key] ?? nested[key]);
}

export function boundedRange(finding: Finding | FindingDetail): Record<string, unknown> {
  const conditions = causalConditions(finding);
  const nested = object(conditions.minimisation);
  return object(conditions.boundedRange ?? conditions.finalBoundedRange ?? nested.boundedRange ?? nested.finalBoundedRange);
}

export function reproductionSteps(finding: Finding | FindingDetail): string[] {
  const value = causalConditions(finding).reproductionSteps;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function causalStatus(finding: Finding | FindingDetail): string {
  const status = causalConditions(finding).causalStatus ?? causalConditions(finding).status;
  return typeof status === 'string' ? status : 'SUPPORTED';
}

export function finalReportIds(finding: Finding | FindingDetail): string[] {
  const conditions = causalConditions(finding);
  return [conditions.finalReportEvidenceId, conditions.finalReportMarkdownEvidenceId].filter((value): value is string => typeof value === 'string');
}
