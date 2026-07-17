import type { Finding, InvestigationEvent, InvestigationProgress } from '@taskos/shared-types';
import { type ReactNode, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { EvidenceArtifactResponse, EvidenceTextContentResponse, ExperimentPlanResponse, FindingDetail, InvestigationExperiment, InvestigationWorker, InvestigationWorld } from '../../services/api/index.js';
import { InvestigationApiError } from '../../services/api/index.js';
import { useEvidenceTextContent } from './use-runtime-queries.js';
import {
  causalConditions,
  causalStatus,
  completedWorlds,
  conditionRecord,
  eventGroup,
  eventImportance,
  eventLabel,
  eventMetadataSummary,
  evidenceFilename,
  evidenceStageGroups,
  experimentHistoryRows,
  fallbackReason,
  finalReportIds,
  filterWorldRows,
  findingList,
  findingText,
  findingTextOrList,
  failureBoundaryFromWorlds,
  failureBoundaryViewModel,
  formatDate,
  formatConditionKey,
  formatConditionValue,
  formatValue,
  humanize,
  phaseTracker,
  phaseLabel,
  plannerList,
  progressCopy,
  progressPercentage,
  providerFromPlan,
  reproductionSteps,
  runtimeMatrix,
  safeEventMetadata,
  shortId,
  sortWorldRows,
  terminalSummary,
  workerViewModels,
  worldOriginLabel,
  worldRows,
  type FailureBoundaryViewModel,
  type RuntimeWorldRow,
  type WorldFilter,
  type WorldSort,
} from './runtime-normalizers.js';

export function StatusBadge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'cyan' | 'green' | 'red' | 'amber' | 'slate' }) {
  const classes = {
    cyan: 'border-cyan/40 bg-cyan/10 text-cyan',
    green: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
    red: 'border-red-300/40 bg-red-300/10 text-red-200',
    amber: 'border-amber-300/40 bg-amber-300/10 text-amber-100',
    slate: 'border-slate-700 bg-slate-900 text-slate-300',
  };
  return <span className={`rounded-full border px-2 py-1 text-xs font-bold ${classes[tone]}`}>{children}</span>;
}

export function PanelState({ title, children, retry }: { title: string; children: string; retry?: () => void }) {
  return (
    <section className="card" role="status">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{children}</p>
      {retry ? (
        <button className="mt-4 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200" onClick={retry} type="button">
          Retry
        </button>
      ) : null}
    </section>
  );
}

