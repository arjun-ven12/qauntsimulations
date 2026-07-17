import type { Finding, InvestigationEvent, InvestigationProgress } from '@taskos/shared-types';
import type { EvidenceArtifactResponse, ExperimentPlanResponse, FindingDetail, InvestigationExperiment, InvestigationWorker, InvestigationWorld } from '../../services/api/index.js';

export type WorldOrigin = 'INITIAL' | 'ADAPTIVE_REPRODUCTION' | 'MINIMISATION' | 'UNKNOWN';
export type WorldFilter = 'ALL' | WorldOrigin | 'PASSED' | 'FAILED' | 'RUNNING' | 'INCONCLUSIVE';
export type WorldSort = 'CHRONOLOGY' | 'STAGE' | 'STATUS' | 'PAYMENT_DELAY';

export const terminalStatuses = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function isTerminalStatus(status: string): boolean {
  return terminalStatuses.has(status);
}

export function phaseLabel(status: string): string {
  const labels: Record<string, string> = {
    PLANNING: 'Planning experiments',
    QUEUED: 'Waiting to start',
    PROVISIONING: 'Preparing isolated worlds',
    RUNNING: 'Exploring experiment worlds',
    OBSERVING: 'Evaluating business invariants',
    ADAPTING: 'Designing follow-up worlds',
    REPRODUCING: 'Reproducing the failure',
    MINIMISING: 'Narrowing trigger conditions',
    COMPLETED: 'Investigation complete',
    FAILED: 'Investigation failed',
    CANCELLED: 'Investigation cancelled',
  };
  return labels[status] ?? humanize(status);
}

export type PhaseTrackerStep = {
  id: 'PLAN' | 'EXPLORE' | 'REPRODUCE' | 'MINIMISE' | 'COMPLETE';
  label: string;
  state: 'completed' | 'active' | 'pending' | 'skipped' | 'stopped';
};

const phaseOrder: PhaseTrackerStep['id'][] = ['PLAN', 'EXPLORE', 'REPRODUCE', 'MINIMISE', 'COMPLETE'];

export function phaseStepForStatus(status: string): PhaseTrackerStep['id'] {
  if (status === 'PLANNING') return 'PLAN';
  if (['QUEUED', 'PROVISIONING', 'RUNNING', 'OBSERVING'].includes(status)) return 'EXPLORE';
  if (['ADAPTING', 'REPRODUCING'].includes(status)) return 'REPRODUCE';
  if (status === 'MINIMISING') return 'MINIMISE';
  return 'COMPLETE';
}

