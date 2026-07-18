import { ArrowRight, Clock3, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MappedSemanticBadge, MappedSemanticStatus, SemanticStatus } from '../../components/semantic-status.js';
import {
  findingSeverityStatus,
  findingStateStatus,
  investigationExecutionStatus,
  investigationPhaseStatus,
  projectReadinessStatus,
  type SemanticTone,
} from './dashboard-semantic-status.js';
import {
  compactFindingTitle,
  compactInvestigationTitle,
  displayProjectName,
} from './dashboard-display.js';
import { createDashboardViewModel, type DashboardProjectView } from './dashboard.model.js';
import { dashboardRoutes } from './dashboard.routes.js';
import type {
  DashboardActivityAvailability,
  DashboardData,
  DashboardFindingSummary,
  DashboardInvestigationSummary,
} from './dashboard.types.js';

export interface ProductDashboardProps {
  data: DashboardData;
  canCreateProject?: boolean;
  activityAvailability?: {
    investigations: DashboardActivityAvailability;
    findings: DashboardActivityAvailability;
  };
}

export function ProductDashboard({
  data,
  activityAvailability,
  canCreateProject = true,
}: ProductDashboardProps) {
  const dashboard = createDashboardViewModel(data);
  const primary = dashboard.primaryProject;
  const current = dashboard.recentInvestigations.find((item) => isActive(item.status))
    ?? dashboard.recentInvestigations[0];
  const attention = dashboard.recentFindings.find((item) => isAttention(item.severity))
    ?? dashboard.projects.find((item) => !item.ready);
  const primaryAction = primary
    ? primary.ready
      ? { href: primary.startInvestigationHref, label: 'Start investigation' }
      : { href: primary.continueSetupHref, label: 'Continue setup' }
    : canCreateProject
      ? { href: dashboardRoutes.createProject, label: 'Create project' }
      : undefined;

  return (
    <section aria-labelledby="product-dashboard-title" className="mx-auto min-w-0 max-w-[1280px] space-y-6">
      <header className="flex flex-col gap-5 border-b border-[var(--rift-border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-3xl font-semibold tracking-[-0.045em] text-[var(--rift-text)] lg:text-[2.5rem]"
            id="product-dashboard-title"
          >
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
            Operational view for investigations, findings, and release readiness.
          </p>
        </div>
        {primaryAction ? (
          <Link className="rift-button-primary shrink-0 gap-2" to={primaryAction.href}>
            <Play aria-hidden="true" size={14} />
            {primaryAction.label}
          </Link>
        ) : null}
      </header>

      <MetricsRail dashboard={dashboard} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <CurrentInvestigation
          availability={activityAvailability?.investigations ?? 'available'}
          item={current}
        />
        <NeedsAttention item={attention} />
      </div>

      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <RecentInvestigations
          availability={activityAvailability?.investigations ?? 'available'}
          items={dashboard.recentInvestigations}
        />
        <ProjectReadiness projects={dashboard.projects} />
      </div>

      <RecentFindings
        availability={activityAvailability?.findings ?? 'available'}
        items={dashboard.recentFindings}
      />
    </section>
  );
}

function MetricsRail({ dashboard }: { dashboard: ReturnType<typeof createDashboardViewModel> }) {
  const activeCount = dashboard.recentInvestigations.filter((item) => isActive(item.status)).length;
  const entries = [
    { label: 'Active investigations', value: String(activeCount), detail: activeCount ? 'Currently running' : 'None currently running', tone: activeCount ? 'running' : 'neutral' },
    { label: 'Recent investigations', value: String(dashboard.totals.recentInvestigationCount), detail: 'Across all Projects', tone: 'neutral' },
    { label: 'Open findings', value: String(dashboard.totals.openFindingCount), detail: dashboard.totals.openFindingCount ? 'Awaiting review' : 'No open findings', tone: dashboard.totals.openFindingCount ? 'pending' : 'pass' },
    { label: 'Ready projects', value: `${dashboard.totals.readyProjectCount}/${dashboard.totals.projectCount}`, detail: dashboard.totals.projectCount && dashboard.totals.readyProjectCount === dashboard.totals.projectCount ? 'All configured to run' : 'Configuration incomplete', tone: dashboard.totals.projectCount === 0 ? 'neutral' : dashboard.totals.readyProjectCount === dashboard.totals.projectCount ? 'pass' : 'pending' },
  ] satisfies Array<{ label: string; value: string; detail: string; tone: SemanticTone }>;

  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map((entry) => (
        <div className="rift-surface rounded-lg px-4 py-3.5" key={entry.label}>
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--rift-text-muted)]">
            {entry.label}
          </dt>
          <dd className="mt-2 flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold tracking-[-0.04em] text-[var(--rift-text)]">{entry.value}</span>
            <SemanticStatus label={entry.detail} tone={entry.tone} />
          </dd>
          <p className="mt-1 text-xs text-[var(--rift-text-muted)]">{entry.detail}</p>
        </div>
      ))}
    </dl>
  );
}

