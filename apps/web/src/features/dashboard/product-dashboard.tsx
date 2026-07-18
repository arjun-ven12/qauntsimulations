import { ArrowRight, Clock3, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { createDashboardViewModel, type DashboardProjectView } from './dashboard.model.js';
import type {
  DashboardActivityAvailability,
  DashboardData,
  DashboardFindingSummary,
  DashboardInvestigationSummary,
} from './dashboard.types.js';
import { dashboardRoutes } from './dashboard.routes.js';

type Tone = 'pass' | 'warning' | 'fail' | 'muted';

export interface ProductDashboardProps {
  data: DashboardData;
  canCreateProject?: boolean;
  activityAvailability?: {
    investigations: DashboardActivityAvailability;
    findings: DashboardActivityAvailability;
  };
}

export function ProductDashboard({ data, activityAvailability, canCreateProject = true }: ProductDashboardProps) {
  const dashboard = createDashboardViewModel(data);
  const primary = dashboard.primaryProject;
  const current = dashboard.recentInvestigations.find((item) => isRunning(item.status)) ?? dashboard.recentInvestigations[0];
  const attention = dashboard.recentFindings.find((item) => isAttention(item.severity)) ?? dashboard.projects.find((item) => !item.ready);
  const nextAction = primary
    ? primary.ready
      ? { href: primary.startInvestigationHref, label: 'Start investigation' }
      : { href: primary.continueSetupHref, label: 'Continue setup' }
    : canCreateProject
      ? { href: dashboardRoutes.createProject, label: 'Create project' }
      : undefined;

  return (
    <section aria-labelledby="product-dashboard-title" className="mx-auto max-w-[1240px] min-w-0 space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--rift-border)] pb-6">
        <div>
          <p className="eyebrow">{dashboard.organisation.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--rift-text)] lg:text-4xl" id="product-dashboard-title">Dashboard</h1>
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">Operational view for investigations, findings, and release readiness.</p>
        </div>
        {nextAction ? <Link className="rift-button-primary gap-2" to={nextAction.href}><Play aria-hidden="true" size={15} /> {nextAction.label}</Link> : null}
      </header>

      <MetricsRail dashboard={dashboard} current={current} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <CurrentInvestigation item={current} availability={activityAvailability?.investigations ?? 'available'} />
        <NeedsAttention item={attention} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <RecentInvestigations items={dashboard.recentInvestigations} availability={activityAvailability?.investigations ?? 'available'} />
        <ProjectReadiness projects={dashboard.projects} />
      </div>

      <ExecutionOverview overview={dashboard.executionOverview} />

      <RecentFindings items={dashboard.recentFindings} availability={activityAvailability?.findings ?? 'available'} />
    </section>
  );
}