export function phaseTracker(status: string, findingsCount = 0): PhaseTrackerStep[] {
  const labels: Record<PhaseTrackerStep['id'], string> = {
    PLAN: 'Plan',
    EXPLORE: 'Explore',
    REPRODUCE: 'Reproduce',
    MINIMISE: 'Minimise',
    COMPLETE: 'Complete',
  };
  const current = phaseStepForStatus(status);
  const currentIndex = phaseOrder.indexOf(current);
  const terminal = isTerminalStatus(status);
  const findingFreeCompletion = status === 'COMPLETED' && findingsCount === 0;
  return phaseOrder.map((id, index) => {
    if (findingFreeCompletion && (id === 'REPRODUCE' || id === 'MINIMISE')) return { id, label: labels[id], state: 'skipped' };
    if ((status === 'FAILED' || status === 'CANCELLED') && index === currentIndex) return { id, label: labels[id], state: 'stopped' };
    if (terminal && status === 'COMPLETED') return { id, label: labels[id], state: index <= currentIndex ? 'completed' : 'pending' };
    if (index < currentIndex) return { id, label: labels[id], state: 'completed' };
    if (index === currentIndex) return { id, label: labels[id], state: 'active' };
    return { id, label: labels[id], state: 'pending' };
  });
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

export function formatConditionKey(key: string): string {
  const labels: Record<string, string> = {
    duplicateSubmissionBug: 'Duplicate-submission mode',
    doubleSubmit: 'Repeated checkout submission',
    doubleSubmitIntervalMs: 'Click interval',
    paymentDelayMs: 'Payment delay',
    userProfile: 'User profile',
    networkProfile: 'Network profile',
    viewport: 'Viewport',
    browser: 'Browser',
    browserEngine: 'Browser engine',
    randomSeed: 'Random seed',
  };
  return labels[key] ?? humanize(key);
}

export function formatConditionValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'boolean') {
    if (key === 'duplicateSubmissionBug') return value ? 'Enabled' : 'Disabled';
    if (key === 'doubleSubmit') return value ? 'Enabled' : 'Disabled';
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number' && key.toLowerCase().endsWith('ms')) return `${value.toLocaleString()} ms`;
  if (typeof value === 'string') return humanize(value);
  return formatValue(value);
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

export function worldOriginLabel(origin: WorldOrigin): string {
  const labels: Record<WorldOrigin, string> = {
    INITIAL: 'Initial exploration',
    ADAPTIVE_REPRODUCTION: 'Adaptive reproduction',
    MINIMISATION: 'Failure minimisation',
    UNKNOWN: 'Unknown',
  };
  return labels[origin];
}

export function purposeLabel(value: string): string {
  const labels: Record<string, string> = {
    HEALTHY_BASELINE: 'Healthy baseline',
    EXACT_REPRODUCTION: 'Exact reproduction',
    BUG_FLAG_CONTROL: 'Bug-disabled control',
    CONTROL_BUG_DISABLED: 'Bug-disabled control',
    INTERACTION_CONTROL: 'Single-submit control',
    CONTROL_DOUBLE_SUBMIT_DISABLED: 'Single-submit control',
    DELAY_COMPARISON: 'Delay comparison',
    LOW_DELAY_COMPARISON: 'Lower-delay comparison',
    REMOVE_BUG_FLAG: 'Remove bug mode',
    REMOVE_DOUBLE_SUBMIT: 'Remove repeated submission',
    REMOVE_VIEWPORT: 'Normalise viewport',
    REMOVE_NETWORK_PROFILE: 'Normalise network profile',
    NORMALISE_USER_PROFILE: 'Normalise user profile',
    NORMALISE_VIEWPORT: 'Normalise viewport',
    NORMALISE_NETWORK_PROFILE: 'Normalise network profile',
    DELAY_BOUNDARY_SEARCH: 'Delay boundary search',
    TEST_PAYMENT_DELAY: 'Delay boundary search',
    CONFIRM_MINIMAL_SET: 'Confirm minimal tested set',
  };
  return labels[value.toUpperCase()] ?? humanize(value);
}

export function worldPurpose(world: Pick<InvestigationWorld, 'configuration' | 'reason'>): string {
  const config = object(world.configuration);
  const adaptive = object(config.adaptive);
  const minimisation = object(config.minimisation);
  const purpose = minimisation.purpose ?? minimisation.variable ?? adaptive.purpose ?? config.purpose;
  return typeof purpose === 'string' && purpose.trim() ? purposeLabel(purpose) : world.reason;
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
  const value = paymentDelayMs(world);
  return typeof value === 'number' ? `${value.toLocaleString()} ms` : 'Not recorded';
}

export function paymentDelayMs(world: Pick<InvestigationWorld, 'configuration'>): number | undefined {
  return finiteNumber(configValue(world, 'paymentDelayMs'));
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
  if (experiment.status === 'CANCELLED') return 'INCONCLUSIVE';
  return humanize(experiment.status);
}

export function filterWorld(world: InvestigationWorld, filter: WorldFilter, experiments: InvestigationExperiment[]): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'PASSED') return worldResult(world, experiments) === 'PASS';
  if (filter === 'FAILED') return worldResult(world, experiments) === 'FAIL';
  if (filter === 'RUNNING') return world.status === 'RUNNING';
  if (filter === 'INCONCLUSIVE') return !['PASS', 'FAIL'].includes(worldResult(world, experiments));
  return worldOrigin(world) === filter;
}

export function completedWorlds(progress: InvestigationProgress['progress']): number {
  return progress.passed + progress.failed + progress.flaky;
}

export function progressPercentage(progress: InvestigationProgress['progress']): number {
  return progress.totalWorlds === 0 ? 0 : Math.min(100, Math.round((completedWorlds(progress) / progress.totalWorlds) * 100));
}