function CurrentInvestigation({
  item,
  availability,
}: {
  item: DashboardInvestigationSummary | undefined;
  availability: DashboardActivityAvailability;
}) {
  return (
    <DashboardPanel
      action={item ? { href: dashboardRoutes.investigation(item.id), label: 'Open investigation' } : undefined}
      eyebrow="Current investigation"
      title={item ? compactInvestigationTitle(item.name, item.projectName) : 'No investigation running'}
    >
      {availability === 'unavailable' ? <AvailabilityNote /> : item ? (
        <div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--rift-text-secondary)]">
            <MappedSemanticBadge status={investigationExecutionStatus(item.status)} />
            <span>{displayProjectName(item.projectName)}</span>
            {item.findingCount !== undefined ? <span>{pluralize(item.findingCount, 'finding')}</span> : null}
            {item.createdAt ? <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" size={14} />{formatDate(item.createdAt)}</span> : null}
          </div>
          <InvestigationTimeline status={item.status} />
        </div>
      ) : (
        <EmptyCopy>Start an investigation from a ready Project when you need fresh evidence.</EmptyCopy>
      )}
    </DashboardPanel>
  );
}

function InvestigationTimeline({ status }: { status: string }) {
  const steps = ['Plan', 'Provision', 'Observe', 'Adapt', 'Reproduce', 'Minimise', 'Complete'];
  const activeIndex = timelineIndex(status);
  return (
    <div className="mt-6 border-t border-[var(--rift-border)] pt-4">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--rift-text-muted)]">
        Investigation timeline
      </p>
      <ol className="grid grid-cols-7" aria-label="Investigation timeline">
        {steps.map((step, index) => {
          const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
          const state = index < activeIndex || (status === 'COMPLETED' && index === activeIndex)
            ? 'completed'
            : index === activeIndex
              ? status === 'FAILED' ? 'failed' : status === 'CANCELLED' ? 'future' : status === 'QUEUED' ? 'pending' : 'active'
              : 'future';
          const semantic = investigationPhaseStatus(state);
          return (
            <li aria-label={`${step}: ${semantic.label}`} className="relative min-w-0 pr-2 last:pr-0" data-tone={semantic.tone} key={step}>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className={`absolute left-2 top-[3px] h-px w-[calc(100%-4px)] ${index < activeIndex || (terminal && index === activeIndex && status === 'COMPLETED') ? 'bg-[var(--status-pass-indicator)]' : 'bg-[var(--rift-border-strong)]'}`} />
              ) : null}
              <span aria-hidden="true" className={`rift-semantic-dot rift-semantic-dot--${semantic.tone} relative block`} />
              <span className={`mt-2 block truncate text-[10px] uppercase tracking-[0.08em] rift-semantic-label--${semantic.tone}`}>{step}</span>
              <span className="sr-only">{semantic.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function NeedsAttention({ item }: { item: DashboardFindingSummary | DashboardProjectView | undefined }) {
  const finding = item && 'severity' in item ? item : undefined;
  const project = item && 'project' in item ? item : undefined;
  return (
    <DashboardPanel
      action={finding?.investigationId
        ? { href: dashboardRoutes.finding(finding.investigationId, finding.id), label: 'Review finding' }
        : project
          ? { href: project.continueSetupHref, label: 'Continue setup' }
          : undefined}
      eyebrow="Needs attention"
      title={finding ? compactFindingTitle(finding.title) : project ? displayProjectName(project.project.name) : 'Nothing needs attention'}
    >
      {finding ? (
        <div className="space-y-2 text-sm text-[var(--rift-text-secondary)]">
          <p className="flex flex-wrap items-center gap-2"><MappedSemanticBadge status={findingSeverityStatus(finding.severity)} /><MappedSemanticBadge status={findingStateStatus(finding.status)} /></p>
          <p className="text-xs text-[var(--rift-text-muted)]">{displayProjectName(finding.projectName)}</p>
        </div>
      ) : project ? (
        <div className="space-y-2 text-sm text-[var(--rift-text-secondary)]">
          <MappedSemanticStatus status={projectReadinessStatus(false)} />
          <p className="text-xs leading-5 text-[var(--rift-text-muted)]">Finish configuration before launching an investigation.</p>
        </div>
      ) : (
        <EmptyCopy>All Projects are configured and no recent critical Finding requires review.</EmptyCopy>
      )}
    </DashboardPanel>
  );
}

function RecentInvestigations({
  items,
  availability,
}: {
  items: DashboardInvestigationSummary[];
  availability: DashboardActivityAvailability;
}) {
  return (
    <DashboardPanel eyebrow="Activity" title="Recent investigations">
      {availability === 'unavailable' ? <AvailabilityNote /> : items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-left text-sm">
            <thead className="border-b border-[var(--rift-border)] text-[10px] uppercase tracking-[0.13em] text-[var(--rift-text-muted)]">
              <tr>
                <th className="pb-2.5 font-medium">Investigation</th>
                <th className="pb-2.5 font-medium">Project</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rift-border)]">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="max-w-64 py-3 pr-4 font-medium text-[var(--rift-text)]">
                    <Link className="block truncate hover:text-white" to={dashboardRoutes.investigation(item.id)}>{compactInvestigationTitle(item.name, item.projectName)}</Link>
                  </td>
                  <td className="py-3 pr-4 text-[var(--rift-text-secondary)]">{displayProjectName(item.projectName)}</td>
                  <td className="py-3 pr-4"><MappedSemanticBadge status={investigationExecutionStatus(item.status)} /></td>
                  <td className="py-3 text-right text-[var(--rift-text-muted)]">{item.createdAt ? formatDate(item.createdAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyCopy>No completed or active investigations have been recorded for this organisation.</EmptyCopy>
      )}
    </DashboardPanel>
  );
}

function ProjectReadiness({ projects }: { projects: DashboardProjectView[] }) {
  return (
    <DashboardPanel eyebrow="Configuration" title="Project readiness">
      {projects.length ? (
        <ul className="divide-y divide-[var(--rift-border)]">
          {projects.map((item) => (
            <li className="py-3 first:pt-0 last:pb-0" key={item.project.id}>
              <div className="flex items-center justify-between gap-3">
                <Link className="min-w-0 truncate text-sm font-medium text-[var(--rift-text)] hover:text-white" to={item.projectHref}>{displayProjectName(item.project.name)}</Link>
                <MappedSemanticBadge status={projectReadinessStatus(item.ready)} />
              </div>
              <p className="mt-1.5 text-xs leading-5 text-[var(--rift-text-muted)]">
                {item.project.readyEnvironmentCount}/{item.project.totalEnvironmentCount} environments · {item.project.readyJourneyCount}/{item.project.totalJourneyCount} journeys · {item.project.readyInvariantCount}/{item.project.totalInvariantCount} invariants
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyCopy>No Project configuration is available yet.</EmptyCopy>
      )}
    </DashboardPanel>
  );
}

function RecentFindings({
  items,
  availability,
}: {
  items: DashboardFindingSummary[];
  availability: DashboardActivityAvailability;
}) {
  return (
    <DashboardPanel eyebrow="Risk" title="Recent findings">
      {availability === 'unavailable' ? <AvailabilityNote /> : items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] text-left text-sm">
            <thead className="border-b border-[var(--rift-border)] text-[10px] uppercase tracking-[0.13em] text-[var(--rift-text-muted)]">
              <tr><th className="pb-2.5 font-medium">Finding</th><th className="pb-2.5 font-medium">Project</th><th className="pb-2.5 font-medium">Severity</th><th className="pb-2.5 font-medium">Status</th><th className="pb-2.5 text-right font-medium">Reported</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--rift-border)]">
              {items.map((item) => {
                const href = item.investigationId ? dashboardRoutes.finding(item.investigationId, item.id) : dashboardRoutes.project(item.projectId);
                return (
                  <tr key={item.id}>
                    <td className="max-w-72 py-3 pr-4 font-medium text-[var(--rift-text)]"><Link className="block truncate hover:text-white" to={href}>{compactFindingTitle(item.title)}</Link></td>
                    <td className="py-3 pr-4 text-[var(--rift-text-secondary)]">{displayProjectName(item.projectName)}</td>
                    <td className="py-3 pr-4"><MappedSemanticBadge status={findingSeverityStatus(item.severity)} /></td>
                    <td className="py-3 pr-4"><MappedSemanticBadge status={findingStateStatus(item.status)} /></td>
                    <td className="py-3 text-right text-[var(--rift-text-muted)]">{item.createdAt ? formatDate(item.createdAt) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyCopy>No recent Findings. New evidence-backed risks will appear here.</EmptyCopy>
      )}
    </DashboardPanel>
  );
}

function DashboardPanel({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: { href: string; label: string } | undefined;
  children: ReactNode;
}) {
  return (
    <section className="rift-surface h-full rounded-xl p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-1.5 truncate text-lg font-semibold tracking-[-0.025em] text-[var(--rift-text)]">{title}</h2>
        </div>
        {action ? (
          <Link className="rift-button-secondary min-h-9 shrink-0 px-3 py-1.5 text-xs" to={action.href}>
            {action.label}<ArrowRight aria-hidden="true" className="ml-1.5" size={13} />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function AvailabilityNote() {
  return <p className="text-sm text-[var(--rift-text-muted)]">Activity is temporarily unavailable. Configuration remains available.</p>;
}

function EmptyCopy({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-[var(--rift-text-secondary)]">{children}</p>;
}

function isActive(status: string) {
  return ['RUNNING', 'QUEUED', 'PLANNING', 'PROVISIONING', 'OBSERVING', 'ADAPTING', 'REPRODUCING', 'MINIMISING'].includes(status);
}

function isAttention(severity: string) {
  return ['CRITICAL', 'HIGH'].includes(severity);
}

function timelineIndex(status: string) {
  if (status === 'PLANNING' || status === 'QUEUED') return 0;
  if (status === 'PROVISIONING') return 1;
  if (status === 'OBSERVING' || status === 'RUNNING') return 2;
  if (status === 'ADAPTING') return 3;
  if (status === 'REPRODUCING') return 4;
  if (status === 'MINIMISING') return 5;
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) return 6;
  return 0;
}

function pluralize(value: number, label: string) {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
