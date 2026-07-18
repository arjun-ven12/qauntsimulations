import type { Finding, InvestigationEvent, InvestigationProgress } from '@taskos/shared-types';
import { type ReactNode, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { EvidenceArtifactResponse, EvidenceTextContentResponse, ExperimentPlanResponse, FindingDetail, InvestigationExperiment, InvestigationWorker, InvestigationWorld } from '../../services/api/index.js';
import { InvestigationApiError } from '../../services/api/index.js';
import { useEvidenceTextContent } from './use-runtime-queries.js';
import {
  businessOutcomeTone,
  conditionRoleTone,
  confidenceTone,
  executionStatusTone,
  findingSeverityTone,
  findingStateStatus,
  plannerStatusTone,
  type SemanticStatusTone,
} from './semantic-status.js';
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
  plannerProviderLabel,
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

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: SemanticStatusTone | 'cyan' | 'green' | 'red' | 'amber' | 'slate' }) {
  const semanticTone: SemanticStatusTone = tone === 'green' ? 'pass' : tone === 'cyan' ? 'running' : tone === 'red' ? 'fail' : tone === 'amber' ? 'pending' : tone === 'slate' ? 'neutral' : tone;
  const label = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
  return <span aria-label={label ? `${label} status` : undefined} className={`rift-semantic-status rift-semantic-status--${semanticTone}`} data-tone={semanticTone}>{children}</span>;
}

export function PanelState({ title, children, retry }: { title: string; children: string; retry?: () => void }) {
  return (
    <section className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] p-5" role="status">
      <h2 className="font-semibold text-[var(--rift-text)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">{children}</p>
      {retry ? (
        <button className="rift-button-secondary mt-4 min-h-9 px-3 py-1.5 text-xs" onClick={retry} type="button">
          Retry
        </button>
      ) : null}
    </section>
  );
}