export function progressCopy(progress: InvestigationProgress['progress']): string {
  const completed = completedWorlds(progress);
  if (progress.running || progress.queued) {
    return `${completed.toLocaleString()} completed · ${progress.running.toLocaleString()} running · ${progress.queued.toLocaleString()} queued`;
  }
  return `${completed.toLocaleString()} of ${progress.totalWorlds.toLocaleString()} worlds completed`;
}

export function terminalSummary(progress: InvestigationProgress, findings: Finding[]): string {
  const status = String(progress.status);
  if (status === 'FAILED') return 'Investigation stopped before completion.';
  if (status === 'CANCELLED') return 'Investigation was cancelled before completion.';
  if (status !== 'COMPLETED') return progressCopy(progress.progress);
  if (!findings.length) return 'Investigation complete. All evaluated business invariants held in the tested worlds.';
  const reproductionCount = findings.reduce((sum, finding) => sum + finding.reproductionCount, 0);
  const critical = findings.filter((finding) => finding.severity === 'CRITICAL' || finding.severity === 'HIGH').length;
  return [
    'Investigation complete',
    `${completedWorlds(progress.progress).toLocaleString()} worlds executed`,
    `${critical || findings.length} ${critical ? 'critical ' : ''}finding${(critical || findings.length) === 1 ? '' : 's'}`,
    reproductionCount ? `${reproductionCount.toLocaleString()} validated reproductions` : 'Reproduction evidence recorded',
    'Minimal tested trigger identified',
    'Final report generated',
  ].join(' · ');
}

export type RuntimeWorldRow = {
  world: InvestigationWorld;
  experiment?: InvestigationExperiment | undefined;
  worker?: InvestigationWorker | undefined;
  origin: WorldOrigin;
  originLabel: string;
  purpose: string;
  browser: string;
  viewport: string;
  network: string;
  paymentDelayMs?: number | undefined;
  paymentDelay: string;
  repeatedSubmission: string;
  bugMode: string;
  status: string;
  result: string;
  workerId?: string | undefined;
  attempts: number;
  evidenceCount: number;
};

export function worldRows(
  worlds: InvestigationWorld[],
  experiments: InvestigationExperiment[],
  workers: InvestigationWorker[],
  evidence: EvidenceArtifactResponse[],
): RuntimeWorldRow[] {
  return worlds.map((world) => {
    const experiment = experimentForWorld(world, experiments);
    const worker = workers.find((item) => item.id === world.workerId || item.attempts.some((attempt) => attempt.experiment.worldId === world.id));
    const origin = worldOrigin(world);
    const delay = paymentDelayMs(world);
    return {
      world,
      ...(experiment ? { experiment } : {}),
      ...(worker ? { worker } : {}),
      origin,
      originLabel: worldOriginLabel(origin),
      purpose: worldPurpose(world),
      browser: worldBrowser(world),
      viewport: worldViewport(world),
      network: formatConditionValue('networkProfile', configValue(world, 'networkProfile')),
      paymentDelayMs: delay,
      paymentDelay: paymentDelay(world),
      repeatedSubmission: repeatedSubmit(world),
      bugMode: bugMode(world),
      status: humanize(world.status),
      result: worldResult(world, experiments),
      workerId: worker?.id ?? world.workerId,
      attempts: experiment?.attemptCount ?? worker?.attempts.length ?? 0,
      evidenceCount: evidenceForExperiment(experiment?.id ?? world.experimentId, evidence).length,
    };
  });
}

export function filterWorldRows(rows: RuntimeWorldRow[], filter: WorldFilter, search: string): RuntimeWorldRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    const filterMatch =
      filter === 'ALL'
        ? true
        : filter === 'PASSED'
          ? row.result === 'PASS'
          : filter === 'FAILED'
            ? row.result === 'FAIL'
            : filter === 'RUNNING'
              ? row.world.status === 'RUNNING'
              : filter === 'INCONCLUSIVE'
                ? !['PASS', 'FAIL'].includes(row.result)
                : row.origin === filter;
    if (!filterMatch) return false;
    if (!needle) return true;
    return [
      row.world.id,
      row.world.name,
      row.world.reason,
      row.purpose,
      row.browser,
      row.viewport,
      row.network,
      row.workerId,
    ].filter(Boolean).join(' ').toLowerCase().includes(needle);
  });
}

