import type { Finding, InvestigationEvent, InvestigationProgress } from '@taskos/shared-types';
import { type ReactNode, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { EvidenceArtifactResponse, EvidenceTextContentResponse, ExperimentPlanResponse, FindingDetail, InvestigationExperiment, InvestigationWorker, InvestigationWorld } from '../../services/api/index.js';
import { InvestigationApiError } from '../../services/api/index.js';
import { useEvidenceTextContent } from './use-runtime-queries.js';
import {
  boundedRange,
  bugMode,
  causalStatus,
  completedWorlds,
  conditionRecord,
  eventLabel,
  eventMetadataSummary,
  evidenceForExperiment,
  evidenceGroups,
  fallbackReason,
  finalReportIds,
  filterWorld,
  formatDate,
  formatDuration,
  formatValue,
  humanize,
  paymentDelay,
  phaseLabel,
  plannerList,
  progressPercentage,
  providerFromPlan,
  repeatedSubmit,
  reproductionSteps,
  shortId,
  worldBrowser,
  worldOrigin,
  worldPurpose,
  worldResult,
  worldViewport,
  type WorldFilter,
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
            Planner: {humanize(provider.effective)} · Worker: {workerProvider ?? 'Not recorded'}
          </p>
        </div>
        <div className="min-w-48 text-right">
          <div className="text-3xl font-black text-cyan">{percentage}%</div>
          <div className="text-sm text-slate-400">worlds completed</div>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800" aria-label={`${percentage}% complete`}>
        <div className="h-full bg-cyan" style={{ width: `${percentage}%` }} />
      </div>
    </section>
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

export function WorldTable({ worlds, experiments, evidence }: { worlds: InvestigationWorld[]; experiments: InvestigationExperiment[]; evidence: EvidenceArtifactResponse[] }) {
  const filters: WorldFilter[] = ['ALL', 'INITIAL', 'ADAPTIVE_REPRODUCTION', 'MINIMISATION', 'PASSED', 'FAILED', 'RUNNING'];
  const [activeFilter, setActiveFilter] = useRuntimeFilter();
  const visible = worlds.filter((world) => filterWorld(world, activeFilter, experiments));
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Worlds</h2>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button className={`rounded-full px-3 py-1 text-xs ${activeFilter === filter ? 'bg-cyan text-ink' : 'bg-slate-900 text-slate-300'}`} key={filter} onClick={() => setActiveFilter(filter)} type="button">
              {humanize(filter)}
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                {['World', 'Origin', 'Purpose', 'Browser', 'Viewport', 'Delay', 'Repeated submit', 'Bug mode', 'Status', 'Result', 'Evidence', 'Started / completed'].map((heading) => <th className="px-3 py-2" key={heading}>{heading}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visible.map((world) => {
                const experiment = experiments.find((item) => item.worldId === world.id || item.id === world.experimentId);
                const evidenceCount = evidenceForExperiment(experiment?.id ?? world.experimentId, evidence).length;
                const result = worldResult(world, experiments);
                return (
                  <tr key={world.id}>
                    <td className="px-3 py-3 font-mono text-xs" title={world.id}>{shortId(world.id)}</td>
                    <td className="px-3 py-3">{humanize(worldOrigin(world))}</td>
                    <td className="px-3 py-3">{worldPurpose(world)}</td>
                    <td className="px-3 py-3">{worldBrowser(world)}</td>
                    <td className="px-3 py-3">{worldViewport(world)}</td>
                    <td className="px-3 py-3">{paymentDelay(world)}</td>
                    <td className="px-3 py-3">{repeatedSubmit(world)}</td>
                    <td className="px-3 py-3">{bugMode(world)}</td>
                    <td className="px-3 py-3">{humanize(world.status)}</td>
                    <td className="px-3 py-3"><StatusBadge tone={result === 'PASS' ? 'green' : result === 'FAIL' ? 'red' : 'slate'}>{result}</StatusBadge></td>
                    <td className="px-3 py-3">{evidenceCount}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{formatDate(world.startedAt)} → {formatDate(world.completedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-slate-500">No worlds match this filter.</p>}
    </section>
  );
}

function useRuntimeFilter(): [WorldFilter, (filter: WorldFilter) => void] {
  return useState<WorldFilter>('ALL');
}

export function WorkerPanel({ workers }: { workers: InvestigationWorker[] }) {
  return (
    <section className="card">
      <h2 className="font-bold">Workers and attempts</h2>
      {workers.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {workers.map((worker) => (
            <div className="rounded-xl bg-slate-950 p-3" key={worker.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-xs" title={worker.id}>{shortId(worker.id)}</div>
                <StatusBadge>{worker.provider}</StatusBadge>
              </div>
              <div className="mt-2 text-sm text-slate-400">Status: {humanize(worker.status)} · Attempts: {worker.attempts.length}</div>
              {worker.attempts.slice(0, 2).map((attempt) => (
                <div className="mt-2 text-xs text-slate-500" key={attempt.id}>
                  Attempt {shortId(attempt.id)} · {humanize(attempt.status)} · {formatDuration(attempt.durationMs)} · world {shortId(attempt.experiment.worldId)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-slate-500">No worker attempts have been recorded yet.</p>}
    </section>
  );
}

export function EventTimeline({ events }: { events: InvestigationEvent[] }) {
  return (
    <section className="card">
      <h2 className="font-bold">Event timeline</h2>
      {events.length ? (
        <ol className="mt-4 space-y-4">
          {events.map((event) => (
            <li className="border-l-2 border-cyan/40 pl-4" key={event.id}>
              <div className="font-medium">{eventLabel(event.type)}</div>
              <p className="mt-1 text-sm text-slate-400">{event.message}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                <time>{formatDate(event.createdAt)}</time>
                {event.worldId ? <span>World {shortId(event.worldId)}</span> : null}
                {eventMetadataSummary(event).slice(0, 4).map((item) => <span key={item}>{item}</span>)}
              </div>
            </li>
          ))}
        </ol>
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

export function ConditionBlock({ title, conditions, empty }: { title: string; conditions: Record<string, unknown>; empty: string }) {
  const entries = Object.entries(conditions);
  return (
    <section className="card">
      <h2 className="font-bold">{title}</h2>
      {entries.length ? (
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div className="rounded-xl bg-slate-950 p-3" key={key}>
              <dt className="text-xs uppercase tracking-widest text-slate-500" title={key}>{humanize(key)}</dt>
              <dd className="mt-1 font-semibold text-slate-100">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-3 text-sm text-slate-500">{empty}</p>}
    </section>
  );
}

export function FailureRange({ finding }: { finding: Finding | FindingDetail }) {
  const range = boundedRange(finding);
  const passing = range.knownPassingDelayMs ?? range.lowerPassingBoundMs;
  const failing = range.knownFailingDelayMs ?? range.upperFailingBoundMs;
  const target = range.targetPrecisionMs;
  const tested = Array.isArray(range.testedPointsMs) ? range.testedPointsMs : [];
  const hasPassingBound = passing !== undefined && passing !== null;
  const hasFailingBound = failing !== undefined && failing !== null;
  return (
    <section className="card">
      <h2 className="font-bold">Bounded failure range</h2>
      {hasPassingBound || hasFailingBound ? (
        <>
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center text-xs text-slate-400">
            <div className="rounded-lg bg-emerald-300/10 p-2 text-emerald-200">Stable</div>
            <div>{formatValue(passing)} ms</div>
            <div className="rounded-lg bg-amber-300/10 p-2 text-amber-100">Uncertain interval</div>
            <div>{formatValue(failing)} ms</div>
            <div className="rounded-lg bg-red-300/10 p-2 text-red-200">Failure observed</div>
          </div>
          <p className="mt-3 text-sm text-slate-400">Target precision: {formatValue(target)} ms. This is an observed bounded range, not an exact causal threshold.</p>
          {tested.length ? <p className="mt-2 text-sm text-slate-500">Tested points: {tested.map(formatValue).join(', ')} ms</p> : null}
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
      {steps.length ? <ol className="mt-4 list-decimal space-y-2 pl-5 text-slate-300">{steps.map((step) => <li key={step}>{step}</li>)}</ol> : <p className="mt-3 text-sm text-slate-500">No deterministic reproduction steps were recorded.</p>}
    </section>
  );
}

export function EvidenceViewer({ evidence, investigationId }: { evidence: EvidenceArtifactResponse[]; investigationId: string }) {
  const groups = evidenceGroups(evidence);
  return (
    <section className="card">
      <h2 className="font-bold">Evidence</h2>
      <div className="mt-4 space-y-4">
        {Object.entries(groups).map(([label, items]) => (
          <details className="rounded-xl bg-slate-950 p-3" key={label} open={label === 'Final reports'}>
            <summary className="cursor-pointer font-semibold">{label} ({items.length})</summary>
            {items.length ? (
              <div className="mt-3 grid gap-2">
                {items.map((artifact) => (
                  <div className="rounded-lg border border-slate-800 p-3 text-sm" key={artifact.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{artifact.type}</span>
                      <span className="text-xs text-slate-500">{artifact.mimeType} · {artifact.sizeBytes.toLocaleString()} bytes</span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-500" title={artifact.id}>{shortId(artifact.id, 14)}</div>
                    <div className="mt-1 break-all text-xs text-slate-500">{artifact.path}</div>
                    {artifact.type === 'FINAL_REPORT'
                      ? <FinalReportPreview artifact={artifact} investigationId={investigationId} />
                      : <p className="mt-2 text-xs text-slate-400">{artifact.type === 'TRACE' ? 'Trace archives are available as metadata; browser preview is not supported here.' : 'Artifact body preview is unavailable unless a safe file endpoint is added.'}</p>}
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-slate-500">No {label.toLowerCase()} evidence is available.</p>}
          </details>
        ))}
      </div>
    </section>
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
  const rows = ['reportVersion', 'summary', 'businessImpact', 'confidence', 'retainedConditions', 'removedConditions', 'boundedRange', 'reproductionSteps', 'limitations'];
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

export function FindingDetailSections({ finding }: { finding: FindingDetail }) {
  const retained = conditionRecord(finding, 'retainedConditions');
  const removed = conditionRecord(finding, 'removedConditions');
  const inconclusive = conditionRecord(finding, 'inconclusiveConditions');
  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="red">{finding.severity}</StatusBadge>
          <StatusBadge tone="green">{finding.confidence}</StatusBadge>
          <StatusBadge>{humanize(causalStatus(finding))}</StatusBadge>
        </div>
        <h2 className="mt-4 text-2xl font-bold">{finding.title}</h2>
        <p className="mt-3 text-slate-300">{finding.summary}</p>
        <p className="mt-3 text-sm text-slate-400">
          Reproduction count: {finding.reproductionCount}. This is a supported minimal-tested
          condition set, not an absolute claim of global minimality.
        </p>
      </section>
      <div className="grid gap-5 lg:grid-cols-3">
        <ConditionBlock title="Retained in minimal tested set" conditions={retained} empty="No retained conditions were recorded." />
        <ConditionBlock title="Removed conditions" conditions={removed} empty="No removed conditions were recorded." />
        <ConditionBlock title="Inconclusive conditions" conditions={inconclusive} empty="No inconclusive conditions were recorded." />
      </div>
      <FailureRange finding={finding} />
      <ReproductionSteps finding={finding} />
      <EvidenceViewer evidence={finding.evidence} investigationId={finding.investigationId} />
    </div>
  );
}