export function RuntimeNav({ investigationId, findingContext = false }: { investigationId: string; findingContext?: boolean }) {
  const items = [
    { to: `/investigations/${investigationId}`, label: 'Overview' },
    { to: `/investigations/${investigationId}/live`, label: 'Live run' },
    { to: `/investigations/${investigationId}/plan`, label: 'Plan' },
    { to: `/investigations/${investigationId}/worlds`, label: 'Worlds' },
    { to: `/investigations/${investigationId}/findings`, label: findingContext ? 'Finding' : 'Findings' },
  ];
  return (
    <nav aria-label="Investigation sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--rift-border)]">
      {items.map((item) => (
        <NavLink
          className={({ isActive }) => `shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${isActive ? 'border-white text-white' : 'border-transparent text-[var(--rift-text-muted)] hover:text-[var(--rift-text)]'}`}
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
            <StatusBadge tone={executionStatusTone(progress.status)}>{phaseLabel(progress.status)}</StatusBadge>
            <StatusBadge tone={executionStatusTone(progress.status)}>{progress.status}</StatusBadge>
          </div>
          <h2 className="mt-4 text-2xl font-black">Investigation {shortId(progress.id, 12)}</h2>
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
            Planner: {plannerProviderLabel(provider.effective)} · Worker: {workerProvider ?? 'Not recorded'} · Findings: {progress.findingsCount.toLocaleString()} · Worlds: {progress.progress.totalWorlds.toLocaleString()}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PlannerProvenanceBadge plan={plan} />
            <Link className="rift-button-secondary min-h-8 px-3 py-1.5 text-xs" to={`/investigations/${progress.id}/plan`}>View experiment plan</Link>
          </div>
          <p className="mt-1 text-xs text-[var(--rift-text-muted)]">Raw status: {progress.status}</p>
        </div>
        <div className="min-w-48 text-right">
          <div className="text-3xl font-black text-white">{percentage}%</div>
          <div className="text-sm text-[var(--rift-text-secondary)]">{progressCopy(progress.progress)}</div>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--rift-surface-hover)]" aria-label={`${percentage}% complete`}>
        <div className={`h-full ${semanticDotClass(executionStatusTone(progress.status))}`} style={{ width: `${percentage}%` }} />
      </div>
      <PhaseTracker steps={steps} />
    </section>
  );
}

export function PlannerProvenanceBadge({ plan }: { plan: ExperimentPlanResponse | null | undefined }) {
  const provider = providerFromPlan(plan);
  const tone = provider.kimiVerified ? 'pass' : provider.fallbackUsed ? 'pending' : provider.status === 'FAILED' ? 'fail' : 'neutral';
  return <StatusBadge tone={tone}>{provider.badgeLabel}</StatusBadge>;
}

export function PhaseTracker({ steps }: { steps: ReturnType<typeof phaseTracker> }) {
  const tone = (state: string): SemanticStatusTone => state === 'completed' ? 'pass' : state === 'active' ? 'running' : state === 'stopped' ? 'fail' : 'neutral';
  return (
    <ol className="mt-6 grid gap-4 md:grid-cols-7 md:gap-0" aria-label="Investigation phase tracker">
      {steps.map((step, index) => (
        <li className="relative border-t border-[var(--rift-border-strong)] pt-3 md:pr-3" key={step.id}>
          <span aria-hidden="true" className={`absolute -top-1 left-0 size-2 rounded-full ${semanticDotClass(tone(step.state))}`} />
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">Step {index + 1}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--rift-text)]">{step.label}</div>
          <div className="mt-1 text-xs"><span className={semanticTextClass(tone(step.state))}>{humanize(step.state)}</span></div>
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
    ['Execution completed', progress.progress.passed],
    ['Execution failed', progress.progress.failed],
    ['Findings', progress.findingsCount],
  ] as const;
  return (
    <section className="card">
      <h2 className="font-bold">Runtime progress</h2>
      <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">{progressCopy(progress.progress)}. Attempts are tracked separately from worlds.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {rows.map(([label, value]) => (
          <div className="rounded-xl bg-[var(--rift-surface-raised)] p-3" key={label}>
            <div className="text-xs text-[var(--rift-text-muted)]">{label}</div>
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
    <section className="card border-[var(--rift-border-strong)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">{progress.status === 'COMPLETED' ? 'Completed run summary' : 'Terminal run summary'}</h2>
        <StatusBadge tone={executionStatusTone(progress.status)}>{humanize(progress.status)}</StatusBadge>
      </div>
      <p className="mt-3 text-sm text-[var(--rift-text-secondary)]">{terminalSummary(progress, findings)}</p>
    </section>
  );
}

export function ExperimentPlanPanel({
  demoPreview,
  plan,
}: {
  demoPreview?: { onExit: () => void } | undefined;
  plan: ExperimentPlanResponse | null;
}) {
  if (!plan) return <PanelState title="Experiment plan">No experiment plan has been recorded yet.</PanelState>;
  const provider = providerFromPlan(plan);
  const assumptions = plannerList(plan, 'assumptions');
  const warnings = plannerList(plan, 'warnings');
  const rejected = plannerList(plan, 'rejectedPlanItems');
  const fallback = provider.fallbackReason;
  const generationLabel = provider.fallbackUsed ? 'Fallback plan' : provider.effective === 'AIAND' ? 'Planned by Kimi via ai&' : provider.effective === 'KIMI' ? 'Planned by Kimi' : `Planned by ${plannerProviderLabel(provider.effective)}`;
  const validationTone = provider.kimiVerified ? 'pass' : provider.fallbackUsed ? 'pending' : provider.status === 'FAILED' || provider.status === 'REJECTED' ? 'fail' : 'neutral';
  const baseline = plan.worlds[0];
  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {demoPreview ? (
              <div className="mb-4 rounded-2xl border-2 border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-4" role="alert">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--status-pending)]">DEMO PREVIEW</div>
                <p className="mt-2 text-sm font-bold text-white">Simulated successful ai&amp; plan — Not a persisted provider result</p>
                <p className="mt-1 text-sm text-[var(--status-pending)]">This screen uses simulated presentation data. No successful full ai&amp; plan was persisted for this preview.</p>
                <button className="rift-button-secondary mt-3 min-h-9 px-3 py-1.5 text-xs" onClick={demoPreview.onExit} type="button">
                  Exit demo preview
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={validationTone}>{generationLabel}</StatusBadge>
              {provider.kimiVerified && !demoPreview ? <StatusBadge tone="pass">Kimi Verified</StatusBadge> : null}
              <StatusBadge tone={plannerStatusTone(provider.status, provider.fallbackUsed)}>{humanize(provider.status)}</StatusBadge>
            </div>
            <h2 className="mt-4 text-2xl font-black">Experiment Plan</h2>
            <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
              {demoPreview ? 'This preview demonstrates the intended successful Experiment Plan UI without changing production provenance.' : provider.kimiVerified ? 'Kimi created these worlds. RIFT validated them. They are ready to run.' : provider.fallbackUsed ? 'Kimi was unavailable, so RIFT generated a deterministic fallback plan.' : 'RIFT is showing the persisted planner output and validation state.'}
            </p>
          </div>
          <div className="grid min-w-44 gap-1 text-sm text-[var(--rift-text-secondary)]">
            <span><strong className="text-white">{plan.worlds.length.toLocaleString()}</strong> initial worlds</span>
            <span>Plan {humanize(provider.status)}</span>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <ProvenanceMetric label="Provider" value={plannerProviderLabel(provider.effective)} />
          <ProvenanceMetric label="Model" value={provider.model ?? 'Not applicable'} />
          <ProvenanceMetric label="Fallback" value={provider.fallbackUsed ? 'Yes' : 'No'} />
          <ProvenanceMetric label="Schema" value={provider.schemaPassed ? 'Passed' : 'Not passed'} />
          <ProvenanceMetric label="Safety" value={provider.safetyPassed ? 'Passed' : 'Not passed'} />
          <ProvenanceMetric label="Planning time" value={demoPreview ? `Simulated ${formatPlannerDuration(provider.durationMs)}` : formatPlannerDuration(provider.durationMs)} />
        </dl>
        {fallback ? <p className="mt-4 rounded-xl border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-3 text-sm text-[var(--status-pending)]">{fallback}</p> : null}
      </section>

      <section className="card">
        <h2 className="font-bold">Objective</h2>
        <p className="mt-3 text-[var(--rift-text-secondary)]">{plan.objective}</p>
        <h3 className="mt-6 font-bold">{(provider.effective === 'KIMI' || provider.effective === 'AIAND') && !provider.fallbackUsed ? 'Kimi’s experiment strategy' : 'Experiment strategy'}</h3>
        <p className="mt-3 text-sm leading-6 text-[var(--rift-text-secondary)]">{plan.planningExplanation ?? 'No concise planner strategy was recorded.'}</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <ListBlock title="Variables" items={plan.selectedVariables} empty="No variables recorded." />
          <ListBlock title="Assumptions" items={assumptions} empty="No assumptions recorded." />
          <ListBlock title="Warnings" items={warnings} empty="No validation warnings." tone={warnings.length ? 'pending' : 'neutral'} />
        </div>
      </section>

      <EnvironmentIntelligencePanel intelligence={plan.environmentIntelligence ?? null} />

      <section className="card">
        <h2 className="font-bold">Plan progression</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-6" aria-label="Experiment plan progression">
          {planProgression(plan, provider).map((step) => (
            <li className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] p-3" key={step.label}>
              <div className="text-xs uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">{step.label}</div>
              <div className="mt-2"><StatusBadge tone={step.tone}>{step.value}</StatusBadge></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Initial worlds</h2>
            <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">{provider.sourceLabel}. Changed dimensions are highlighted against the first baseline world.</p>
          </div>
          <StatusBadge tone={provider.kimiVerified ? 'pass' : provider.fallbackUsed ? 'pending' : 'neutral'}>{provider.sourceLabel}</StatusBadge>
        </div>
        {plan.worlds.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {plan.worlds.map((world, index) => (
              <PlannedWorldCard baseline={baseline} index={index} key={plannedWorldKey(world, index)} world={world} />
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-[var(--rift-text-muted)]">No initial worlds were persisted for this plan.</p>}
      </section>

      <details className="card">
        <summary className="cursor-pointer text-sm font-bold text-white">Planning provenance</summary>
        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          <ProvenanceMetric label="Actual provider" value={plannerProviderLabel(provider.effective)} />
          <ProvenanceMetric label="Requested provider" value={plannerProviderLabel(provider.requested)} />
          {provider.effective === 'AIAND' ? <ProvenanceMetric label="Serving provider" value="ai&" /> : null}
          {provider.effective === 'AIAND' ? <ProvenanceMetric label="Model developer" value="Moonshot AI" /> : null}
          <ProvenanceMetric label="Model" value={provider.model ?? 'Not applicable'} />
          <ProvenanceMetric label="Fallback used" value={provider.fallbackUsed ? 'Yes' : 'No'} />
          <ProvenanceMetric label="Planning status" value={humanize(provider.status)} />
          <ProvenanceMetric label="Schema validation" value={provider.schemaPassed ? 'Passed' : 'Not passed'} />
          <ProvenanceMetric label="Safety validation" value={provider.safetyPassed ? 'Passed' : 'Not passed'} />
          <ProvenanceMetric label="Duration" value={formatPlannerDuration(provider.durationMs)} />
          <ProvenanceMetric label="Generated timestamp" value={formatDate(provider.generatedAt)} />
          <ProvenanceMetric label="Plan ID" value={plan.planId ?? 'Not recorded'} />
          <ProvenanceMetric label="Investigation ID" value={plan.investigationId ?? 'Not recorded'} />
          <ProvenanceMetric label="Initial-world count" value={plan.worlds.length} />
        </dl>
        {rejected.length ? <ListBlock title="Rejected plan items" items={rejected.map((item) => typeof item === 'string' ? item : formatValue(item))} empty="No rejected plan items." tone="pending" /> : null}
      </details>
    </div>
  );
}

function EnvironmentIntelligencePanel({ intelligence }: { intelligence: ExperimentPlanResponse['environmentIntelligence'] | null }) {
  if (!intelligence) {
    return (
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">Environment Intelligence</h2>
          <StatusBadge tone="neutral">No external context</StatusBadge>
        </div>
        <p className="mt-3 text-sm text-[var(--rift-text-secondary)]">External context unavailable. Planning continued without Oxylabs.</p>
      </section>
    );
  }
  const completed = intelligence.provider === 'OXYLABS' && intelligence.status === 'COMPLETED';
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Environment Intelligence</h2>
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
            {completed ? 'Rendered public page context retrieved and bounded for planning.' : 'External context unavailable. Planning continued without Oxylabs.'}
          </p>
        </div>
        <StatusBadge tone={completed ? 'pass' : 'pending'}>{completed ? 'Context by Oxylabs' : 'External context unavailable'}</StatusBadge>
      </div>
      {completed ? (
        <dl className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <ProvenanceMetric label="Provider" value="Context by Oxylabs" />
          <ProvenanceMetric label="Rendered" value={intelligence.rendered ? 'Rendered public page' : 'Not rendered'} />
          <ProvenanceMetric label="Source" value={intelligence.sourceDomain} />
          <ProvenanceMetric label="Forms detected" value={intelligence.formCount} />
          <ProvenanceMetric label="Actions detected" value={intelligence.buttonCount + intelligence.linkCount} />
          <ProvenanceMetric label="Context available to planner" value={intelligence.usedByPlanner ? 'Yes' : 'No'} />
        </dl>
      ) : null}
      {completed && intelligence.detectedJourneys.length ? (
        <p className="mt-4 text-sm text-[var(--rift-text-secondary)]">
          Journeys detected: <span className="font-semibold text-white">{intelligence.detectedJourneys.join(', ')}</span>
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-[var(--rift-surface-raised)] p-3"><div className="text-xs text-[var(--rift-text-muted)]">{label}</div><div className="mt-1 text-xl font-bold text-white">{value}</div></div>;
}

function ProvenanceMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-[var(--rift-surface-raised)] p-3"><dt className="text-xs text-[var(--rift-text-muted)]">{label}</dt><dd className="mt-1 break-words font-bold text-white">{value}</dd></div>;
}

function formatPlannerDuration(durationMs: number | null): string {
  if (durationMs === null) return 'Not recorded';
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(2)}s`;
  return `${durationMs.toLocaleString()} ms`;
}

function planProgression(plan: ExperimentPlanResponse, provider: ReturnType<typeof providerFromPlan>): Array<{ label: string; value: string; tone: SemanticStatusTone }> {
  const failed = provider.status === 'FAILED' || provider.status === 'REJECTED';
  return [
    { label: 'Objective received', value: plan.objective ? 'Complete' : 'Pending', tone: plan.objective ? 'pass' : 'pending' },
    { label: provider.requested === 'KIMI' ? 'Kimi planning' : 'Planner', value: failed ? 'Failed' : provider.fallbackUsed ? 'Fallback' : provider.status === 'ACCEPTED' ? 'Complete' : humanize(provider.status), tone: failed ? 'fail' : provider.fallbackUsed ? 'pending' : provider.status === 'ACCEPTED' ? 'pass' : 'neutral' },
    { label: 'Schema validation', value: provider.schemaPassed ? 'Passed' : 'Pending', tone: provider.schemaPassed ? 'pass' : 'pending' },
    { label: 'Safety validation', value: provider.safetyPassed ? 'Passed' : 'Pending', tone: provider.safetyPassed ? 'pass' : 'pending' },
    { label: 'Initial worlds', value: `${plan.worlds.length.toLocaleString()} created`, tone: plan.worlds.length ? 'pass' : 'pending' },
    { label: 'Simulation', value: plan.worlds.length && !failed ? 'Ready' : failed ? 'Blocked' : 'Pending', tone: plan.worlds.length && !failed ? 'pass' : failed ? 'fail' : 'pending' },
  ];
}

function PlannedWorldCard({ world, baseline, index }: { world: ExperimentPlanResponse['worlds'][number]; baseline: ExperimentPlanResponse['worlds'][number] | undefined; index: number }) {
  const rows = plannedWorldRows(world, baseline);
  return (
    <article className="rounded-2xl border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">World {String(index + 1).padStart(2, '0')}</div>
          <h3 className="mt-1 font-bold text-white">{plannedWorldName(world, index)}</h3>
        </div>
        <StatusBadge tone={index === 0 ? 'neutral' : 'running'}>{index === 0 ? 'Baseline' : 'Variant'}</StatusBadge>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--rift-text-secondary)]">{typeof world.reason === 'string' && world.reason ? world.reason : 'No purpose was recorded for this world.'}</p>
      <dl className="mt-4 grid gap-2 text-sm">
        {rows.map((row) => (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rift-border)] pt-2" key={row.label}>
            <dt className="text-[var(--rift-text-muted)]">{row.label}</dt>
            <dd className="text-right font-medium text-white">
              {row.value}
              {row.changed ? <span className="ml-2 rounded-full bg-[var(--status-running-bg)] px-2 py-0.5 text-[10px] text-[var(--status-running)]">Changed</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function plannedWorldRows(world: ExperimentPlanResponse['worlds'][number], baseline: ExperimentPlanResponse['worlds'][number] | undefined) {
  const keys = [
    ['Browser', 'browser'],
    ['Viewport', 'viewport'],
    ['Network', 'networkProfile'],
    ['User behaviour', 'userProfile'],
    ['Payment delay', 'paymentDelayMs'],
    ['Repeated submission', 'doubleSubmit'],
    ['Submit interval', 'doubleSubmitIntervalMs'],
    ['Defect mode', 'duplicateSubmissionBug'],
    ['Expected observation', 'expectedOutcome'],
  ] as const;
  return keys.map(([label, key]) => {
    const value = world[key];
    const baselineValue = baseline?.[key];
    return { label, value: formatConditionValue(key, value), changed: baseline !== undefined && value !== baselineValue };
  });
}

function plannedWorldName(world: ExperimentPlanResponse['worlds'][number], index: number): string {
  const name = world.name;
  return typeof name === 'string' && name.trim() ? name : `Initial world ${index + 1}`;
}

function plannedWorldKey(world: ExperimentPlanResponse['worlds'][number], index: number): string {
  const id = world.id;
  const key = world.key;
  if (typeof id === 'string') return id;
  if (typeof key === 'string') return key;
  return `planned-world-${index}`;
}

function ListBlock({ title, items, empty, tone = 'neutral' }: { title: string; items: string[]; empty: string; tone?: SemanticStatusTone }) {
  return (
    <div className={tone === 'pending' ? 'border-l-2 border-[var(--status-pending-border)] pl-3' : ''}>
      <h3 className={`text-sm font-bold ${tone === 'pending' ? 'text-[var(--status-pending)]' : 'text-[var(--rift-text)]'}`}>{title}</h3>
      {items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--rift-text-secondary)]">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--rift-text-muted)]">{empty}</p>}
    </div>
  );
}

export function WorldTable({ worlds, experiments, workers = [], evidence }: { worlds: InvestigationWorld[]; experiments: InvestigationExperiment[]; workers?: InvestigationWorker[]; evidence: EvidenceArtifactResponse[] }) {
  const filters: WorldFilter[] = ['ALL', 'INITIAL', 'ADAPTIVE_REPRODUCTION', 'MINIMISATION', 'BUSINESS_PASS', 'BUSINESS_FAIL', 'BUSINESS_INCONCLUSIVE', 'EXECUTION_RUNNING', 'EXECUTION_FAILED'];
  const filterLabels: Partial<Record<WorldFilter, string>> = {
    BUSINESS_PASS: 'Business: Pass',
    BUSINESS_FAIL: 'Business: Fail',
    BUSINESS_INCONCLUSIVE: 'Business: Inconclusive',
    EXECUTION_RUNNING: 'Execution: Running',
    EXECUTION_FAILED: 'Execution: Failed',
  };
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
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">{worlds.length.toLocaleString()} worlds. Select up to two rows to compare actual runtime conditions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Search worlds" className="rounded-lg border border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)] px-3 py-2 text-sm text-[var(--rift-text)]" onChange={(event) => setSearch(event.target.value)} placeholder="Search world, purpose, browser…" value={search} />
          <select aria-label="Sort worlds" className="rounded-lg border border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)] px-3 py-2 text-sm text-[var(--rift-text)]" onChange={(event) => setSort(event.target.value as WorldSort)} value={sort}>
            {sorts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="World filters">
        {filters.map((filter) => (
          <button className={`rounded-full px-3 py-1 text-xs ${activeFilter === filter ? 'bg-white text-black' : 'bg-[var(--rift-surface-raised)] text-[var(--rift-text-secondary)]'}`} key={filter} onClick={() => setActiveFilter(filter)} role="tab" aria-selected={activeFilter === filter} type="button">
            {filter === 'ALL' ? 'All' : filter === 'INITIAL' || filter === 'ADAPTIVE_REPRODUCTION' || filter === 'MINIMISATION' ? worldOriginLabel(filter) : filterLabels[filter]}
          </button>
        ))}
      </div>
      {selectedRows.length ? <WorldComparison rows={selectedRows} clear={() => setSelected([])} /> : null}
      {visible.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-[var(--rift-text-muted)]">
              <tr>
                {['Compare', 'World', 'Stage and purpose', 'Tested trigger', 'Execution', 'Business outcome', 'Evidence', 'Details'].map((heading) => <th className="px-3 py-2" key={heading}>{heading}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rift-border)]">
              {visible.map((row) => {
                const resultTone = businessOutcomeTone(row.result);
                const selectedRow = selected.includes(row.world.id);
                return (
                  <tr className={selectedRow ? 'bg-white/5' : undefined} key={row.world.id}>
                    <td className="px-3 py-3"><button className="rounded border border-[var(--rift-border-strong)] px-2 py-1 text-xs" onClick={() => toggleSelection(row.world.id)} type="button" aria-pressed={selectedRow}>{selectedRow ? 'Selected' : 'Compare'}</button></td>
                    <td className="px-3 py-3 font-mono text-xs" title={row.world.id}>{shortId(row.world.id)}</td>
                    <td className="max-w-60 px-3 py-3"><span className="block font-medium text-[var(--rift-text)]">{row.originLabel}</span><span className="mt-1 block text-xs leading-5 text-[var(--rift-text-muted)]">{row.purpose}</span></td>
                    <td className="px-3 py-3"><span className="block">{row.paymentDelay}</span><span className="mt-1 block text-xs text-[var(--rift-text-muted)]">Repeated submit: {row.repeatedSubmission}</span></td>
                    <td className="px-3 py-3"><StatusBadge tone={executionStatusTone(row.status)}>{row.status}</StatusBadge></td>
                    <td className="px-3 py-3"><StatusBadge tone={resultTone}>{humanize(row.result)}</StatusBadge></td>
                    <td className="px-3 py-3">{row.evidenceCount}</td>
                    <td className="px-3 py-3">
                      <details className="min-w-40 text-xs text-[var(--rift-text-muted)]">
                        <summary className="cursor-pointer font-medium text-[var(--rift-text-secondary)]">Inspect world</summary>
                        <dl className="mt-2 grid gap-1.5">
                          <div><dt className="inline">Browser: </dt><dd className="inline text-[var(--rift-text)]">{row.browser}</dd></div>
                          <div><dt className="inline">Viewport: </dt><dd className="inline text-[var(--rift-text)]">{row.viewport}</dd></div>
                          <div><dt className="inline">Network: </dt><dd className="inline text-[var(--rift-text)]">{row.network}</dd></div>
                          <div><dt className="inline">Bug mode: </dt><dd className="inline text-[var(--rift-text)]">{row.bugMode}</dd></div>
                          <div><dt className="inline">Worker: </dt><dd className="inline font-mono text-[var(--rift-text)]" title={row.workerId}>{row.workerId ? shortId(row.workerId) : 'Not recorded'}</dd></div>
                          <div><dt className="inline">Attempts: </dt><dd className="inline text-[var(--rift-text)]">{row.attempts}</dd></div>
                          <div><dt className="inline">Timing: </dt><dd className="inline text-[var(--rift-text)]">{formatDate(row.world.createdAt)} → {formatDate(row.world.completedAt)}</dd></div>
                        </dl>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-[var(--rift-text-muted)]">No worlds match this filter. Worlds will appear after the experiment plan is accepted.</p>}
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
    ['Execution', (row) => row.status],
    ['Business outcome', (row) => humanize(row.result)],
    ['Failed invariants', (row) => row.result === 'FAIL' ? 'Business invariant failed' : 'None recorded'],
    ['Evidence count', (row) => row.evidenceCount],
  ];
  return (
    <div className="mt-4 rounded-xl border border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)] p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3"><h3 className="font-bold">World comparison</h3><button className="text-xs font-bold text-white" onClick={clear} type="button">Clear selection</button></div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr><th className="py-2 pr-4">Field</th>{rows.map((row) => <th className="py-2 pr-4 font-mono text-xs" key={row.world.id}>{shortId(row.world.id, 12)}</th>)}</tr></thead>
          <tbody>
            {fields.map(([label, reader]) => {
              const values = rows.map((row) => String(reader(row)));
              const differs = new Set(values).size > 1;
              return <tr className="border-t border-[var(--rift-border)]" key={label}><td className="py-2 pr-4 text-[var(--rift-text-secondary)]">{label}</td>{values.map((value, index) => <td className={`py-2 pr-4 ${differs ? 'text-white' : 'text-[var(--rift-text-secondary)]'}`} key={`${label}-${rows[index]!.world.id}`}>{value}</td>)}</tr>;
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

function semanticDotClass(tone: SemanticStatusTone) {
  if (tone === 'pass') return 'bg-[var(--status-pass)]';
  if (tone === 'running') return 'bg-[var(--status-running)]';
  if (tone === 'pending') return 'bg-[var(--status-pending)]';
  if (tone === 'fail') return 'bg-[var(--status-fail)]';
  return 'bg-[var(--status-neutral)]';
}

function semanticTextClass(tone: SemanticStatusTone) {
  if (tone === 'pass') return 'text-[var(--status-pass)]';
  if (tone === 'running') return 'text-[var(--status-running)]';
  if (tone === 'pending') return 'text-[var(--status-pending)]';
  if (tone === 'fail') return 'text-[var(--status-fail)]';
  return 'text-[var(--status-neutral)]';
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
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">Cohort: {matrix.cohortLabel}. {matrix.excludedWorldCount ? `${matrix.excludedWorldCount} incompatible comparable worlds excluded.` : 'No incompatible comparable worlds were mixed.'}</p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-center text-sm" aria-label="World outcome matrix by repeated submission and payment delay">
          <thead className="text-xs uppercase text-[var(--rift-text-muted)]">
            <tr><th className="px-3 py-2 text-left">Submission</th>{matrix.columns.map((delay) => <th className="px-3 py-2" key={delay}>{delay.toLocaleString()} ms</th>)}</tr>
          </thead>
          <tbody>
            {['Single submit', 'Double submit'].map((rowLabel) => (
              <tr className="border-t border-[var(--rift-border)]" key={rowLabel}>
                <th className="px-3 py-3 text-left">{rowLabel}</th>
                {matrix.columns.map((delay) => {
                  const cell = matrix.cells.find((item) => item.row === rowLabel && item.delayMs === delay)!;
                  const tone = businessOutcomeTone(cell.outcome);
                  return (
                    <td className="px-3 py-3" key={`${rowLabel}-${delay}`}>
                      <button className="rounded-lg border border-[var(--rift-border-strong)] px-3 py-2" onClick={() => setSelectedCell(`${cell.row}-${cell.delayMs}`)} type="button">
                        <StatusBadge tone={tone}>{cell.outcome}</StatusBadge>
                        <span className="mt-1 block text-xs text-[var(--rift-text-muted)]">{cell.worlds.length ? `${cell.worlds.length} world${cell.worlds.length === 1 ? '' : 's'}` : 'Not tested'}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--rift-text-muted)]">Text alternative: {matrix.cells.map((cell) => `${cell.row} at ${cell.delayMs} ms: ${cell.outcome} (${cell.summary})`).join('; ')}.</p>
      {selected ? (
        <div className="mt-4 rounded-xl bg-[var(--rift-surface-raised)] p-3">
          <h3 className="font-bold">{selected.row} at {selected.delayMs.toLocaleString()} ms</h3>
          <p className="mt-1 text-sm text-[var(--rift-text-secondary)]">{selected.summary}</p>
          {selected.worlds.length ? <ul className="mt-2 list-disc pl-5 text-sm text-[var(--rift-text-secondary)]">{selected.worlds.map((row) => <li key={row.world.id}>{shortId(row.world.id, 12)} · {row.purpose} · {row.result}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--rift-text-muted)]">This cell was not tested.</p>}
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
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">{workers.length.toLocaleString()} workers. Active workers appear first; completed workers are compact.</p>
        </div>
        <StatusBadge tone={active.length ? 'running' : 'pass'}>{active.length ? `${active.length} active` : 'No active workers'}</StatusBadge>
      </div>
      {workers.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {rendered.map((item) => (
            <details className="rounded-xl bg-[var(--rift-surface-raised)] p-3" key={item.worker.id} open={item.active || item.retrying}>
              <summary className="cursor-pointer">
                <span className="font-mono text-xs" title={item.worker.id}>{shortId(item.worker.id)}</span>
                <span className="ml-2"><StatusBadge tone={executionStatusTone(item.state)}>{item.state}</StatusBadge></span>
                <span className="ml-2"><StatusBadge>{item.worker.provider}</StatusBadge></span>
              </summary>
              <dl className="mt-3 grid gap-2 text-xs text-[var(--rift-text-secondary)] md:grid-cols-2">
                <div><dt>World</dt><dd className="font-mono">{item.worldId ? shortId(item.worldId, 14) : 'Not recorded'}</dd></div>
                <div><dt>Business outcome</dt><dd>{item.finalOutcome}</dd></div>
                <div><dt>Attempts</dt><dd>{item.attempts.length}{item.retrying ? ' · retry recorded' : ''}</dd></div>
                <div><dt>Cleanup</dt><dd>{item.cleanupLabel}</dd></div>
              </dl>
              <div className="mt-3 space-y-2">
                {item.attempts.map((attempt) => (
                  <div className="rounded-lg border border-[var(--rift-border)] p-2 text-xs text-[var(--rift-text-secondary)]" key={attempt.id}>
                    Attempt {attempt.number}: {attempt.status} · {attempt.duration}{attempt.exitCode !== undefined ? ` · exit ${attempt.exitCode}` : ''}
                    {attempt.infrastructureFailure ? <span className="ml-2 text-[var(--rift-text-secondary)]">Infrastructure/runtime failure, not product finding</span> : null}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">No worker attempts have been recorded yet. Workers will appear after worlds are queued.</p>}
      {completed.length > rendered.length ? <p className="mt-3 text-xs text-[var(--rift-text-muted)]">Showing first {rendered.length} workers. Use the worker API for the full operational list.</p> : null}
    </section>
  );
}

export function EventTimeline({ events }: { events: InvestigationEvent[] }) {
  const [filter, setFilter] = useState<'ALL' | 'IMPORTANT' | 'NORMAL' | 'TECHNICAL'>('IMPORTANT');
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
        <div><h2 className="font-bold">Runtime event timeline</h2><p className="mt-1 text-xs text-[var(--rift-text-muted)]">Key decisions are shown first. Normal and technical events remain available.</p></div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Event importance filters">
          {(['ALL', 'IMPORTANT', 'NORMAL', 'TECHNICAL'] as const).map((item) => <button className={`rounded-full px-3 py-1 text-xs ${filter === item ? 'bg-white text-black' : 'bg-[var(--rift-surface-raised)] text-[var(--rift-text-secondary)]'}`} key={item} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item} type="button">{humanize(item)}</button>)}
        </div>
      </div>
      {visible.length ? (
        <div className="mt-4 space-y-5">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <h3 className="text-sm font-bold text-[var(--rift-text-secondary)]">{group}</h3>
              <ol className="mt-2 space-y-3">
                {items.map((event) => {
                  const importance = eventImportance(event.type, event.metadata);
                  const metadata = safeEventMetadata(event);
                  return (
                    <li className="border-l-2 border-[var(--rift-border-strong)] pl-4" key={event.id}>
                      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{eventLabel(event.type)}</span><StatusBadge tone={importance === 'IMPORTANT' ? 'pending' : 'neutral'}>{humanize(importance)}</StatusBadge></div>
                      <p className="mt-1 text-sm text-[var(--rift-text-secondary)]">{event.message}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--rift-text-muted)]"><time>{formatDate(event.createdAt)}</time>{event.worldId ? <span>World {shortId(event.worldId)}</span> : null}{eventMetadataSummary(event).slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
                      {Object.keys(metadata).length ? <details className="mt-2 text-xs text-[var(--rift-text-muted)]"><summary className="cursor-pointer text-white">Technical metadata</summary><dl className="mt-2 grid gap-1 md:grid-cols-2">{Object.entries(metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="text-[var(--rift-text-secondary)]">{value}</dd></div>)}</dl></details> : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">{events.length ? 'No events match this importance filter.' : 'No runtime events have been recorded yet.'}</p>}
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
          <Link className="card block hover:border-white" key={finding.id} to={`/investigations/${investigationId}/findings/${finding.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge tone={findingSeverityTone(finding.severity)}>{finding.severity}</StatusBadge>
              <span className="text-xs text-white">{finding.confidence} · {finding.reproductionCount} reproductions</span>
            </div>
            <h2 className="mt-4 text-xl font-bold">{finding.title}</h2>
            <p className="mt-2 text-[var(--rift-text-secondary)]">{finding.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge tone={findingStateStatus(causalStatus(finding)).tone}>{humanize(causalStatus(finding))}</StatusBadge>
              <StatusBadge tone={conditionRoleTone('retained')}>{retained} retained</StatusBadge>
              <StatusBadge tone={conditionRoleTone('removed')}>{removed} removed</StatusBadge>
              {hasReport ? <StatusBadge tone="pass">Final report</StatusBadge> : <StatusBadge>No final report</StatusBadge>}
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
        <Link className="text-sm font-bold text-white" to={`/investigations/${investigationId}/findings`}>Open all findings</Link>
      </div>
      <div className="mt-4 grid gap-3">
        {findings.slice(0, 3).map((finding) => {
          const retained = conditionRecord(finding, 'retainedConditions');
          const hasReport = finalReportIds(finding).length > 0;
          const supported = causalStatus(finding);
          const active = !['COMPLETED', 'FAILED', 'CANCELLED'].includes(investigationStatus);
          return (
            <Link className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] p-4 hover:border-white" key={finding.id} to={`/investigations/${investigationId}/findings/${finding.id}`}>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={findingSeverityTone(finding.severity)}>{finding.severity}</StatusBadge>
                <StatusBadge tone={confidenceTone(finding.confidence)}>{active && finding.confidence !== 'CONFIRMED' ? 'Possible violation' : finding.confidence}</StatusBadge>
                <StatusBadge tone={findingStateStatus(supported).tone}>{humanize(supported)}</StatusBadge>
                {hasReport ? <StatusBadge tone="pass">Final report available</StatusBadge> : null}
              </div>
              <h3 className="mt-3 text-lg font-bold">{finding.title}</h3>
              <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">{finding.summary}</p>
              <p className="mt-3 text-sm text-[var(--rift-text-secondary)]">{finding.reproductionCount.toLocaleString()} validated reproductions · {Object.keys(retained).length} retained trigger conditions.</p>
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
      <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">{evidence.length.toLocaleString()} artifacts are available. Report bodies are not fetched on this overview page.</p>
      {evidence.length ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => (
            <div className="rounded-xl bg-[var(--rift-surface-raised)] p-3" key={type}>
              <dt className="text-xs text-[var(--rift-text-muted)]">{humanize(type)}</dt>
              <dd className="mt-1 text-xl font-bold">{count}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">Evidence will appear as workers capture browser, console, network, and final-report artifacts.</p>}
    </section>
  );
}

export function ConditionBlock({ title, conditions, empty, tone = 'neutral' }: { title: string; conditions: Record<string, unknown>; empty: string; tone?: SemanticStatusTone }) {
  const entries = Object.entries(conditions);
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{title}</h2><StatusBadge tone={tone}>{entries.length}</StatusBadge></div>
      {entries.length ? (
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div className="rounded-xl bg-[var(--rift-surface-raised)] p-3" key={key}>
              <dt className="text-xs uppercase tracking-widest text-[var(--rift-text-muted)]" title={key}>{formatConditionKey(key)}</dt>
              <dd className="mt-1 font-semibold text-[var(--rift-text)]">{formatConditionValue(key, value)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">{empty}</p>}
    </section>
  );
}

export function FailureRange({ finding, boundary }: { finding: Finding | FindingDetail; boundary?: FailureBoundaryViewModel | undefined }) {
  const range = boundary ?? failureBoundaryViewModel(finding);
  const hasPassingBound = range.passingBoundMs !== undefined;
  const hasFailingBound = range.failingBoundMs !== undefined;
  const categorical = [
    ...Object.entries(conditionRecord(finding, 'retainedConditions')).map(([key, value]) => ({ key, value, role: 'Required' })),
    ...Object.entries(conditionRecord(finding, 'removedConditions')).map(([key, value]) => ({ key, value, role: 'Not required' })),
    ...Object.entries(conditionRecord(finding, 'inconclusiveConditions')).map(([key, value]) => ({ key, value, role: 'Inconclusive' })),
  ];
  return (
    <section className="rounded-lg border border-[var(--rift-border)] p-4">
      <h2 className="text-lg font-bold">Failure boundary</h2>
      {hasPassingBound || hasFailingBound ? (
        <>
          <div className="mt-5 grid gap-2 text-center text-xs text-[var(--rift-text-secondary)] sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            <div className="rounded-lg border border-[var(--status-pass-border)] bg-[var(--status-pass-bg)] p-2 text-[var(--status-pass)]">Stable</div>
            <div aria-label="Passing bound">{hasPassingBound ? `≤ ${range.passingBoundMs!.toLocaleString()} ms` : 'No passing bound'}</div>
            <div className="rounded-lg border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-2 text-[var(--status-pending)]">Uncertain</div>
            <div aria-label="Failing bound">{hasFailingBound ? `≥ ${range.failingBoundMs!.toLocaleString()} ms` : 'No failing bound'}</div>
            <div className="rounded-lg border border-[var(--status-fail-border)] bg-[var(--status-fail-bg)] p-2 text-[var(--status-fail)]">Failure reproduced</div>
          </div>
          {hasPassingBound && hasFailingBound ? (
            <p className="mt-3 text-sm text-[var(--rift-text-secondary)]">
              The failure boundary was narrowed to the tested interval between {range.passingBoundMs!.toLocaleString()} ms and {range.failingBoundMs!.toLocaleString()} ms.
              Values inside this interval were not fully established.
            </p>
          ) : (
            <p className="mt-3 text-sm text-[var(--rift-text-secondary)]">Only one side of the boundary was recorded. This is not an exact causal threshold.</p>
          )}
          <p className="mt-2 text-sm text-[var(--rift-text-muted)]">Target precision: {range.targetPrecisionMs !== undefined ? `${range.targetPrecisionMs.toLocaleString()} ms` : 'Not recorded'}.</p>
          {range.testedPoints.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tested delay points">
              {range.testedPoints.map((point) => (
                <li key={`${point.valueMs}-${point.outcome}-${point.worldId ?? ''}`}><StatusBadge tone={businessOutcomeTone(point.outcome)}>{point.valueMs.toLocaleString()} ms · {humanize(point.outcome)}</StatusBadge></li>
              ))}
            </ul>
          ) : null}
        </>
      ) : categorical.length ? (
        <div className="mt-4">
          <p className="text-sm text-[var(--rift-text-secondary)]">This finding has categorical conditions, so a numeric scale would be misleading.</p>
          <div className="mt-3 overflow-hidden rounded-lg border border-[var(--rift-border)]" role="table" aria-label="Categorical failure boundary">
            {categorical.map((item) => <div className="grid gap-1 border-t border-[var(--rift-border)] px-3 py-2 first:border-t-0 sm:grid-cols-[1fr_1fr_auto]" key={`${item.role}-${item.key}`} role="row"><span className="font-medium" role="cell">{formatConditionKey(item.key)}</span><span className="text-sm text-[var(--rift-text-secondary)]" role="cell">{formatConditionValue(item.key, item.value)}</span><span className="text-xs text-[var(--rift-text-muted)]" role="cell">{item.role}</span></div>)}
          </div>
        </div>
      ) : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">No numeric or categorical failure boundary was recorded.</p>}
    </section>
  );
}

export function ReproductionSteps({ finding }: { finding: Finding | FindingDetail }) {
  const steps = reproductionSteps(finding);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'unavailable'>('idle');
  const copy = async () => {
    if (!steps.length || !globalThis.navigator?.clipboard) { setCopyState('unavailable'); return; }
    try {
      await globalThis.navigator.clipboard.writeText(steps.map((step, index) => `${index + 1}. ${step}`).join('\n'));
      setCopyState('copied');
    } catch { setCopyState('unavailable'); }
  };
  return (
    <section className="rounded-lg border border-[var(--rift-border)] p-4" id="reproduction-steps">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Deterministic steps</h3>{steps.length ? <button className="rift-button-secondary min-h-9 px-3 py-1.5 text-xs" onClick={() => void copy()} type="button">{copyState === 'copied' ? 'Copied' : copyState === 'unavailable' ? 'Copy unavailable' : 'Copy reproduction'}</button> : null}</div>
      {steps.length ? <ol className="mt-4 list-decimal space-y-2 pl-5 text-[var(--rift-text-secondary)]">{steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol> : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">Structured reproduction steps were not generated for this finding.</p>}
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
  const [view, setView] = useState('KEY');
  const [search, setSearch] = useState('');
  const groups = useMemo(() => evidenceStageGroups(evidence, { finding, worlds, experiments }), [evidence, experiments, finding, worlds]);
  const filters = ['KEY', 'REPRODUCTION', 'SCREENSHOT', 'TRACE', 'NETWORK_LOG', 'CONSOLE_LOG', 'FINAL_REPORT', 'ALL'];
  const keyEvidence = useMemo(() => selectKeyEvidence(evidence), [evidence]);
  const selectedGroups = view === 'KEY'
    ? { 'Key evidence': keyEvidence }
    : view === 'ALL'
      ? groups
      : view === 'REPRODUCTION'
        ? Object.fromEntries(Object.entries(groups).filter(([label]) => ['Exact reproduction', 'Final confirmation'].includes(label)))
        : { [humanize(view)]: evidence.filter((artifact) => artifact.type === view) };
  const visibleGroups = useMemo(() => Object.entries(selectedGroups).map(([label, items]) => {
    const filtered = items.filter((artifact) => {
      const haystack = `${artifact.id} ${artifact.type} ${evidenceFilename(artifact)} ${artifact.experimentId} ${JSON.stringify(artifact.metadata ?? {})}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
    return [label, filtered] as const;
  }), [search, selectedGroups]);
  const reproductionRuns = finding?.reproductionCount ?? 0;
  const reports = evidence.filter((artifact) => artifact.type === 'FINAL_REPORT').length;
  const divergenceTraces = evidence.filter((artifact) => JSON.stringify(artifact.metadata ?? {}).toLowerCase().includes('divergence')).length;
  return (
    <section className="card" id="evidence">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Evidence</h2>
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">Prioritised by relevance. Artifact bodies load only when opened.</p>
        </div>
        <input
          aria-label="Search evidence"
          className="rounded-lg border border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)] px-3 py-2 text-sm text-[var(--rift-text)]"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search filename, world, type…"
          value={search}
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--rift-border)] py-4 sm:grid-cols-4">
        <Metric label="Artifacts" value={evidence.length} />
        <Metric label="Reproduction runs" value={reproductionRuns} />
        <Metric label="Final reports" value={reports} />
        <Metric label="First-divergence traces" value={divergenceTraces} />
      </dl>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Evidence type filters">
        {filters.map((filter) => (
          <button
            className={`rounded-full px-3 py-1.5 text-xs ${view === filter ? 'bg-white text-black' : 'bg-[var(--rift-surface-raised)] text-[var(--rift-text-secondary)]'}`}
            key={filter}
            onClick={() => setView(filter)}
            role="tab"
            aria-selected={view === filter}
            type="button"
          >
            {filter === 'KEY' ? 'Key evidence' : filter === 'REPRODUCTION' ? 'Reproduction' : filter === 'FINAL_REPORT' ? 'Reports' : humanize(filter)}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-4">
        {visibleGroups.map(([label, items]) => (
          <details className="rounded-xl bg-[var(--rift-surface-raised)] p-3" key={`${view}-${label}`} open={label === 'Key evidence' || label === 'Final reports'}>
            <summary className="cursor-pointer font-semibold">{label} ({items.length})</summary>
            {items.length ? (
              <EvidenceGroupItems items={items} investigationId={investigationId} experiments={experiments} />
            ) : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">No {label.toLowerCase()} evidence is available.</p>}
          </details>
        ))}
      </div>
    </section>
  );
}

function evidencePriority(artifact: EvidenceArtifactResponse): number {
  const metadata = JSON.stringify(artifact.metadata ?? {}).toLowerCase();
  if (artifact.type === 'FINAL_REPORT') return 0;
  if (metadata.includes('first_divergence') || metadata.includes('first divergence')) return 1;
  if (artifact.type === 'TRACE') return 2;
  if (artifact.type === 'SCREENSHOT') return 3;
  if (artifact.type === 'NETWORK_LOG') return 4;
  if (artifact.type === 'ENVIRONMENT_MANIFEST') return 5;
  return 10;
}

function selectKeyEvidence(evidence: EvidenceArtifactResponse[]): EvidenceArtifactResponse[] {
  const sorted = [...evidence].sort((a, b) => evidencePriority(a) - evidencePriority(b) || a.createdAt.localeCompare(b.createdAt));
  const selected: EvidenceArtifactResponse[] = [];
  const add = (artifact: EvidenceArtifactResponse | undefined) => { if (artifact && !selected.some((item) => item.id === artifact.id)) selected.push(artifact); };
  sorted.filter((artifact) => artifact.type === 'FINAL_REPORT').slice(0, 2).forEach(add);
  add(sorted.find((artifact) => JSON.stringify(artifact.metadata ?? {}).toLowerCase().includes('divergence')));
  ['TRACE', 'SCREENSHOT', 'NETWORK_LOG', 'ENVIRONMENT_MANIFEST', 'CONSOLE_LOG', 'WORKER_RESULT'].forEach((type) => add(sorted.find((artifact) => artifact.type === type)));
  sorted.forEach((artifact) => { if (selected.length < 8) add(artifact); });
  return selected.slice(0, 8);
}

function evidenceRelevance(artifact: EvidenceArtifactResponse): string {
  if (artifact.type === 'FINAL_REPORT') return 'Investigation conclusion and supporting references.';
  if (artifact.type === 'TRACE') return 'Replayable browser execution around the observed failure.';
  if (artifact.type === 'SCREENSHOT') return 'Visual state captured during the relevant world.';
  if (artifact.type === 'NETWORK_LOG') return 'Request-level evidence for the observed outcome.';
  if (artifact.type === 'CONSOLE_LOG') return 'Runtime messages captured during execution.';
  if (artifact.type === 'ENVIRONMENT_MANIFEST') return 'Environment context needed to interpret the result.';
  return 'Supporting artifact captured during the investigation.';
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
        <button className="mt-3 rounded-lg border border-[var(--rift-border-strong)] px-3 py-2 text-xs text-[var(--rift-text)]" onClick={() => setLimit((value) => value + 8)} type="button">
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
    <div className="rounded-lg border border-[var(--rift-border)] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{humanize(artifact.type)}</span>
        <StatusBadge tone="neutral">{humanize(artifact.type)}</StatusBadge>
      </div>
      <p className="mt-1 text-sm text-[var(--rift-text-secondary)]">{evidenceRelevance(artifact)}</p>
      <dl className="mt-3 grid gap-2 text-xs text-[var(--rift-text-muted)] sm:grid-cols-3">
        <div><dt>Context</dt><dd>{worldId ? `World ${shortId(worldId, 10)}` : 'Investigation'}</dd></div>
        <div><dt>Created</dt><dd>{formatDate(artifact.createdAt)}</dd></div>
        <div><dt>Size</dt><dd>{artifact.sizeBytes.toLocaleString()} bytes</dd></div>
      </dl>
      <details className="mt-2"><summary className="cursor-pointer text-xs text-[var(--rift-text-muted)]">Technical filename</summary><p className="mt-1 break-all font-mono text-xs text-[var(--rift-text-secondary)]">{filename}</p></details>
      {artifact.type === 'FINAL_REPORT'
        ? <FinalReportPreview artifact={artifact} investigationId={investigationId} />
        : <p className="mt-2 text-xs text-[var(--rift-text-secondary)]">{artifact.type === 'SCREENSHOT'
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
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'View'} ${evidenceFilename(artifact)} report`}
        className="rounded-lg border border-[var(--rift-border-strong)] px-3 py-2 text-xs font-bold text-white"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? 'Hide report' : 'View report'}
      </button>
      {!open ? <p className="mt-2 text-xs text-[var(--rift-text-secondary)]">Report body is fetched only when opened.</p> : null}
      {open && query.isLoading ? <p className="mt-3 text-xs text-[var(--rift-text-secondary)]">Loading report content…</p> : null}
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
  return <p className="mt-3 rounded-lg border border-[var(--rift-border-strong)] bg-white/5 p-3 text-xs text-[var(--rift-text-secondary)]">{message}</p>;
}

export function ReportContent({ content }: { content: EvidenceTextContentResponse }) {
  if (content.format === 'JSON') return <JsonReport content={content.content} />;
  if (content.format === 'MARKDOWN') return <MarkdownReport content={content.content} />;
  return <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[var(--rift-surface-raised)] p-3 text-xs text-[var(--rift-text-secondary)] whitespace-pre-wrap">{content.content}</pre>;
}

function MarkdownReport({ content }: { content: string }) {
  return (
    <div className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-[var(--rift-surface-raised)] p-4 text-sm text-[var(--rift-text-secondary)]">
      {content.split(/\r?\n/).map((line, index) => {
        if (line.startsWith('# ')) return <h3 className="mt-2 text-lg font-bold text-[var(--rift-text)]" key={`${index}-${line}`}>{line.slice(2)}</h3>;
        if (line.startsWith('## ')) return <h4 className="mt-3 font-bold text-[var(--rift-text)]" key={`${index}-${line}`}>{line.slice(3)}</h4>;
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
    return <p className="mt-3 rounded-lg border border-[var(--rift-border-strong)] bg-white/5 p-3 text-xs text-[var(--rift-text-secondary)]">Final report JSON could not be parsed safely.</p>;
  }
  const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const rows = ['reportVersion', 'summary', 'businessImpact', 'originalObservation', 'reproduction', 'minimisation', 'confidence', 'retainedConditions', 'removedConditions', 'boundedRange', 'reproductionSteps', 'evidenceReferences', 'limitations', 'provenance'];
  return (
    <div className="mt-3 rounded-lg bg-[var(--rift-surface-raised)] p-4 text-sm">
      <dl className="grid gap-3">
        {rows.filter((key) => record[key] !== undefined).map((key) => (
          <div key={key}>
            <dt className="text-xs uppercase tracking-widest text-[var(--rift-text-muted)]">{humanize(key)}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-[var(--rift-text-secondary)]">{formatValue(record[key])}</dd>
          </div>
        ))}
      </dl>
      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-bold text-white">Raw JSON</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-[var(--rift-surface-raised)] p-3 text-xs text-[var(--rift-text-secondary)]">{JSON.stringify(parsed, null, 2)}</pre>
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
  repairVerification,
}: {
  finding: FindingDetail;
  investigationStatus?: string | undefined;
  worlds?: InvestigationWorld[];
  experiments?: InvestigationExperiment[];
  evidence?: EvidenceArtifactResponse[];
  repairVerification?: ReactNode;
}) {
  const retained = conditionRecord(finding, 'retainedConditions');
  const removed = conditionRecord(finding, 'removedConditions');
  const inconclusive = conditionRecord(finding, 'inconclusiveConditions');
  const allEvidence = evidence ?? finding.evidence;
  const limitations = findingList(finding, 'limitations');
  const businessImpact = findingText(finding, 'businessImpact') ?? 'Business impact was not provided for this finding.';
  const confidenceExplanation = findingTextOrList(finding, 'confidenceExplanation');
  const reproducedRuns = finding.reproductionCount;
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
      <section className="card border border-[var(--rift-border-strong)]" aria-labelledby="finding-summary-heading">
        <h2 className="text-xl font-bold" id="finding-summary-heading">Finding summary</h2>
        <div className="mt-5 grid gap-x-8 gap-y-5 border-t border-[var(--rift-border)] pt-5 md:grid-cols-2">
          <SummaryBlock title="Impact">{businessImpact}</SummaryBlock>
          <SummaryBlock title="Required conditions">{Object.keys(retained).length ? Object.entries(retained).map(([key, value]) => `${formatConditionKey(key)}: ${formatConditionValue(key, value)}`).join(' · ') : 'No required conditions were recorded.'}</SummaryBlock>
          <SummaryBlock title="Reproduction">{reproducedRuns.toLocaleString()} successful · {contradictoryRuns.toLocaleString()} control or contradictory</SummaryBlock>
          <SummaryBlock title="Confidence">{finding.confidence}{confidenceExplanation ? ` — ${confidenceExplanation}` : ''}</SummaryBlock>
          <SummaryBlock title="First observed">{formatDate(finding.createdAt)}</SummaryBlock>
          {findingList(finding, 'failedInvariantIds').length ? <SummaryBlock title="Failed invariants">{findingList(finding, 'failedInvariantIds').join(', ')}</SummaryBlock> : null}
          {findingText(finding, 'firstDivergence') ? <SummaryBlock title="First divergence">{findingText(finding, 'firstDivergence')}</SummaryBlock> : null}
        </div>
      </section>
      <TechnicalMetadata finding={finding} investigationStatus={investigationStatus} />
      <section className="card" aria-labelledby="reproduction-heading">
        <h2 className="text-xl font-bold" id="reproduction-heading">Reproduce this failure</h2>
        <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">Uses the exact persisted steps and the minimum tested condition set recorded by the investigation.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--rift-border)] py-4 sm:grid-cols-4">
          <Metric label="Confidence" value={finding.confidence} />
          <Metric label="Successful" value={reproducedRuns} />
          <Metric label="Controlled comparisons" value={contradictoryRuns} />
          <Metric label="Required conditions" value={Object.keys(retained).length} />
        </dl>
        <div className="mt-4"><ReproductionSteps finding={finding} /></div>
      </section>
      <section className="card" aria-labelledby="conditions-heading">
        <h2 className="text-xl font-bold" id="conditions-heading">Conditions and boundary</h2>
        <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">One combined view of the minimum tested condition set. “Required” means retained by the recorded minimisation, not globally proven.</p>
        <ConditionAnalysis retained={retained} removed={removed} inconclusive={inconclusive} />
        <div className="mt-5"><FailureRange finding={finding} boundary={boundary} /></div>
      </section>
      <CausalSequence finding={finding} />
      <details className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[var(--rift-text)] marker:hidden">Supporting experiment record</summary>
        <div className="border-t border-[var(--rift-border)] p-5">
          <ExperimentHistory worlds={worlds} experiments={experiments} evidence={allEvidence} />
        </div>
      </details>
      <EvidenceViewer evidence={allEvidence} investigationId={finding.investigationId} finding={finding} worlds={worlds} experiments={experiments} />
      {repairVerification}
      <details className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[var(--rift-text)] marker:hidden">Limitations</summary>
        <div className="border-t border-[var(--rift-border)] px-5 py-4">
          {limitations.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--rift-text-secondary)]">{limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-[var(--rift-text-secondary)]">No specific limitations were recorded for this finding.</p>}
        </div>
      </details>
    </div>
  );
}

function SummaryBlock({ title, children }: { title: string; children: ReactNode }) {
  return <div><h3 className="text-xs font-medium text-[var(--rift-text-muted)]">{title}</h3><p className="mt-1 text-sm text-[var(--rift-text-secondary)]">{children}</p></div>;
}

function ConditionAnalysis({ retained, removed, inconclusive }: { retained: Record<string, unknown>; removed: Record<string, unknown>; inconclusive: Record<string, unknown> }) {
  const groups = [
    { label: 'Required', conditions: retained, tone: 'fail' as const, empty: 'No required conditions recorded.' },
    { label: 'Not required', conditions: removed, tone: 'pass' as const, empty: 'No removed conditions recorded.' },
    { label: 'Inconclusive', conditions: inconclusive, tone: 'pending' as const, empty: 'None recorded.' },
  ];
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      {groups.map((group) => <section className="rounded-lg border border-[var(--rift-border)] p-4" key={group.label}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{group.label}</h3><StatusBadge tone={group.tone}>{Object.keys(group.conditions).length}</StatusBadge></div>{Object.keys(group.conditions).length ? <dl className="mt-3 space-y-3">{Object.entries(group.conditions).map(([key, value]) => <div key={key}><dt className="text-xs text-[var(--rift-text-muted)]">{formatConditionKey(key)}</dt><dd className="mt-0.5 text-sm text-[var(--rift-text-secondary)]">{formatConditionValue(key, value)}</dd></div>)}</dl> : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">{group.empty}</p>}</section>)}
    </div>
  );
}

function TechnicalMetadata({ finding, investigationStatus }: { finding: FindingDetail; investigationStatus?: string | undefined }) {
  const conditions = causalConditions(finding);
  const rows = ([
    ['Investigation ID', finding.investigationId], ['Finding ID', finding.id], ['World ID', conditions.sourceWorldId ?? conditions.worldId],
    ['Experiment ID', conditions.sourceExperimentId ?? conditions.experimentId], ['Minimisation run ID', conditions.minimisationRunId],
    ['Investigation status', investigationStatus], ['Created', formatDate(finding.createdAt)], ['Updated', formatDate(finding.updatedAt)],
  ] as [string, unknown][]).filter((row) => row[1] !== undefined && row[1] !== null);
  return <details className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]"><summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold marker:hidden">Technical metadata</summary><dl className="grid gap-3 border-t border-[var(--rift-border)] p-5 sm:grid-cols-2">{rows.map(([label, value]) => <div key={String(label)}><dt className="text-xs text-[var(--rift-text-muted)]">{label}</dt><dd className="mt-1 break-all font-mono text-xs text-[var(--rift-text-secondary)]">{formatValue(value)}</dd></div>)}</dl></details>;
}

function ExperimentHistory({ worlds, experiments, evidence }: { worlds: InvestigationWorld[]; experiments: InvestigationExperiment[]; evidence: EvidenceArtifactResponse[] }) {
  const rows = useMemo(() => experimentHistoryRows(worlds, experiments, evidence), [evidence, experiments, worlds]);
  if (!rows.length) return <PanelState title="Experiment history">No world history was available for this finding.</PanelState>;
  return (
    <section className="card">
      <h2 className="font-bold">Experiment history</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-widest text-[var(--rift-text-muted)]">
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
              <tr className="border-t border-[var(--rift-border)]" key={row.worldId}>
                <td className="py-2 pr-4 font-mono text-xs" title={row.worldId}>{shortId(row.worldId, 14)}</td>
                <td className="py-2 pr-4">{humanize(row.stage)}</td>
                <td className="py-2 pr-4">{row.purpose}</td>
                <td className="py-2 pr-4"><StatusBadge tone={businessOutcomeTone(row.outcome)}>{row.outcome}</StatusBadge></td>
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
    <section className="card" aria-labelledby="causal-explanation-heading">
      <h2 className="text-xl font-bold" id="causal-explanation-heading">Causal explanation</h2>
      <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">Evidence-supported sequence recorded by the investigation. It does not imply stronger causality than the underlying comparisons.</p>
      {sequence.length ? (
        <ol className="mt-4 grid gap-2 text-sm text-[var(--rift-text-secondary)] md:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
          {sequence.map((item, index) => <li className="flex items-center gap-2" key={`${index}-${item}`}><span className="flex-1 rounded-lg border border-[var(--rift-border)] p-3">{item}</span>{index < sequence.length - 1 ? <span aria-hidden="true" className="hidden text-[var(--rift-text-muted)] md:block">→</span> : null}</li>)}
        </ol>
      ) : <p className="mt-3 text-sm text-[var(--rift-text-muted)]">A structured causal sequence was not recorded for this finding.</p>}
    </section>
  );
}
