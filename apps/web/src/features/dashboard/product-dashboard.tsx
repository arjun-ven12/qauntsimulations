import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CircleCheck,
  Clock3,
  FlaskConical,
  FolderKanban,
  Rocket,
  Route,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { OnboardingProgressCard } from '../onboarding/onboarding-progress.js';
import { createDashboardViewModel, type DashboardProjectView } from './dashboard.model.js';
import type {
  DashboardActivityAvailability,
  DashboardData,
  DashboardFindingSummary,
  DashboardInvestigationSummary,
} from './dashboard.types.js';
import { dashboardRoutes } from './dashboard.routes.js';

const primaryAction =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan px-4 py-2 font-bold text-ink transition hover:bg-cyan/90';
const secondaryAction =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 font-bold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900';

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
  return (
    <section aria-labelledby="product-dashboard-title" className="mx-auto max-w-[1200px] min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Product workspace</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight lg:text-4xl" id="product-dashboard-title">
            Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            See what is ready, finish Product setup, and start the next safe investigation.
          </p>
        </div>
        {primary ? (
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            {primary.ready ? (
              <Link className={primaryAction} to={primary.startInvestigationHref}>
                <Rocket aria-hidden="true" size={17} /> Start Investigation
              </Link>
            ) : (
              <Link className={primaryAction} to={primary.continueSetupHref}>
                Continue Setup
              </Link>
            )}
          </div>
        ) : canCreateProject ? (
          <Link className={primaryAction} to={dashboardRoutes.createProject}>
            Create Project
          </Link>
        ) : null}
      </header>

      <OrganisationSummary activityAvailability={activityAvailability} dashboard={dashboard} />

      {primary ? (
        <>
          <FeaturedProject project={primary} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <OnboardingProgressCard progress={primary.onboarding} />
            <ConfigurationReadiness project={primary} />
          </div>
        </>
      ) : (
        <DashboardEmptyState
          action={
            canCreateProject
              ? { href: dashboardRoutes.createProject, label: 'Create your first Project' }
              : undefined
          }
          description={
            canCreateProject
              ? 'Projects organise safety boundaries, Environments, Journeys, and Invariants. Create one to begin Product onboarding.'
              : 'There are no Projects in this organisation. Your current permissions allow you to view Projects but not create them.'
          }
          icon={<FolderKanban aria-hidden="true" size={26} />}
          title="No Projects yet"
        />
      )}

      {dashboard.projects.length ? (
        <ProjectOverview activityAvailability={activityAvailability} projects={dashboard.projects} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <RecentInvestigations
          availability={activityAvailability?.investigations ?? 'available'}
          items={dashboard.recentInvestigations}
        />
        <RecentFindings
          availability={activityAvailability?.findings ?? 'available'}
          items={dashboard.recentFindings}
        />
      </div>
    </section>
  );
}

function OrganisationSummary({
  activityAvailability,
  dashboard,
}: {
  activityAvailability: ProductDashboardProps['activityAvailability'];
  dashboard: ReturnType<typeof createDashboardViewModel>;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl border border-cyan-900 bg-cyan-950/30 p-3 text-cyan">
            <Building2 aria-hidden="true" size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Active organisation</p>
            <h2 className="mt-1 truncate text-xl font-black">{dashboard.organisation.name}</h2>
          </div>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-black text-slate-300">
          {dashboard.organisation.role}
        </span>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Projects" value={dashboard.totals.projectCount} />
        <Metric label="Ready Projects" value={dashboard.totals.readyProjectCount} />
        <Metric
          label="Recent Investigations"
          value={
            activityAvailability?.investigations === 'unavailable'
              ? 'Unavailable'
              : dashboard.totals.recentInvestigationCount
          }
        />
        <Metric
          label="Open Findings"
          value={
            activityAvailability?.findings === 'unavailable'
              ? 'Unavailable'
              : dashboard.totals.openFindingCount
          }
        />
      </dl>
    </section>
  );
}

function FeaturedProject({ project }: { project: DashboardProjectView }) {
  const primaryDemo = Boolean(project.project.isPrimaryDemo);
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border p-5 sm:p-7 ${
        primaryDemo
          ? 'border-cyan-900/80 bg-cyan-950/20'
          : 'border-slate-800 bg-slate-950/40'
      }`}
      data-testid={primaryDemo ? 'primary-demo-project' : 'featured-project'}
    >
      {primaryDemo ? (
        <Sparkles aria-hidden="true" className="absolute -right-7 -top-7 text-cyan/10" size={150} />
      ) : null}
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${
                primaryDemo
                  ? 'border-cyan-800 bg-cyan-950/60 text-cyan-200'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              {primaryDemo ? 'Primary demo' : 'Featured Project'}
            </span>
            <ReadinessBadge ready={project.ready} />
          </div>
          <h2 className="mt-4 text-2xl font-black sm:text-3xl">{project.project.name}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
            {project.project.description || 'No project description.'}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
          <Link className={secondaryAction} to={project.projectHref}>
            Open Project <ArrowRight aria-hidden="true" size={16} />
          </Link>
          {project.ready ? (
            <Link className={primaryAction} to={project.startInvestigationHref}>
              Start Investigation
            </Link>
          ) : (
            <Link className={primaryAction} to={project.continueSetupHref}>
              Continue Setup
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function ConfigurationReadiness({ project }: { project: DashboardProjectView }) {
  const unavailable = new Set(project.project.unavailableConfiguration ?? []);
  const facts = [
    { label: 'Safety', value: project.project.safetyConfigured ? 'Configured' : 'Required', icon: ShieldCheck },
    { label: 'Environments', value: unavailable.has('environments') ? 'Unavailable' : readyCount(project.project.readyEnvironmentCount, project.project.totalEnvironmentCount), icon: Server },
    { label: 'Journeys', value: unavailable.has('journeys') ? 'Unavailable' : readyCount(project.project.readyJourneyCount, project.project.totalJourneyCount), icon: Route },
    { label: 'Invariants', value: unavailable.has('invariants') ? 'Unavailable' : readyCount(project.project.readyInvariantCount, project.project.totalInvariantCount), icon: BadgeCheck },
  ];
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 sm:p-6" data-testid="configuration-readiness">
      <p className="eyebrow">Configuration readiness</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">Launch foundation</h2>
        <ReadinessBadge ready={project.ready} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {facts.map(({ label, value, icon: Icon }) => (
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4" key={label}>
            <Icon aria-hidden="true" className="text-cyan" size={18} />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 font-black text-slate-200">{value}</p>
          </div>
        ))}
      </div>
      <Link
        className={`${secondaryAction} mt-5 w-full`}
        to={project.ready ? project.projectHref : project.continueSetupHref}
      >
        {project.ready ? 'Open Project' : 'Continue Setup'}
      </Link>
    </section>
  );
}

function ProjectOverview({
  activityAvailability,
  projects,
}: {
  activityAvailability: ProductDashboardProps['activityAvailability'];
  projects: DashboardProjectView[];
}) {
  return (
    <section>
      <SectionHeading description="Product targets and their current launch readiness." title="Project overview" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <article className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5" key={project.project.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {project.project.isPrimaryDemo ? 'Primary demo' : 'Project'}
                </p>
                <h3 className="mt-2 break-words text-lg font-black">{project.project.name}</h3>
              </div>
              <span className="text-sm font-black text-cyan">{project.readinessScore}%</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-400">
              {project.project.description || 'No project description.'}
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan" style={{ width: `${project.readinessScore}%` }} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
              <span>
                {activityAvailability?.investigations === 'unavailable'
                  ? 'Investigations unavailable'
                  : `${project.project.recentInvestigationCount} investigations`}
              </span>
              <span>
                {activityAvailability?.findings === 'unavailable'
                  ? 'Findings unavailable'
                  : `${project.project.openFindingCount} open findings`}
              </span>
            </div>
            <Link className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-cyan" to={project.projectHref}>
              View Project <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecentInvestigations({
  availability,
  items,
}: {
  availability: DashboardActivityAvailability;
  items: DashboardInvestigationSummary[];
}) {
  return (
    <ActivitySection description="Latest investigation activity across Product projects." title="Recent Investigations">
      {availability === 'unavailable' ? (
        <ActivityEmpty
          description="The current public API does not provide an organisation-wide Investigation list. Existing Investigations remain available from their direct links."
          icon={<FlaskConical aria-hidden="true" size={22} />}
          title="Recent Investigations unavailable"
        />
      ) : items.length ? (
        <ul className="divide-y divide-slate-800">
          {items.map((item) => (
            <li className="py-4 first:pt-0 last:pb-0" key={item.id}>
              <ActivityLink href={item.href ?? dashboardRoutes.investigation(item.id)}>
                <div className="flex min-w-0 items-start gap-3">
                  <FlaskConical aria-hidden="true" className="mt-0.5 shrink-0 text-cyan" size={18} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate font-bold">{item.projectName}</p>
                      <StatusPill label={item.status} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {optionalCount(item.worldCount, 'world')} · {optionalCount(item.findingCount, 'finding')}
                    </p>
                    <ActivityTime value={item.createdAt} />
                  </div>
                </div>
              </ActivityLink>
            </li>
          ))}
        </ul>
      ) : (
        <ActivityEmpty
          description="Start an investigation from a READY Project to see its progress here."
          icon={<FlaskConical aria-hidden="true" size={22} />}
          title="No Investigations yet"
        />
      )}
    </ActivitySection>
  );
}

function RecentFindings({
  availability,
  items,
}: {
  availability: DashboardActivityAvailability;
  items: DashboardFindingSummary[];
}) {
  return (
    <ActivitySection description="Product risks surfaced by recent investigation evidence." title="Recent Findings">
      {availability === 'unavailable' ? (
        <ActivityEmpty
          description="The current public API exposes Findings within a known Investigation, not as an organisation-wide feed. No Finding records have been inferred."
          icon={<Search aria-hidden="true" size={22} />}
          title="Recent Findings unavailable"
        />
      ) : items.length ? (
        <ul className="divide-y divide-slate-800">
          {items.map((item) => (
            <li className="py-4 first:pt-0 last:pb-0" key={item.id}>
              <ActivityLink href={item.href ?? `/projects/${item.projectId}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-300" size={18} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-words font-bold">{item.title}</p>
                      <SeverityPill severity={item.severity} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{item.projectName} · {item.status}</p>
                    <ActivityTime value={item.createdAt} />
                  </div>
                </div>
              </ActivityLink>
            </li>
          ))}
        </ul>
      ) : (
        <ActivityEmpty
          description="Confirmed Product risks will appear here when investigations produce Findings."
          icon={<Search aria-hidden="true" size={22} />}
          title="No Findings yet"
        />
      )}
    </ActivitySection>
  );
}