export function sortWorldRows(rows: RuntimeWorldRow[], sort: WorldSort): RuntimeWorldRow[] {
  const stageRank: Record<WorldOrigin, number> = { INITIAL: 0, ADAPTIVE_REPRODUCTION: 1, MINIMISATION: 2, UNKNOWN: 3 };
  return [...rows].sort((a, b) => {
    if (sort === 'STAGE') return stageRank[a.origin] - stageRank[b.origin] || a.world.createdAt.localeCompare(b.world.createdAt);
    if (sort === 'STATUS') return a.result.localeCompare(b.result) || a.world.createdAt.localeCompare(b.world.createdAt);
    if (sort === 'PAYMENT_DELAY') return (a.paymentDelayMs ?? Number.POSITIVE_INFINITY) - (b.paymentDelayMs ?? Number.POSITIVE_INFINITY) || a.world.createdAt.localeCompare(b.world.createdAt);
    return a.world.createdAt.localeCompare(b.world.createdAt);
  });
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

export type WorkerViewModel = {
  worker: InvestigationWorker;
  worldId?: string | undefined;
  state: string;
  finalOutcome: string;
  attempts: Array<{
    id: string;
    number: number;
    status: string;
    duration: string;
    exitCode?: number | undefined;
    infrastructureFailure: boolean;
  }>;
  active: boolean;
  retrying: boolean;
  cleanupLabel: string;
};

export function workerState(status: string): string {
  const normalized = status.toUpperCase();
  if (['QUEUED', 'PENDING'].includes(normalized)) return 'Queued';
  if (['PROVISIONING', 'STARTING'].includes(normalized)) return 'Provisioning';
  if (['RUNNING'].includes(normalized)) return 'Running';
  if (['COLLECTING_EVIDENCE', 'DOWNLOADING_ARTIFACTS'].includes(normalized)) return 'Collecting evidence';
  if (['COMPLETED', 'PASSED', 'INVARIANT_VIOLATION'].includes(normalized)) return 'Completed';
  if (['RETRYING'].includes(normalized)) return 'Retrying';
  if (['CANCELLED'].includes(normalized)) return 'Cancelled';
  if (['FAILED', 'ERROR'].includes(normalized)) return 'Failed';
  return humanize(status);
}

export function workerViewModels(workers: InvestigationWorker[], experiments: InvestigationExperiment[]): WorkerViewModel[] {
  return workers.map((worker) => {
    const attempts = worker.attempts.map((attempt, index) => ({
      id: attempt.id,
      number: index + 1,
      status: humanize(attempt.status),
      duration: formatDuration(attempt.durationMs),
      ...(attempt.exitCode !== null && attempt.exitCode !== undefined ? { exitCode: attempt.exitCode } : {}),
      infrastructureFailure: attempt.status === 'ERROR' || (attempt.exitCode !== null && attempt.exitCode !== undefined && attempt.exitCode !== 0 && attempt.status !== 'FAILED'),
    }));
    const worldId = worker.attempts[0]?.experiment.worldId;
    const experiment = experiments.find((item) => item.worldId === worldId);
    const active = ['QUEUED', 'PROVISIONING', 'RUNNING', 'RETRYING'].includes(worker.status);
    return {
      worker,
      ...(worldId ? { worldId } : {}),
      state: workerState(worker.status),
      finalOutcome: experiment?.status ? humanize(experiment.status) : workerState(worker.status),
      attempts,
      active,
      retrying: attempts.length > 1 || worker.status === 'RETRYING',
      cleanupLabel: 'No cleanup warning was reported',
    };
  }).sort((a, b) => Number(b.active) - Number(a.active) || a.worker.createdAt.localeCompare(b.worker.createdAt));
}

export type RuntimeMatrixCell = {
  row: 'Single submit' | 'Double submit';
  delayMs: number;
  outcome: 'PASS' | 'FAIL' | 'RUNNING' | 'INCONCLUSIVE' | 'MIXED' | 'NOT_TESTED';
  worlds: RuntimeWorldRow[];
  summary: string;
};

export type RuntimeMatrix = {
  cohortLabel: string;
  columns: number[];
  cells: RuntimeMatrixCell[];
  excludedWorldCount: number;
};

function matrixOutcome(rows: RuntimeWorldRow[]): RuntimeMatrixCell['outcome'] {
  if (!rows.length) return 'NOT_TESTED';
  const outcomes = new Set(rows.map((row) => row.result === 'PASS' || row.result === 'FAIL' ? row.result : row.world.status === 'RUNNING' ? 'RUNNING' : 'INCONCLUSIVE'));
  if (outcomes.size > 1) return 'MIXED';
  return [...outcomes][0] as RuntimeMatrixCell['outcome'];
}

export function runtimeMatrix(rows: RuntimeWorldRow[]): RuntimeMatrix | null {
  const comparable = rows.filter((row) => row.paymentDelayMs !== undefined && row.browser !== 'Not recorded' && row.viewport !== 'Not recorded');
  if (!comparable.length) return null;
  const cohortCounts = new Map<string, number>();
  for (const row of comparable) {
    const key = `${row.browser} · ${row.viewport} · ${row.network}`;
    cohortCounts.set(key, (cohortCounts.get(key) ?? 0) + 1);
  }
  const cohortLabel = [...cohortCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (!cohortLabel) return null;
  const cohort = comparable.filter((row) => `${row.browser} · ${row.viewport} · ${row.network}` === cohortLabel);
  const columns = [...new Set(cohort.map((row) => row.paymentDelayMs).filter((value): value is number => value !== undefined))].sort((a, b) => a - b);
  const cells: RuntimeMatrixCell[] = [];
  for (const rowLabel of ['Single submit', 'Double submit'] as const) {
    for (const delayMs of columns) {
      const worlds = cohort.filter((row) => row.paymentDelayMs === delayMs && (row.repeatedSubmission === 'Yes') === (rowLabel === 'Double submit'));
      const pass = worlds.filter((row) => row.result === 'PASS').length;
      const fail = worlds.filter((row) => row.result === 'FAIL').length;
      const outcome = matrixOutcome(worlds);
      cells.push({
        row: rowLabel,
        delayMs,
        outcome,
        worlds,
        summary: worlds.length ? `${pass} pass · ${fail} fail${worlds.length > pass + fail ? ` · ${worlds.length - pass - fail} other` : ''}` : 'Not tested',
      });
    }
  }
  return { cohortLabel, columns, cells, excludedWorldCount: comparable.length - cohort.length };
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

export type EventImportance = 'IMPORTANT' | 'NORMAL' | 'TECHNICAL';
export type EventGroup = 'Planning' | 'World generation' | 'Fleet and sandbox' | 'Execution' | 'Finding discovery' | 'Adaptive reproduction' | 'Minimisation' | 'Final report' | 'System';

export function eventGroup(type: string): EventGroup {
  if (type.includes('planner') || type.includes('plan_accepted') || type === 'plan_created') return 'Planning';
  if (type.includes('world') || type.includes('candidate_generated')) return 'World generation';
  if (type.includes('sandbox') || type.includes('fleet') || type.includes('cleanup')) return 'Fleet and sandbox';
  if (type.includes('worker') || type.includes('experiment') || type.includes('evidence') || type.includes('invariant')) return 'Execution';
  if (type.includes('finding')) return 'Finding discovery';
  if (type.includes('adaptive') || type.includes('reproduction')) return 'Adaptive reproduction';
  if (type.includes('minimisation') || type.includes('minimal')) return 'Minimisation';
  if (type.includes('final_report')) return 'Final report';
  return 'System';
}

export function eventImportance(type: string, metadata: Record<string, unknown> = {}): EventImportance {
  const important = new Set([
    'finding_created',
    'finding_confirmed',
    'exact_reproduction_succeeded',
    'adaptive_plan_created',
    'minimisation_condition_removed',
    'minimisation_condition_retained',
    'minimal_reproduction_found',
    'final_report_completed',
    'investigation_failed',
    'worker_failed',
  ]);
  if (important.has(type) || metadata.cleanupOutcome === 'FAILED' || metadata.phase === 'sandbox_cleanup_failed') return 'IMPORTANT';
  if (type.includes('sandbox') || type.includes('evidence_captured') || type.includes('artifact')) return 'TECHNICAL';
  return 'NORMAL';
}

export function eventMetadataSummary(event: InvestigationEvent): string[] {
  const metadata = object(event.metadata);
  const safeKeys = ['provider', 'workerStatus', 'attemptNumber', 'durationMs', 'phase', 'purpose', 'variable', 'result', 'conditionDecision', 'previousConfidence', 'finalConfidence', 'finalReportEvidenceId', 'worldId', 'findingId', 'minimisationRunId'];
  return safeKeys.flatMap((key) => key in metadata ? [`${humanize(key)}: ${formatValue(metadata[key])}`] : []);
}

export function safeEventMetadata(event: InvestigationEvent): Record<string, string> {
  const metadata = object(event.metadata);
  const safeKeys = ['provider', 'workerStatus', 'attemptNumber', 'durationMs', 'phase', 'purpose', 'variable', 'result', 'conditionDecision', 'previousConfidence', 'finalConfidence', 'finalReportEvidenceId', 'worldId', 'findingId', 'minimisationRunId', 'reportId'];
  return Object.fromEntries(
    safeKeys.flatMap((key) => {
      if (!(key in metadata)) return [];
      const value = formatValue(metadata[key]);
      if (value.includes('/Users/') || /[A-Za-z]:[\\/]/.test(value) || /authorization|cookie|token|password|secret/i.test(`${key} ${value}`)) return [];
      return [[humanize(key), value]];
    }),
  );
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

export type EvidenceStageGroup =
  | 'Final reports'
  | 'Original observation'
  | 'Exact reproduction'
  | 'Controlled comparisons'
  | 'Minimisation trials'
  | 'Final confirmation'
  | 'Other';

export function evidenceFilename(artifact: EvidenceArtifactResponse): string {
  const metadata = object(artifact.metadata);
  const filename = metadata.filename;
  if (typeof filename === 'string' && filename.trim()) return filename;
  const parts = artifact.path.split('/').filter(Boolean);
  return parts.at(-1) ?? artifact.id;
}

export function artifactWorldId(artifact: EvidenceArtifactResponse, experiments: InvestigationExperiment[] = []): string | undefined {
  const metadata = object(artifact.metadata);
  if (typeof metadata.worldId === 'string') return metadata.worldId;
  return experiments.find((experiment) => experiment.id === artifact.experimentId)?.worldId;
}

export function evidenceStageGroups(
  evidence: EvidenceArtifactResponse[],
  options: {
    finding?: Finding | FindingDetail | undefined;
    worlds?: InvestigationWorld[] | undefined;
    experiments?: InvestigationExperiment[] | undefined;
  } = {},
): Record<EvidenceStageGroup, EvidenceArtifactResponse[]> {
  const groups: Record<EvidenceStageGroup, EvidenceArtifactResponse[]> = {
    'Final reports': [],
    'Original observation': [],
    'Exact reproduction': [],
    'Controlled comparisons': [],
    'Minimisation trials': [],
    'Final confirmation': [],
    Other: [],
  };
  const worlds = options.worlds ?? [];
  const experiments = options.experiments ?? [];
  const conditions = options.finding ? causalConditions(options.finding) : {};
  const sourceWorldId = typeof conditions.sourceWorldId === 'string' ? conditions.sourceWorldId : typeof conditions.worldId === 'string' ? conditions.worldId : undefined;

  for (const artifact of evidence) {
    if (artifact.type === 'FINAL_REPORT') {
      groups['Final reports'].push(artifact);
      continue;
    }
    const worldId = artifactWorldId(artifact, experiments);
    const world = worlds.find((item) => item.id === worldId);
    const config = object(world?.configuration);
    const adaptive = object(config.adaptive);
    const minimisation = object(config.minimisation);
    const purpose = String(minimisation.purpose ?? adaptive.purpose ?? config.purpose ?? '').toUpperCase();

    if (worldId && worldId === sourceWorldId) groups['Original observation'].push(artifact);
    else if (purpose.includes('EXACT_REPRODUCTION')) groups['Exact reproduction'].push(artifact);
    else if (purpose.includes('CONTROL')) groups['Controlled comparisons'].push(artifact);
    else if (purpose.includes('CONFIRM_MINIMAL') || purpose.includes('FINAL_CONFIRMATION')) groups['Final confirmation'].push(artifact);
    else if (world && worldOrigin(world) === 'MINIMISATION') groups['Minimisation trials'].push(artifact);
    else groups.Other.push(artifact);
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
  const minimal = object(conditions.minimalTestedConditions);
  return object(conditions[key] ?? minimal[key] ?? nested[key]);
}

export function boundedRange(finding: Finding | FindingDetail): Record<string, unknown> {
  const conditions = causalConditions(finding);
  const nested = object(conditions.minimisation);
  const minimal = object(conditions.minimalTestedConditions);
  return object(conditions.boundedRange ?? conditions.finalBoundedRange ?? conditions.timingRange ?? minimal.boundedRange ?? minimal.timingRange ?? nested.boundedRange ?? nested.finalBoundedRange);
}

export type FailureBoundaryPoint = {
  valueMs: number;
  outcome: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  worldId?: string | undefined;
};

export type FailureBoundaryViewModel = {
  passingBoundMs?: number | undefined;
  failingBoundMs?: number | undefined;
  testedPoints: FailureBoundaryPoint[];
  targetPrecisionMs?: number | undefined;
};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function failureBoundaryViewModel(finding: Finding | FindingDetail): FailureBoundaryViewModel {
  const range = boundedRange(finding);
  const passingBoundMs = finiteNumber(range.knownPassingDelayMs ?? range.lowerPassingBoundMs ?? range.passingBoundMs);
  const failingBoundMs = finiteNumber(range.knownFailingDelayMs ?? range.upperFailingBoundMs ?? range.failingBoundMs);
  const targetPrecisionMs = finiteNumber(range.targetPrecisionMs);
  const rawPoints = Array.isArray(range.testedPoints) ? range.testedPoints : Array.isArray(range.testedPointsMs) ? range.testedPointsMs : [];
  const pointMap = new Map<string, FailureBoundaryPoint>();

  for (const point of rawPoints) {
    let valueMs: number | undefined;
    let outcome: FailureBoundaryPoint['outcome'] | undefined;
    let worldId: string | undefined;
    if (typeof point === 'number') {
      valueMs = point;
    } else if (point && typeof point === 'object' && !Array.isArray(point)) {
      const record = point as Record<string, unknown>;
      valueMs = finiteNumber(record.valueMs ?? record.delayMs ?? record.paymentDelayMs);
      const rawOutcome = typeof record.outcome === 'string' ? record.outcome.toUpperCase() : undefined;
      outcome = rawOutcome === 'PASS' || rawOutcome === 'FAIL' || rawOutcome === 'INCONCLUSIVE' ? rawOutcome : undefined;
      worldId = typeof record.worldId === 'string' ? record.worldId : undefined;
    }
    if (valueMs === undefined) continue;
    const inferred = outcome ?? (passingBoundMs !== undefined && valueMs <= passingBoundMs ? 'PASS' : failingBoundMs !== undefined && valueMs >= failingBoundMs ? 'FAIL' : 'INCONCLUSIVE');
    pointMap.set(`${valueMs}-${inferred}-${worldId ?? ''}`, worldId ? { valueMs, outcome: inferred, worldId } : { valueMs, outcome: inferred });
  }

  return Object.fromEntries(
    Object.entries({
      passingBoundMs,
      failingBoundMs,
      targetPrecisionMs,
      testedPoints: [...pointMap.values()].sort((a, b) => a.valueMs - b.valueMs || a.outcome.localeCompare(b.outcome)),
    }).filter(([, value]) => value !== undefined),
  ) as FailureBoundaryViewModel;
}

export function failureBoundaryFromWorlds(worlds: InvestigationWorld[], experiments: InvestigationExperiment[]): FailureBoundaryViewModel {
  const points = worlds
    .filter((world) => worldOrigin(world) === 'MINIMISATION')
    .filter((world) => {
      const config = object(world.configuration);
      const minimisation = object(config.minimisation);
      const variable = typeof minimisation.variable === 'string' ? minimisation.variable : typeof minimisation.variableName === 'string' ? minimisation.variableName : undefined;
      const purpose = typeof minimisation.purpose === 'string' ? minimisation.purpose.toUpperCase() : '';
      return variable === 'paymentDelayMs' || purpose.includes('DELAY');
    })
    .map((world): FailureBoundaryPoint | null => {
      const delay = finiteNumber(configValue(world, 'paymentDelayMs'));
      if (delay === undefined) return null;
      const result = worldResult(world, experiments);
      const outcome: FailureBoundaryPoint['outcome'] = result === 'PASS' ? 'PASS' : result === 'FAIL' ? 'FAIL' : 'INCONCLUSIVE';
      return { valueMs: delay, outcome, worldId: world.id };
    })
    .filter((point): point is FailureBoundaryPoint => point !== null)
    .sort((a, b) => a.valueMs - b.valueMs || a.outcome.localeCompare(b.outcome));
  const passingValues = points.filter((point) => point.outcome === 'PASS').map((point) => point.valueMs);
  const failingValues = points.filter((point) => point.outcome === 'FAIL').map((point) => point.valueMs);
  const passingBoundMs = passingValues.length ? Math.max(...passingValues) : undefined;
  const failingBoundMs = failingValues.length ? Math.min(...failingValues) : undefined;
  return Object.fromEntries(
    Object.entries({ passingBoundMs, failingBoundMs, testedPoints: points }).filter(([, value]) => value !== undefined),
  ) as FailureBoundaryViewModel;
}

export function reproductionSteps(finding: Finding | FindingDetail): string[] {
  const conditions = causalConditions(finding);
  const value = conditions.reproductionSteps ?? conditions.finalReproductionSteps;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function findingText(finding: Finding | FindingDetail, key: string): string | null {
  const value = causalConditions(finding)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function findingTextOrList(finding: Finding | FindingDetail, key: string): string | null {
  const value = causalConditions(finding)[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return items.length ? items.join(' ') : null;
  }
  return null;
}

export function findingList(finding: Finding | FindingDetail, key: string): string[] {
  const value = causalConditions(finding)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export function causalStatus(finding: Finding | FindingDetail): string {
  const status = causalConditions(finding).causalStatus ?? causalConditions(finding).status;
  return typeof status === 'string' ? status : 'SUPPORTED';
}

export function finalReportIds(finding: Finding | FindingDetail): string[] {
  const conditions = causalConditions(finding);
  return [conditions.finalReportEvidenceId, conditions.finalReportMarkdownEvidenceId].filter((value): value is string => typeof value === 'string');
}

export type ExperimentHistoryRow = {
  id: string;
  worldId: string;
  name: string;
  stage: string;
  purpose: string;
  status: string;
  outcome: string;
  paymentDelay: string;
  repeatedSubmit: string;
  bugMode: string;
  evidenceCount: number;
  createdAt: string;
};

export function experimentHistoryRows(
  worlds: InvestigationWorld[],
  experiments: InvestigationExperiment[],
  evidence: EvidenceArtifactResponse[],
): ExperimentHistoryRow[] {
  return worlds.map((world) => {
    const experiment = experimentForWorld(world, experiments);
    const evidenceCount = evidenceForExperiment(experiment?.id ?? world.experimentId, evidence).length;
    return {
      id: experiment?.id ?? world.experimentId ?? world.id,
      worldId: world.id,
      name: world.name || shortId(world.id),
      stage: worldOrigin(world),
      purpose: worldPurpose(world),
      status: world.status,
      outcome: worldResult(world, experiments),
      paymentDelay: paymentDelay(world),
      repeatedSubmit: repeatedSubmit(world),
      bugMode: bugMode(world),
      evidenceCount,
      createdAt: world.createdAt,
    };
  });
}