function MetricsRail({ dashboard, current }: { dashboard: ReturnType<typeof createDashboardViewModel>; current: DashboardInvestigationSummary | undefined }) {
  const entries = [
    { label: 'Investigation', value: current ? humanize(current.status) : 'Idle', tone: current ? statusTone(current.status) : 'muted' },
    { label: 'Recent findings', value: String(dashboard.totals.openFindingCount), tone: dashboard.totals.openFindingCount ? 'fail' : 'pass' },
    { label: 'Ready projects', value: `${dashboard.totals.readyProjectCount}/${dashboard.totals.projectCount}`, tone: dashboard.totals.readyProjectCount === dashboard.totals.projectCount ? 'pass' : 'warning' },
    { label: 'Recent activity', value: String(dashboard.totals.recentInvestigationCount), tone: 'muted' },
  ] satisfies Array<{ label: string; value: string; tone: Tone }>;
  return <dl className="grid divide-y divide-[var(--rift-border)] border-y border-[var(--rift-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">{entries.map((entry) => <div className="flex items-center justify-between gap-3 px-0 py-4 sm:px-4 first:sm:pl-0 last:xl:pr-0" key={entry.label}><dt className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">{entry.label}</dt><dd className="flex items-center gap-2 text-sm font-semibold text-[var(--rift-text)]"><StatusDot tone={entry.tone} />{entry.value}</dd></div>)}</dl>;
}

function CurrentInvestigation({ item, availability }: { item: DashboardInvestigationSummary | undefined; availability: DashboardActivityAvailability }) {
  return <DashboardSection eyebrow="Current investigation" title={item ? (item.name ?? item.projectName) : 'No investigation running'} action={item ? { href: dashboardRoutes.investigation(item.id), label: 'Open investigation' } : undefined}>
    {availability === 'unavailable' ? <AvailabilityNote /> : item ? <div className="space-y-4"><div className="flex flex-wrap items-center gap-3 text-sm text-[var(--rift-text-secondary)]"><StatusDot tone={statusTone(item.status)} /><span>{humanize(item.status)}</span><span className="text-[var(--rift-text-muted)]">{item.projectName}</span></div><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--rift-text-secondary)]"><span>{optionalCount(item.worldCount, 'world')}</span><span>{optionalCount(item.findingCount, 'finding')}</span>{item.createdAt ? <span className="inline-flex items-center gap-1"><Clock3 aria-hidden="true" size={14} /> {formatDate(item.createdAt)}</span> : null}</div></div> : <EmptyCopy>Start an investigation from a READY Project when you need fresh evidence.</EmptyCopy>}
  </DashboardSection>;
}

function NeedsAttention({ item }: { item: DashboardFindingSummary | DashboardProjectView | undefined }) {
  const finding = item && 'severity' in item ? item : undefined;
  const project = item && 'project' in item ? item : undefined;
  return <DashboardSection eyebrow="Needs attention" title={finding ? finding.title : project ? project.project.name : 'Nothing needs attention'} action={finding?.investigationId ? { href: dashboardRoutes.finding(finding.investigationId, finding.id), label: 'Review finding' } : project ? { href: project.continueSetupHref, label: 'Continue setup' } : undefined}>
    {finding ? <div className="space-y-3"><div className="flex items-center gap-2 text-sm font-medium text-[var(--rift-text-secondary)]"><StatusDot tone="fail" />{humanize(finding.severity)} · {humanize(finding.status)}</div><p className="text-sm text-[var(--rift-text-secondary)]">{finding.projectName}</p></div> : project ? <div className="space-y-3"><div className="flex items-center gap-2 text-sm text-[var(--rift-text-secondary)]"><StatusDot tone="warning" />Setup is incomplete</div><p className="text-sm text-[var(--rift-text-secondary)]">Finish configuration before launching this Project.</p></div> : <EmptyCopy>All Projects are configured and no recent critical Finding requires review.</EmptyCopy>}
  </DashboardSection>;
}

function RecentInvestigations({ items, availability }: { items: DashboardInvestigationSummary[]; availability: DashboardActivityAvailability }) {
  return <DashboardSection eyebrow="Activity" title="Recent investigations" action={items[0] ? { href: dashboardRoutes.investigation(items[0].id), label: 'Open latest' } : undefined}>
    {availability === 'unavailable' ? <AvailabilityNote /> : items.length ? <ul className="divide-y divide-[var(--rift-border)]">{items.map((item) => <li key={item.id}><Link className="group flex min-h-16 items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" to={dashboardRoutes.investigation(item.id)}><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--rift-text)]">{item.name ?? item.projectName}</p><p className="mt-1 text-xs text-[var(--rift-text-muted)]">{item.projectName} · {item.createdAt ? formatDate(item.createdAt) : 'Date unavailable'}</p></div><span className="flex shrink-0 items-center gap-2 text-xs font-medium text-[var(--rift-text-secondary)]"><StatusDot tone={statusTone(item.status)} />{humanize(item.status)}<ArrowRight aria-hidden="true" className="opacity-0 transition group-hover:opacity-100" size={14} /></span></Link></li>)}</ul> : <EmptyCopy>No completed or active investigations have been recorded for this organisation.</EmptyCopy>}
  </DashboardSection>;
}

function ProjectReadiness({ projects }: { projects: DashboardProjectView[] }) {
  return <DashboardSection eyebrow="Configuration" title="Project readiness" action={projects[0] ? { href: projects[0].projectHref, label: 'Open project' } : undefined}>
    {projects.length ? <ul className="divide-y divide-[var(--rift-border)]">{projects.map((item) => <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={item.project.id}><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--rift-text)]">{item.project.name}</p><p className="mt-1 text-xs text-[var(--rift-text-muted)]">{item.project.readyEnvironmentCount}/{item.project.totalEnvironmentCount} environments · {item.project.readyJourneyCount}/{item.project.totalJourneyCount} journeys · {item.project.readyInvariantCount}/{item.project.totalInvariantCount} invariants</p></div><span className="flex shrink-0 items-center gap-2 text-xs font-medium text-[var(--rift-text-secondary)]"><StatusDot tone={item.ready ? 'pass' : 'warning'} />{item.ready ? 'Ready' : 'Setup'}</span></li>)}</ul> : <EmptyCopy>Create a Project to establish a safe investigation boundary.</EmptyCopy>}
  </DashboardSection>;
}

function ExecutionOverview({
  overview,
}: {
  overview: ReturnType<typeof createDashboardViewModel>['executionOverview'];
}) {
  const metrics = [
    {
      label: 'Completion rate',
      value: overview.completionRate === null ? '—' : `${overview.completionRate}%`,
      detail: overview.completionRate === null ? 'No concluded investigations' : 'Concluded recent investigations',
    },
    {
      label: 'Open findings',
      value: String(overview.openFindingCount),
      detail: 'Across recent investigations',
      tone: overview.openFindingCount ? 'fail' : 'pass',
    },
    {
      label: 'Repairs verified',
      value: '—',
      detail: 'Not available in this view',
    },
  ] satisfies Array<{ label: string; value: string; detail: string; tone?: Tone }>;

  return (
    <section aria-labelledby="execution-overview-title" className="rift-surface overflow-hidden rounded-xl">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)]">
        <div className="flex min-h-64 flex-col justify-between p-6 sm:p-7">
          <div>
            <p className="eyebrow">Execution overview</p>
            <h2 className="sr-only" id="execution-overview-title">Execution overview</h2>
          </div>
          <div>
            <p className="text-6xl font-semibold tracking-[-0.07em] text-[var(--rift-text)] sm:text-7xl">
              {overview.worldsExecuted ?? '—'}
            </p>
            <p className="mt-4 text-sm text-[var(--rift-text-secondary)]">
              {overview.worldsExecuted === null
                ? 'World execution volume is not available for recent investigations.'
                : 'Worlds executed across recent investigations'}
            </p>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">
            Recent execution volume
          </p>
        </div>

        <dl className="divide-y divide-[var(--rift-border)] border-t border-[var(--rift-border)] xl:border-l xl:border-t-0">
          {metrics.map((metric) => (
            <div className="flex min-h-[calc(16rem/3)] flex-col justify-center px-6 py-5 sm:px-7" key={metric.label}>
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">
                {metric.tone ? <StatusDot tone={metric.tone} /> : null}
                {metric.label}
              </dt>
              <dd className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--rift-text)]">{metric.value}</dd>
              <p className="mt-1 text-xs text-[var(--rift-text-muted)]">{metric.detail}</p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function RecentFindings({ items, availability }: { items: DashboardFindingSummary[]; availability: DashboardActivityAvailability }) {
  return <DashboardSection action={undefined} eyebrow="Risk" title="Recent findings">
    {availability === 'unavailable' ? <AvailabilityNote /> : items.length ? <ul className="divide-y divide-[var(--rift-border)]">{items.map((item) => { const href = item.investigationId ? dashboardRoutes.finding(item.investigationId, item.id) : dashboardRoutes.project(item.projectId); return <li key={item.id}><Link className="group grid gap-2 py-4 first:pt-0 last:pb-0 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-4" to={href}><StatusDot tone={severityTone(item.severity)} /><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--rift-text)]">{item.title}</p><p className="mt-1 text-xs text-[var(--rift-text-muted)]">{item.projectName} · {item.createdAt ? formatDate(item.createdAt) : 'Date unavailable'}</p></div><span className="text-xs font-medium text-[var(--rift-text-secondary)]">{humanize(item.severity)} · {humanize(item.status)} <ArrowRight aria-hidden="true" className="ml-1 inline opacity-0 transition group-hover:opacity-100" size={14} /></span></Link></li>; })}</ul> : <EmptyCopy>No recent Findings. New evidence-backed risks will appear here.</EmptyCopy>}
  </DashboardSection>;
}

function DashboardSection({ eyebrow, title, action, children }: { eyebrow: string; title: string; action: { href: string; label: string } | undefined; children: ReactNode }) {
  return <section className="rift-surface rounded-xl p-5"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--rift-text)]">{title}</h2></div>{action ? <Link className="rift-button-secondary shrink-0 px-3" to={action.href}>{action.label}</Link> : null}</div>{children}</section>;
}

function AvailabilityNote() { return <p className="text-sm text-[var(--rift-text-muted)]">Activity is temporarily unavailable. Configuration and direct investigation links remain available.</p>; }
function EmptyCopy({ children }: { children: ReactNode }) { return <p className="text-sm leading-6 text-[var(--rift-text-secondary)]">{children}</p>; }
function StatusDot({ tone }: { tone: Tone }) { const color = tone === 'pass' ? 'bg-[var(--rift-pass)]' : tone === 'warning' ? 'bg-[var(--rift-warning)]' : tone === 'fail' ? 'bg-[var(--rift-fail)]' : 'bg-[var(--rift-text-muted)]'; return <span aria-hidden="true" className={`size-1.5 rounded-full ${color}`} />; }
function isRunning(status: string) { return ['RUNNING', 'QUEUED', 'PLANNING', 'PROVISIONING', 'OBSERVING', 'ADAPTING', 'REPRODUCING', 'MINIMISING'].includes(status); }
function isAttention(severity: string) { return ['CRITICAL', 'HIGH'].includes(severity); }
function statusTone(status: string): Tone { if (status === 'COMPLETED') return 'pass'; if (status === 'FAILED' || status === 'CANCELLED') return 'fail'; if (isRunning(status)) return 'warning'; return 'muted'; }
function severityTone(severity: string): Tone { if (isAttention(severity)) return 'fail'; if (severity === 'MEDIUM') return 'warning'; return 'muted'; }
function humanize(value: string) { return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function optionalCount(value: number | undefined, label: string) { return value === undefined ? `${label} count unavailable` : `${value} ${label}${value === 1 ? '' : 's'}`; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date); }