export function RuntimeNav({ investigationId }: { investigationId: string }) {
  const items = [
    { to: `/investigations/${investigationId}`, label: 'Overview' },
    { to: `/investigations/${investigationId}/plan`, label: 'Plan' },
    { to: `/investigations/${investigationId}/worlds`, label: 'Worlds' },
    { to: `/investigations/${investigationId}/findings`, label: 'Findings' },
  ];
  return (
    <nav aria-label="Investigation sections" className="mb-6 flex flex-wrap gap-2">
      {items.map((item) => (
        <NavLink
          className={({ isActive }) => `rounded-full px-3 py-2 text-sm ${isActive ? 'bg-cyan text-ink' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
          end={item.label === 'Overview'}
          key={item.to}
          to={item.to}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function InvestigationOverviewHeader({ progress, plan, workerProvider }: { progress: InvestigationProgress; plan: ExperimentPlanResponse | null | undefined; workerProvider: string | undefined }) {
  const percentage = progressPercentage(progress.progress);
  const provider = providerFromPlan(plan);
  const steps = phaseTracker(progress.status, progress.findingsCount);
  return (
    <section className="card mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={progress.status === 'COMPLETED' ? 'green' : progress.status === 'FAILED' ? 'red' : 'cyan'}>{phaseLabel(progress.status)}</StatusBadge>
            <StatusBadge>{progress.status}</StatusBadge>
          </div>
          <h2 className="mt-4 text-2xl font-black">Investigation {shortId(progress.id, 12)}</h2>
          <p className="mt-2 text-sm text-slate-400">
            Planner: {humanize(provider.effective)} · Worker: {workerProvider ?? 'Not recorded'} · Findings: {progress.findingsCount.toLocaleString()} · Worlds: {progress.progress.totalWorlds.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">Raw status: {progress.status}</p>
        </div>
        <div className="min-w-48 text-right">
          <div className="text-3xl font-black text-cyan">{percentage}%</div>
          <div className="text-sm text-slate-400">{progressCopy(progress.progress)}</div>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800" aria-label={`${percentage}% complete`}>
        <div className="h-full bg-cyan" style={{ width: `${percentage}%` }} />
      </div>
      <PhaseTracker steps={steps} />
    </section>
  );
}

export function PhaseTracker({ steps }: { steps: ReturnType<typeof phaseTracker> }) {
  const tone = (state: string) => state === 'completed' ? 'green' : state === 'active' ? 'cyan' : state === 'stopped' ? 'red' : state === 'skipped' ? 'amber' : 'slate';
  return (
    <ol className="mt-5 grid gap-2 md:grid-cols-5" aria-label="Investigation phase tracker">
      {steps.map((step, index) => (
        <li className="rounded-xl border border-slate-800 bg-slate-950 p-3" key={step.id}>
          <div className="text-xs text-slate-500">Step {index + 1}</div>
          <div className="mt-1 font-bold">{step.label}</div>
          <div className="mt-2"><StatusBadge tone={tone(step.state)}>{humanize(step.state)}</StatusBadge></div>
        </li>
      ))}
    </ol>
  );
}

export function ProgressSummary({ progress }: { progress: InvestigationProgress }) {
  const rows = [
    ['Total worlds', progress.progress.totalWorlds],
    ['Completed', completedWorlds(progress.progress)],
    ['Queued', progress.progress.queued],
    ['Running', progress.progress.running],
    ['Passed', progress.progress.passed],
    ['Failed', progress.progress.failed],
    ['Findings', progress.findingsCount],
  ] as const;
  return (
    <section className="card">
      <h2 className="font-bold">Runtime progress</h2>
      <p className="mt-2 text-sm text-slate-400">{progressCopy(progress.progress)}. Attempts are tracked separately from worlds.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {rows.map(([label, value]) => (
          <div className="rounded-xl bg-slate-950 p-3" key={label}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-bold">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CompletedRunSummary({ progress, findings }: { progress: InvestigationProgress; findings: Finding[] }) {
  if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(progress.status)) return null;
  return (
    <section className="card border-cyan/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">{progress.status === 'COMPLETED' ? 'Completed run summary' : 'Terminal run summary'}</h2>
        <StatusBadge tone={progress.status === 'COMPLETED' ? 'green' : progress.status === 'FAILED' ? 'red' : 'amber'}>{humanize(progress.status)}</StatusBadge>
      </div>
      <p className="mt-3 text-sm text-slate-300">{terminalSummary(progress, findings)}</p>
    </section>
  );
}

export function ExperimentPlanPanel({ plan }: { plan: ExperimentPlanResponse | null }) {
  if (!plan) return <PanelState title="Experiment plan">No experiment plan has been recorded yet.</PanelState>;
  const provider = providerFromPlan(plan);
  const assumptions = plannerList(plan, 'assumptions');
  const warnings = plannerList(plan, 'warnings');
  const rejected = plannerList(plan, 'rejectedPlanItems');
  const fallback = fallbackReason(plan);
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Experiment plan</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="cyan">{humanize(provider.effective)}</StatusBadge>
          <StatusBadge>{humanize(provider.status)}</StatusBadge>
        </div>
      </div>
      <p className="mt-4 text-slate-300">{plan.objective}</p>
      <p className="mt-3 text-sm text-slate-400">{plan.planningExplanation}</p>
      {fallback ? <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{fallback}</p> : null}
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Metric label="Proposed worlds" value={plan.maximumWorldCount} />
        <Metric label="Accepted worlds" value={plan.worlds.length} />
        <Metric label="Rejected worlds" value={rejected.length} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ListBlock title="Variables" items={plan.selectedVariables} empty="No variables recorded." />
        <ListBlock title="Warnings" items={warnings} empty="No validation warnings." />
        <ListBlock title="Assumptions" items={assumptions} empty="No assumptions recorded." />
        <ListBlock title="World reasons" items={plan.worlds.map((world) => world.reason).filter((reason): reason is string => Boolean(reason))} empty="No world reasons recorded." />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-slate-950 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold text-cyan">{value}</div></div>;
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-200">{title}</h3>
      {items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

export function WorldTable({ worlds, experiments, workers = [], evidence }: { worlds: InvestigationWorld[]; experiments: InvestigationExperiment[]; workers?: InvestigationWorker[]; evidence: EvidenceArtifactResponse[] }) {
  const filters: WorldFilter[] = ['ALL', 'INITIAL', 'ADAPTIVE_REPRODUCTION', 'MINIMISATION', 'PASSED', 'FAILED', 'RUNNING', 'INCONCLUSIVE'];
  const sorts: Array<{ value: WorldSort; label: string }> = [
    { value: 'CHRONOLOGY', label: 'Creation order' },
    { value: 'STAGE', label: 'Stage' },
    { value: 'STATUS', label: 'Status' },
    { value: 'PAYMENT_DELAY', label: 'Payment delay' },
  ];
  const [activeFilter, setActiveFilter] = useRuntimeFilter();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<WorldSort>('CHRONOLOGY');
  const [selected, setSelected] = useState<string[]>([]);
  const rows = useMemo(() => worldRows(worlds, experiments, workers, evidence), [evidence, experiments, workers, worlds]);
  const visible = useMemo(() => sortWorldRows(filterWorldRows(rows, activeFilter, search), sort), [activeFilter, rows, search, sort]);
  const selectedRows = selected.map((id) => rows.find((row) => row.world.id === id)).filter((row): row is RuntimeWorldRow => Boolean(row));
  const toggleSelection = (worldId: string) => setSelected((current) => current.includes(worldId) ? current.filter((id) => id !== worldId) : [...current.slice(-1), worldId]);
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">World exploration</h2>
          <p className="mt-2 text-sm text-slate-400">{worlds.length.toLocaleString()} worlds. Select up to two rows to compare actual runtime conditions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Search worlds" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" onChange={(event) => setSearch(event.target.value)} placeholder="Search world, purpose, browser…" value={search} />
          <select aria-label="Sort worlds" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" onChange={(event) => setSort(event.target.value as WorldSort)} value={sort}>
            {sorts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="World filters">
        {filters.map((filter) => (
          <button className={`rounded-full px-3 py-1 text-xs ${activeFilter === filter ? 'bg-cyan text-ink' : 'bg-slate-900 text-slate-300'}`} key={filter} onClick={() => setActiveFilter(filter)} role="tab" aria-selected={activeFilter === filter} type="button">
            {filter === 'ALL' ? 'All' : filter === 'INITIAL' || filter === 'ADAPTIVE_REPRODUCTION' || filter === 'MINIMISATION' ? worldOriginLabel(filter) : humanize(filter)}
          </button>
        ))}
      </div>
      {selectedRows.length ? <WorldComparison rows={selectedRows} clear={() => setSelected([])} /> : null}
      {visible.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                {['Compare', 'World', 'Origin', 'Purpose', 'Browser', 'Viewport', 'Network', 'Payment delay', 'Repeated submit', 'Bug mode', 'World status', 'Result', 'Worker', 'Attempts', 'Evidence', 'Created / completed'].map((heading) => <th className="px-3 py-2" key={heading}>{heading}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visible.map((row) => {
                const resultTone = row.result === 'PASS' ? 'green' : row.result === 'FAIL' ? 'red' : row.result === 'RUNNING' ? 'cyan' : 'slate';
                const selectedRow = selected.includes(row.world.id);
                return (
                  <tr className={selectedRow ? 'bg-cyan/5' : undefined} key={row.world.id}>
                    <td className="px-3 py-3"><button className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => toggleSelection(row.world.id)} type="button" aria-pressed={selectedRow}>{selectedRow ? 'Selected' : 'Compare'}</button></td>
                    <td className="px-3 py-3 font-mono text-xs" title={row.world.id}>{shortId(row.world.id)}</td>
                    <td className="px-3 py-3">{row.originLabel}</td>
                    <td className="px-3 py-3">{row.purpose}</td>
                    <td className="px-3 py-3">{row.browser}</td>
                    <td className="px-3 py-3">{row.viewport}</td>
                    <td className="px-3 py-3">{row.network}</td>
                    <td className="px-3 py-3">{row.paymentDelay}</td>
                    <td className="px-3 py-3">{row.repeatedSubmission}</td>
                    <td className="px-3 py-3">{row.bugMode}</td>
                    <td className="px-3 py-3">{row.status}</td>
                    <td className="px-3 py-3"><StatusBadge tone={resultTone}>{row.result}</StatusBadge></td>
                    <td className="px-3 py-3 font-mono text-xs" title={row.workerId}>{row.workerId ? shortId(row.workerId) : 'Not recorded'}</td>
                    <td className="px-3 py-3">{row.attempts}</td>
                    <td className="px-3 py-3">{row.evidenceCount}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{formatDate(row.world.createdAt)} → {formatDate(row.world.completedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-slate-500">No worlds match this filter. Worlds will appear after the experiment plan is accepted.</p>}
    </section>
  );
}

function WorldComparison({ rows, clear }: { rows: RuntimeWorldRow[]; clear: () => void }) {
  const fields: Array<[string, (row: RuntimeWorldRow) => string | number]> = [
    ['Origin', (row) => row.originLabel],
    ['Purpose', (row) => row.purpose],
    ['Browser', (row) => row.browser],
    ['Viewport', (row) => row.viewport],
    ['Network', (row) => row.network],
    ['User profile', (row) => formatConditionValue('userProfile', row.world.configuration && typeof row.world.configuration === 'object' && !Array.isArray(row.world.configuration) ? (row.world.configuration as Record<string, unknown>).userProfile : undefined)],
    ['Payment delay', (row) => row.paymentDelay],
    ['Double-submit', (row) => row.repeatedSubmission],
    ['Click interval', (row) => formatConditionValue('doubleSubmitIntervalMs', row.world.configuration && typeof row.world.configuration === 'object' && !Array.isArray(row.world.configuration) ? (row.world.configuration as Record<string, unknown>).doubleSubmitIntervalMs : undefined)],
    ['Bug mode', (row) => row.bugMode],
    ['Outcome', (row) => row.result],
    ['Failed invariants', (row) => row.result === 'FAIL' ? 'Business invariant failed' : 'None recorded'],
    ['Evidence count', (row) => row.evidenceCount],
  ];
  return (
    <div className="mt-4 rounded-xl border border-cyan/30 bg-slate-950 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3"><h3 className="font-bold">World comparison</h3><button className="text-xs font-bold text-cyan" onClick={clear} type="button">Clear selection</button></div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr><th className="py-2 pr-4">Field</th>{rows.map((row) => <th className="py-2 pr-4 font-mono text-xs" key={row.world.id}>{shortId(row.world.id, 12)}</th>)}</tr></thead>
          <tbody>
            {fields.map(([label, reader]) => {
              const values = rows.map((row) => String(reader(row)));
              const differs = new Set(values).size > 1;
              return <tr className="border-t border-slate-800" key={label}><td className="py-2 pr-4 text-slate-400">{label}</td>{values.map((value, index) => <td className={`py-2 pr-4 ${differs ? 'text-cyan' : 'text-slate-300'}`} key={`${label}-${rows[index]!.world.id}`}>{value}</td>)}</tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function useRuntimeFilter(): [WorldFilter, (filter: WorldFilter) => void] {
  return useState<WorldFilter>('ALL');
}

export function WorldMatrix({ worlds, experiments, workers = [], evidence }: { worlds: InvestigationWorld[]; experiments: InvestigationExperiment[]; workers?: InvestigationWorker[]; evidence: EvidenceArtifactResponse[] }) {
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const rows = useMemo(() => worldRows(worlds, experiments, workers, evidence), [evidence, experiments, workers, worlds]);
  const matrix = useMemo(() => runtimeMatrix(rows), [rows]);
  if (!matrix) return <PanelState title="World matrix">No comparable world cohort is available for a matrix.</PanelState>;
  const selected = selectedCell ? matrix.cells.find((cell) => `${cell.row}-${cell.delayMs}` === selectedCell) : undefined;
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">World matrix</h2>
          <p className="mt-2 text-sm text-slate-400">Cohort: {matrix.cohortLabel}. {matrix.excludedWorldCount ? `${matrix.excludedWorldCount} incompatible comparable worlds excluded.` : 'No incompatible comparable worlds were mixed.'}</p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-center text-sm" aria-label="World outcome matrix by repeated submission and payment delay">
          <thead className="text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2 text-left">Submission</th>{matrix.columns.map((delay) => <th className="px-3 py-2" key={delay}>{delay.toLocaleString()} ms</th>)}</tr>
          </thead>
          <tbody>
            {['Single submit', 'Double submit'].map((rowLabel) => (
              <tr className="border-t border-slate-800" key={rowLabel}>
                <th className="px-3 py-3 text-left">{rowLabel}</th>
                {matrix.columns.map((delay) => {
                  const cell = matrix.cells.find((item) => item.row === rowLabel && item.delayMs === delay)!;
                  const tone = cell.outcome === 'PASS' ? 'green' : cell.outcome === 'FAIL' ? 'red' : cell.outcome === 'MIXED' ? 'amber' : cell.outcome === 'RUNNING' ? 'cyan' : 'slate';
                  return (
                    <td className="px-3 py-3" key={`${rowLabel}-${delay}`}>
                      <button className="rounded-lg border border-slate-700 px-3 py-2" onClick={() => setSelectedCell(`${cell.row}-${cell.delayMs}`)} type="button">
                        <StatusBadge tone={tone}>{cell.outcome}</StatusBadge>
                        <span className="mt-1 block text-xs text-slate-500">{cell.worlds.length ? `${cell.worlds.length} world${cell.worlds.length === 1 ? '' : 's'}` : 'Not tested'}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">Text alternative: {matrix.cells.map((cell) => `${cell.row} at ${cell.delayMs} ms: ${cell.outcome} (${cell.summary})`).join('; ')}.</p>
      {selected ? (
        <div className="mt-4 rounded-xl bg-slate-950 p-3">
          <h3 className="font-bold">{selected.row} at {selected.delayMs.toLocaleString()} ms</h3>
          <p className="mt-1 text-sm text-slate-400">{selected.summary}</p>
          {selected.worlds.length ? <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">{selected.worlds.map((row) => <li key={row.world.id}>{shortId(row.world.id, 12)} · {row.purpose} · {row.result}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">This cell was not tested.</p>}
        </div>
      ) : null}
    </section>
  );
}

export function WorkerPanel({ workers, experiments = [] }: { workers: InvestigationWorker[]; experiments?: InvestigationExperiment[] }) {
  const viewModels = useMemo(() => workerViewModels(workers, experiments), [experiments, workers]);
  const active = viewModels.filter((worker) => worker.active);
  const completed = viewModels.filter((worker) => !worker.active);
  const rendered = active.length ? [...active, ...completed.slice(0, 6)] : completed.slice(0, 6);
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Workers and attempts</h2>
          <p className="mt-2 text-sm text-slate-400">{workers.length.toLocaleString()} workers. Active workers appear first; completed workers are compact.</p>
        </div>
        <StatusBadge tone={active.length ? 'cyan' : 'green'}>{active.length ? `${active.length} active` : 'No active workers'}</StatusBadge>
      </div>
      {workers.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {rendered.map((item) => (
            <details className="rounded-xl bg-slate-950 p-3" key={item.worker.id} open={item.active || item.retrying}>
              <summary className="cursor-pointer">
                <span className="font-mono text-xs" title={item.worker.id}>{shortId(item.worker.id)}</span>
                <span className="ml-2"><StatusBadge tone={item.active ? 'cyan' : item.state === 'Failed' ? 'red' : 'slate'}>{item.state}</StatusBadge></span>
                <span className="ml-2"><StatusBadge>{item.worker.provider}</StatusBadge></span>
              </summary>
              <dl className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-2">
                <div><dt>World</dt><dd className="font-mono">{item.worldId ? shortId(item.worldId, 14) : 'Not recorded'}</dd></div>
                <div><dt>Final world outcome</dt><dd>{item.finalOutcome}</dd></div>
                <div><dt>Attempts</dt><dd>{item.attempts.length}{item.retrying ? ' · retry recorded' : ''}</dd></div>
                <div><dt>Cleanup</dt><dd>{item.cleanupLabel}</dd></div>
              </dl>
              <div className="mt-3 space-y-2">
                {item.attempts.map((attempt) => (
                  <div className="rounded-lg border border-slate-800 p-2 text-xs text-slate-400" key={attempt.id}>
                    Attempt {attempt.number}: {attempt.status} · {attempt.duration}{attempt.exitCode !== undefined ? ` · exit ${attempt.exitCode}` : ''}
                    {attempt.infrastructureFailure ? <span className="ml-2 text-amber-100">Infrastructure/runtime failure, not product finding</span> : null}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-slate-500">No worker attempts have been recorded yet. Workers will appear after worlds are queued.</p>}
      {completed.length > rendered.length ? <p className="mt-3 text-xs text-slate-500">Showing first {rendered.length} workers. Use the worker API for the full operational list.</p> : null}
    </section>
  );
}

export function EventTimeline({ events }: { events: InvestigationEvent[] }) {
  const [filter, setFilter] = useState<'ALL' | 'IMPORTANT' | 'NORMAL' | 'TECHNICAL'>('ALL');
  const sorted = useMemo(() => [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [events]);
  const visible = sorted.filter((event) => filter === 'ALL' || eventImportance(event.type, event.metadata) === filter);
  const groups = visible.reduce<Record<string, InvestigationEvent[]>>((accumulator, event) => {
    const group = eventGroup(event.type);
    accumulator[group] = [...(accumulator[group] ?? []), event];
    return accumulator;
  }, {});
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Runtime event timeline</h2>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Event importance filters">
          {(['ALL', 'IMPORTANT', 'NORMAL', 'TECHNICAL'] as const).map((item) => <button className={`rounded-full px-3 py-1 text-xs ${filter === item ? 'bg-cyan text-ink' : 'bg-slate-900 text-slate-300'}`} key={item} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item} type="button">{humanize(item)}</button>)}
        </div>
      </div>
      {events.length ? (
        <div className="mt-4 space-y-5">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <h3 className="text-sm font-bold text-slate-300">{group}</h3>
              <ol className="mt-2 space-y-3">
                {items.map((event) => {
                  const importance = eventImportance(event.type, event.metadata);
                  const metadata = safeEventMetadata(event);
                  return (
                    <li className="border-l-2 border-cyan/40 pl-4" key={event.id}>
                      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{eventLabel(event.type)}</span><StatusBadge tone={importance === 'IMPORTANT' ? 'amber' : importance === 'TECHNICAL' ? 'slate' : 'cyan'}>{humanize(importance)}</StatusBadge></div>
                      <p className="mt-1 text-sm text-slate-400">{event.message}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500"><time>{formatDate(event.createdAt)}</time>{event.worldId ? <span>World {shortId(event.worldId)}</span> : null}{eventMetadataSummary(event).slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
                      {Object.keys(metadata).length ? <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer text-cyan">Technical metadata</summary><dl className="mt-2 grid gap-1 md:grid-cols-2">{Object.entries(metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="text-slate-300">{value}</dd></div>)}</dl></details> : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-slate-500">No runtime events have been recorded yet.</p>}
    </section>
  );
}

export function FindingsList({ investigationId, findings }: { investigationId: string; findings: Finding[] }) {
  return (
    <div className="space-y-4">
      {findings.length ? findings.map((finding) => {
        const retained = Object.keys(conditionRecord(finding, 'retainedConditions')).length;
        const removed = Object.keys(conditionRecord(finding, 'removedConditions')).length;
        const hasReport = finalReportIds(finding).length > 0;
        return (
          <Link className="card block hover:border-cyan/50" key={finding.id} to={`/investigations/${investigationId}/findings/${finding.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge tone={finding.severity === 'CRITICAL' || finding.severity === 'HIGH' ? 'red' : 'amber'}>{finding.severity}</StatusBadge>
              <span className="text-xs text-cyan">{finding.confidence} · {finding.reproductionCount} reproductions</span>
            </div>
            <h2 className="mt-4 text-xl font-bold">{finding.title}</h2>
            <p className="mt-2 text-slate-400">{finding.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge>{humanize(causalStatus(finding))}</StatusBadge>
              <StatusBadge>{retained} retained</StatusBadge>
              <StatusBadge>{removed} removed</StatusBadge>
              {hasReport ? <StatusBadge tone="green">Final report</StatusBadge> : <StatusBadge>No final report</StatusBadge>}
            </div>
          </Link>
        );
      }) : <PanelState title="No findings">No finding was produced. All evaluated invariants held in the tested worlds.</PanelState>}
    </div>
  );
}

export function LiveFindingSummary({ investigationId, findings, investigationStatus }: { investigationId: string; findings: Finding[]; investigationStatus: string }) {
  if (!findings.length) {
    const active = !['COMPLETED', 'FAILED', 'CANCELLED'].includes(investigationStatus);
    return <PanelState title={active ? 'No findings yet' : 'No findings'}>{active ? 'No business invariant violation has been detected yet.' : 'No business invariant violations were found.'}</PanelState>;
  }
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Discovered finding</h2>
        <Link className="text-sm font-bold text-cyan" to={`/investigations/${investigationId}/findings`}>Open all findings</Link>
      </div>
      <div className="mt-4 grid gap-3">
        {findings.slice(0, 3).map((finding) => {
          const retained = conditionRecord(finding, 'retainedConditions');
          const hasReport = finalReportIds(finding).length > 0;
          const supported = causalStatus(finding);
          const active = !['COMPLETED', 'FAILED', 'CANCELLED'].includes(investigationStatus);
          return (
            <Link className="rounded-xl border border-slate-800 bg-slate-950 p-4 hover:border-cyan/50" key={finding.id} to={`/investigations/${investigationId}/findings/${finding.id}`}>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={finding.severity === 'CRITICAL' || finding.severity === 'HIGH' ? 'red' : 'amber'}>{finding.severity}</StatusBadge>
                <StatusBadge>{active && finding.confidence !== 'CONFIRMED' ? 'Possible violation' : finding.confidence}</StatusBadge>
                <StatusBadge>{humanize(supported)}</StatusBadge>
                {hasReport ? <StatusBadge tone="green">Final report available</StatusBadge> : null}
              </div>
              <h3 className="mt-3 text-lg font-bold">{finding.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{finding.summary}</p>
              <p className="mt-3 text-sm text-slate-300">{finding.reproductionCount.toLocaleString()} validated reproductions · {Object.keys(retained).length} retained trigger conditions.</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function EvidenceSummary({ evidence }: { evidence: EvidenceArtifactResponse[] }) {
  const counts = evidence.reduce<Record<string, number>>((accumulator, artifact) => {
    accumulator[artifact.type] = (accumulator[artifact.type] ?? 0) + 1;
    return accumulator;
  }, {});
  return (
    <section className="card">
      <h2 className="font-bold">Evidence availability</h2>
      <p className="mt-2 text-sm text-slate-400">{evidence.length.toLocaleString()} artifacts are available. Report bodies are not fetched on this overview page.</p>
      {evidence.length ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => (
            <div className="rounded-xl bg-slate-950 p-3" key={type}>
              <dt className="text-xs text-slate-500">{humanize(type)}</dt>
              <dd className="mt-1 text-xl font-bold">{count}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-3 text-sm text-slate-500">Evidence will appear as workers capture browser, console, network, and final-report artifacts.</p>}
    </section>
  );
}

export function ConditionBlock({ title, conditions, empty }: { title: string; conditions: Record<string, unknown>; empty: string }) {
  const entries = Object.entries(conditions);
  return (
    <section className="card">
      <h2 className="font-bold">{title}</h2>
      {entries.length ? (
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div className="rounded-xl bg-slate-950 p-3" key={key}>
              <dt className="text-xs uppercase tracking-widest text-slate-500" title={key}>{formatConditionKey(key)}</dt>
              <dd className="mt-1 font-semibold text-slate-100">{formatConditionValue(key, value)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-3 text-sm text-slate-500">{empty}</p>}
    </section>
  );
}

export function FailureRange({ finding, boundary }: { finding: Finding | FindingDetail; boundary?: FailureBoundaryViewModel | undefined }) {
  const range = boundary ?? failureBoundaryViewModel(finding);
  const hasPassingBound = range.passingBoundMs !== undefined;
  const hasFailingBound = range.failingBoundMs !== undefined;
  return (
    <section className="card">
      <h2 className="font-bold">Observed failure boundary</h2>
      {hasPassingBound || hasFailingBound ? (
        <>
          <div className="mt-5 grid gap-2 text-center text-xs text-slate-400 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            <div className="rounded-lg bg-emerald-300/10 p-2 text-emerald-200">Observed stable</div>
            <div aria-label="Passing bound">{hasPassingBound ? `≤ ${range.passingBoundMs!.toLocaleString()} ms` : 'No passing bound'}</div>
            <div className="rounded-lg bg-amber-300/10 p-2 text-amber-100">Untested interval</div>
            <div aria-label="Failing bound">{hasFailingBound ? `≥ ${range.failingBoundMs!.toLocaleString()} ms` : 'No failing bound'}</div>
            <div className="rounded-lg bg-red-300/10 p-2 text-red-200">Failure observed</div>
          </div>
          {hasPassingBound && hasFailingBound ? (
            <p className="mt-3 text-sm text-slate-400">
              The failure boundary was narrowed to the tested interval between {range.passingBoundMs!.toLocaleString()} ms and {range.failingBoundMs!.toLocaleString()} ms.
              Values inside this interval were not fully established.
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Only one side of the boundary was recorded. This is not an exact causal threshold.</p>
          )}
          <p className="mt-2 text-sm text-slate-500">Target precision: {range.targetPrecisionMs !== undefined ? `${range.targetPrecisionMs.toLocaleString()} ms` : 'Not recorded'}.</p>
          {range.testedPoints.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tested delay points">
              {range.testedPoints.map((point) => (
                <li className={`rounded-full border px-3 py-1 text-xs ${point.outcome === 'PASS' ? 'border-emerald-300/40 text-emerald-200' : point.outcome === 'FAIL' ? 'border-red-300/40 text-red-200' : 'border-amber-300/40 text-amber-100'}`} key={`${point.valueMs}-${point.outcome}-${point.worldId ?? ''}`}>
                  {point.valueMs.toLocaleString()} ms · {humanize(point.outcome)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : <p className="mt-3 text-sm text-slate-500">A bounded timing range could not be established.</p>}
    </section>
  );
}

export function ReproductionSteps({ finding }: { finding: Finding | FindingDetail }) {
  const steps = reproductionSteps(finding);
  return (
    <section className="card">
      <h2 className="font-bold">Deterministic reproduction steps</h2>
      {steps.length ? <ol className="mt-4 list-decimal space-y-2 pl-5 text-slate-300">{steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol> : <p className="mt-3 text-sm text-slate-500">Structured reproduction steps were not generated for this finding.</p>}
    </section>
  );
}

export function EvidenceViewer({
  evidence,
  investigationId,
  finding,
  worlds = [],
  experiments = [],
}: {
  evidence: EvidenceArtifactResponse[];
  investigationId: string;
  finding?: Finding | FindingDetail | undefined;
  worlds?: InvestigationWorld[];
  experiments?: InvestigationExperiment[];
}) {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const groups = useMemo(() => evidenceStageGroups(evidence, { finding, worlds, experiments }), [evidence, experiments, finding, worlds]);
  const filters = ['ALL', 'FINAL_REPORT', 'SCREENSHOT', 'TRACE', 'CONSOLE_LOG', 'NETWORK_LOG', 'WORKER_RESULT', 'ENVIRONMENT_MANIFEST'];
  const visibleGroups = useMemo(() => Object.entries(groups).map(([label, items]) => {
    const filtered = items.filter((artifact) => {
      const matchesType = typeFilter === 'ALL' || artifact.type === typeFilter;
      const haystack = `${artifact.id} ${artifact.type} ${evidenceFilename(artifact)} ${artifact.experimentId} ${JSON.stringify(artifact.metadata ?? {})}`.toLowerCase();
      return matchesType && haystack.includes(search.toLowerCase());
    });
    return [label, filtered] as const;
  }), [groups, search, typeFilter]);
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Evidence</h2>
          <p className="mt-2 text-sm text-slate-400">{evidence.length.toLocaleString()} artifacts grouped by runtime stage. Report bodies load only when opened.</p>
        </div>
        <input
          aria-label="Search evidence"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search filename, world, type…"
          value={search}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Evidence type filters">
        {filters.map((filter) => (
          <button
            className={`rounded-full px-3 py-1 text-xs ${typeFilter === filter ? 'bg-cyan text-ink' : 'bg-slate-900 text-slate-300'}`}
            key={filter}
            onClick={() => setTypeFilter(filter)}
            role="tab"
            aria-selected={typeFilter === filter}
            type="button"
          >
            {filter === 'ALL' ? 'All' : humanize(filter)}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-4">
        {visibleGroups.map(([label, items]) => (
          <details className="rounded-xl bg-slate-950 p-3" key={label} open={label === 'Final reports' || label === 'Original observation'}>
            <summary className="cursor-pointer font-semibold">{label} ({items.length})</summary>
            {items.length ? (
              <EvidenceGroupItems items={items} investigationId={investigationId} experiments={experiments} />
            ) : <p className="mt-3 text-sm text-slate-500">No {label.toLowerCase()} evidence is available.</p>}
          </details>
        ))}
      </div>
    </section>
  );
}

function EvidenceGroupItems({ items, investigationId, experiments }: { items: EvidenceArtifactResponse[]; investigationId: string; experiments: InvestigationExperiment[] }) {
  const [limit, setLimit] = useState(8);
  const visible = items.slice(0, limit);
  return (
    <>
      <div className="mt-3 grid gap-2">
        {visible.map((artifact) => (
          <EvidenceCard artifact={artifact} investigationId={investigationId} experiments={experiments} key={artifact.id} />
        ))}
      </div>
      {items.length > visible.length ? (
        <button className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200" onClick={() => setLimit((value) => value + 8)} type="button">
          Show more evidence ({items.length - visible.length} remaining)
        </button>
      ) : null}
    </>
  );
}

function EvidenceCard({ artifact, investigationId, experiments }: { artifact: EvidenceArtifactResponse; investigationId: string; experiments: InvestigationExperiment[] }) {
  const worldId = experiments.find((experiment) => experiment.id === artifact.experimentId)?.worldId;
  const filename = evidenceFilename(artifact);
  return (
    <div className="rounded-lg border border-slate-800 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{humanize(artifact.type)}</span>
        <span className="text-xs text-slate-500">{artifact.mimeType} · {artifact.sizeBytes.toLocaleString()} bytes</span>
      </div>
      <dl className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
        <div><dt className="sr-only">Filename</dt><dd className="font-mono text-slate-400">{filename}</dd></div>
        <div><dt>World</dt><dd className="font-mono">{worldId ? shortId(worldId, 14) : 'Not recorded'}</dd></div>
        <div><dt>Created</dt><dd>{formatDate(artifact.createdAt)}</dd></div>
        {artifact.checksum ? <div><dt>Checksum</dt><dd className="font-mono">{shortId(artifact.checksum, 14)}</dd></div> : null}
      </dl>
      {artifact.type === 'FINAL_REPORT'
        ? <FinalReportPreview artifact={artifact} investigationId={investigationId} />
        : <p className="mt-2 text-xs text-slate-400">{artifact.type === 'SCREENSHOT'
          ? 'Screenshot preview is unavailable. Artifact metadata is preserved.'
          : artifact.type === 'TRACE'
            ? 'Playwright trace archive. Trace download is not currently exposed through the public API.'
            : 'Artifact body preview is unavailable in the public UI.'}</p>}
    </div>
  );
}

function FinalReportPreview({ artifact, investigationId }: { artifact: EvidenceArtifactResponse; investigationId: string }) {
  const [open, setOpen] = useState(false);
  const query = useEvidenceTextContent(investigationId, artifact.id, open);
  return (
    <div className="mt-3">
      <button
        className="rounded-lg border border-cyan/40 px-3 py-2 text-xs font-bold text-cyan"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? 'Hide report' : 'View report'}
      </button>
      {!open ? <p className="mt-2 text-xs text-slate-400">Report body is fetched only when opened.</p> : null}
      {open && query.isLoading ? <p className="mt-3 text-xs text-slate-400">Loading report content…</p> : null}
      {open && query.isError ? <ReportError error={query.error} /> : null}
      {open && query.data ? <ReportContent content={query.data} /> : null}
    </div>
  );
}

function ReportError({ error }: { error: unknown }) {
  const message = error instanceof InvestigationApiError && error.kind === 'CONTENT_TOO_LARGE'
    ? 'This final report is too large to preview safely.'
    : error instanceof InvestigationApiError && error.kind === 'UNSUPPORTED_CONTENT'
      ? 'This artifact cannot be previewed safely.'
      : 'Final report content is unavailable.';
  return <p className="mt-3 rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-xs text-red-100">{message}</p>;
}

export function ReportContent({ content }: { content: EvidenceTextContentResponse }) {
  if (content.format === 'JSON') return <JsonReport content={content.content} />;
  if (content.format === 'MARKDOWN') return <MarkdownReport content={content.content} />;
  return <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300 whitespace-pre-wrap">{content.content}</pre>;
}

function MarkdownReport({ content }: { content: string }) {
  return (
    <div className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-300">
      {content.split(/\r?\n/).map((line, index) => {
        if (line.startsWith('# ')) return <h3 className="mt-2 text-lg font-bold text-slate-100" key={`${index}-${line}`}>{line.slice(2)}</h3>;
        if (line.startsWith('## ')) return <h4 className="mt-3 font-bold text-slate-100" key={`${index}-${line}`}>{line.slice(3)}</h4>;
        if (line.startsWith('- ')) return <p className="ml-4" key={`${index}-${line}`}>• {line.slice(2)}</p>;
        return <p className={line ? 'mt-1' : 'h-3'} key={`${index}-${line}`}>{line}</p>;
      })}
    </div>
  );
}

function JsonReport({ content }: { content: string }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return <p className="mt-3 rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-xs text-red-100">Final report JSON could not be parsed safely.</p>;
  }
  const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const rows = ['reportVersion', 'summary', 'businessImpact', 'originalObservation', 'reproduction', 'minimisation', 'confidence', 'retainedConditions', 'removedConditions', 'boundedRange', 'reproductionSteps', 'evidenceReferences', 'limitations', 'provenance'];
  return (
    <div className="mt-3 rounded-lg bg-slate-950 p-4 text-sm">
      <dl className="grid gap-3">
        {rows.filter((key) => record[key] !== undefined).map((key) => (
          <div key={key}>
            <dt className="text-xs uppercase tracking-widest text-slate-500">{humanize(key)}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-slate-300">{formatValue(record[key])}</dd>
          </div>
        ))}
      </dl>
      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-bold text-cyan">Raw JSON</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-300">{JSON.stringify(parsed, null, 2)}</pre>
      </details>
    </div>
  );
}

export function FindingDetailSections({
  finding,
  investigationStatus,
  worlds = [],
  experiments = [],
  evidence,
}: {
  finding: FindingDetail;
  investigationStatus?: string | undefined;
  worlds?: InvestigationWorld[];
  experiments?: InvestigationExperiment[];
  evidence?: EvidenceArtifactResponse[];
}) {
  const retained = conditionRecord(finding, 'retainedConditions');
  const removed = conditionRecord(finding, 'removedConditions');
  const inconclusive = conditionRecord(finding, 'inconclusiveConditions');
  const allEvidence = evidence ?? finding.evidence;
  const finalReports = allEvidence.filter((artifact) => artifact.type === 'FINAL_REPORT' || finalReportIds(finding).includes(artifact.id));
  const limitations = findingList(finding, 'limitations');
  const businessImpact = findingText(finding, 'businessImpact') ?? 'Business impact was not provided for this finding.';
  const originalObservation = findingText(finding, 'originalObservation') ?? finding.summary;
  const confidenceExplanation = findingTextOrList(finding, 'confidenceExplanation');
  const reproducedRuns = finding.reproductions.filter((run) => run.reproduced).length;
  const contradictoryRuns = finding.reproductions.filter((run) => !run.reproduced).length;
  const findingBoundary = failureBoundaryViewModel(finding);
  const worldBoundary = findingBoundary.passingBoundMs === undefined || findingBoundary.failingBoundMs === undefined
    ? failureBoundaryFromWorlds(worlds, experiments)
    : undefined;
  const boundary = worldBoundary && (worldBoundary.passingBoundMs !== undefined || worldBoundary.failingBoundMs !== undefined)
    ? {
        passingBoundMs: findingBoundary.passingBoundMs ?? worldBoundary.passingBoundMs,
        failingBoundMs: findingBoundary.failingBoundMs ?? worldBoundary.failingBoundMs,
        targetPrecisionMs: findingBoundary.targetPrecisionMs ?? worldBoundary.targetPrecisionMs,
        testedPoints: worldBoundary.testedPoints.length ? worldBoundary.testedPoints : findingBoundary.testedPoints,
      }
    : findingBoundary;
  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="red">{finding.severity}</StatusBadge>
          <StatusBadge tone="green">{finding.confidence}</StatusBadge>
          <StatusBadge>{humanize(causalStatus(finding))}</StatusBadge>
          {investigationStatus ? <StatusBadge tone={investigationStatus === 'COMPLETED' ? 'green' : 'slate'}>{humanize(investigationStatus)}</StatusBadge> : null}
          {finalReports.length ? <StatusBadge tone="cyan">Final report available</StatusBadge> : null}
        </div>
        <h2 className="mt-4 text-2xl font-bold">{finding.title}</h2>
        <p className="mt-3 text-slate-300">{finding.summary}</p>
        <p className="mt-3 text-sm text-slate-400">
          {finding.reproductionCount} validated reproductions. This is a supported minimal-tested
          condition set, not an absolute claim of global minimality.
        </p>
      </section>
      <section className="card">
        <h2 className="font-bold">Executive summary</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SummaryBlock title="Business impact">{businessImpact}</SummaryBlock>
          <SummaryBlock title="Original observation">{originalObservation}</SummaryBlock>
          <SummaryBlock title="Failed invariants">{findingList(finding, 'failedInvariantIds').join(', ') || 'Not recorded'}</SummaryBlock>
          <SummaryBlock title="First observed world">{formatValue(causalConditions(finding).sourceWorldId)}</SummaryBlock>
        </div>
      </section>
      <section className="card">
        <h2 className="font-bold">Reproduction confidence</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric label="Classification" value={finding.confidence} />
          <Metric label="Validated reproductions" value={finding.reproductionCount} />
          <Metric label="Exact reproduction" value={reproducedRuns > 0 ? 'Reproduced' : 'Not recorded'} />
          <Metric label="Contradictory/control runs" value={contradictoryRuns} />
        </div>
        {confidenceExplanation ? <p className="mt-4 text-sm text-slate-400">{confidenceExplanation}</p> : null}
      </section>
      <MinimalConditionSummary finding={finding} boundary={boundary} />
      <div className="grid gap-5 lg:grid-cols-3">
        <ConditionBlock title="Retained in minimal tested set" conditions={retained} empty="No retained conditions were recorded." />
        <ConditionBlock title="Removed conditions" conditions={removed} empty="No removed conditions were recorded." />
        <ConditionBlock title="Inconclusive conditions" conditions={inconclusive} empty="No inconclusive conditions were recorded." />
      </div>
      <FailureRange finding={finding} boundary={boundary} />
      <ReproductionSteps finding={finding} />
      <ExperimentHistory worlds={worlds} experiments={experiments} evidence={allEvidence} />
      <CausalSequence finding={finding} />
      <EvidenceViewer evidence={allEvidence} investigationId={finding.investigationId} finding={finding} worlds={worlds} experiments={experiments} />
      <section className="card">
        <h2 className="font-bold">Limitations</h2>
        {limitations.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">{limitations.map((item) => <li key={item}>{item}</li>)}</ul> : (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>Minimality is based on deterministic recorded worlds, not exhaustive global search.</li>
            <li>The timing result is bounded between observed passing and failing values, not an exact universal threshold.</li>
            <li>The result is tied to the configured checkout fixture and provider execution context.</li>
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryBlock({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-xl bg-slate-950 p-3"><h3 className="text-xs uppercase tracking-widest text-slate-500">{title}</h3><p className="mt-2 text-sm text-slate-300">{children}</p></div>;
}

function MinimalConditionSummary({ finding, boundary }: { finding: FindingDetail; boundary?: FailureBoundaryViewModel | undefined }) {
  const retained = conditionRecord(finding, 'retainedConditions');
  const range = boundary ?? failureBoundaryViewModel(finding);
  const finalConfirmation = finding.reproductions.some((run) => run.reproduced) ? 'Reproduced' : 'Not recorded';
  return (
    <section className="card border-cyan/30">
      <h2 className="font-bold">Minimal tested condition set</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
        {Object.entries(retained).map(([key, value]) => <li key={key}>{formatConditionKey(key)}: {formatConditionValue(key, value)}</li>)}
        {range.failingBoundMs !== undefined ? <li>Failure observed at {range.failingBoundMs.toLocaleString()} ms</li> : null}
        {range.passingBoundMs !== undefined ? <li>Passing behaviour observed at {range.passingBoundMs.toLocaleString()} ms</li> : null}
        <li>Final minimal-set confirmation: {finalConfirmation}</li>
        <li>Claim level: minimal tested set, not globally minimal conditions.</li>
      </ul>
    </section>
  );
}

function ExperimentHistory({ worlds, experiments, evidence }: { worlds: InvestigationWorld[]; experiments: InvestigationExperiment[]; evidence: EvidenceArtifactResponse[] }) {
  const rows = useMemo(() => experimentHistoryRows(worlds, experiments, evidence), [evidence, experiments, worlds]);
  if (!rows.length) return <PanelState title="Experiment history">No world history was available for this finding.</PanelState>;
  return (
    <section className="card">
      <h2 className="font-bold">Experiment history</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-widest text-slate-500">
            <tr>
              <th className="py-2 pr-4">World</th>
              <th className="py-2 pr-4">Stage</th>
              <th className="py-2 pr-4">Purpose</th>
              <th className="py-2 pr-4">Outcome</th>
              <th className="py-2 pr-4">Payment delay</th>
              <th className="py-2 pr-4">Repeated submit</th>
              <th className="py-2 pr-4">Bug mode</th>
              <th className="py-2 pr-4">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-slate-800" key={row.worldId}>
                <td className="py-2 pr-4 font-mono text-xs" title={row.worldId}>{shortId(row.worldId, 14)}</td>
                <td className="py-2 pr-4">{humanize(row.stage)}</td>
                <td className="py-2 pr-4">{row.purpose}</td>
                <td className="py-2 pr-4"><StatusBadge tone={row.outcome === 'PASS' ? 'green' : row.outcome === 'FAIL' ? 'red' : 'slate'}>{row.outcome}</StatusBadge></td>
                <td className="py-2 pr-4">{row.paymentDelay}</td>
                <td className="py-2 pr-4">{row.repeatedSubmit}</td>
                <td className="py-2 pr-4">{row.bugMode}</td>
                <td className="py-2 pr-4">{row.evidenceCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CausalSequence({ finding }: { finding: FindingDetail }) {
  const sequence = findingList(finding, 'causalSequence');
  return (
    <section className="card">
      <h2 className="font-bold">Evidence-supported sequence</h2>
      {sequence.length ? (
        <ol className="mt-4 space-y-2 text-sm text-slate-300">
          {sequence.map((item, index) => <li className="rounded-xl bg-slate-950 p-3" key={`${index}-${item}`}>{index + 1}. {item}</li>)}
        </ol>
      ) : <p className="mt-3 text-sm text-slate-500">A structured causal sequence was not recorded for this finding.</p>}
    </section>
  );
}