function ActivitySection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 sm:p-6">
      <SectionHeading description={description} title={title} />
      {children}
    </section>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function DashboardEmptyState({ title, description, icon, action }: { title: string; description: string; icon: ReactNode; action?: { href: string; label: string } | undefined }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/30 px-6 py-10 text-center">
      <span className="mx-auto inline-flex rounded-xl border border-slate-800 p-3 text-cyan">{icon}</span>
      <h2 className="mt-4 text-xl font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">{description}</p>
      {action ? <Link className={`${primaryAction} mt-5`} to={action.href}>{action.label}</Link> : null}
    </section>
  );
}

function ActivityEmpty({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 px-5 py-8 text-center">
      <span className="mx-auto inline-flex text-slate-500">{icon}</span>
      <h3 className="mt-3 font-black text-slate-200">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-2 text-2xl font-black text-slate-100">{value}</dd>
    </div>
  );
}

function ReadinessBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-xs font-black text-emerald-300">
      <CircleCheck aria-hidden="true" size={13} /> READY
    </span>
  ) : (
    <span className="rounded-full border border-amber-800 bg-amber-950/40 px-3 py-1 text-xs font-black text-amber-300">
      SETUP REQUIRED
    </span>
  );
}

function StatusPill({ label }: { label: string }) {
  return <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-black text-slate-300">{label}</span>;
}

function SeverityPill({ severity }: { severity: string }) {
  const tone = severity === 'CRITICAL' || severity === 'HIGH' ? 'border-red-800 bg-red-950/30 text-red-300' : severity === 'MEDIUM' ? 'border-amber-800 bg-amber-950/30 text-amber-300' : 'border-slate-700 text-slate-300';
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${tone}`}>{severity}</span>;
}

function ActivityLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="group block rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan" to={href}>{children}</Link>;
}

function ActivityTime({ value }: { value: string | undefined }) {
  if (!value) return null;
  return (
    <p className="mt-2 flex items-center gap-1 text-xs text-slate-600">
      <Clock3 aria-hidden="true" size={12} /> {formatDate(value)}
    </p>
  );
}

function readyCount(ready: number, total: number) {
  return `${ready}/${total} READY`;
}

function optionalCount(value: number | undefined, singular: string) {
  if (value === undefined) return `${singular} count unavailable`;
  return `${value} ${singular}${value === 1 ? '' : 's'}`;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
}
