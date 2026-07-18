import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CirclePlus, MoreHorizontal, Plus, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MappedSemanticBadge } from '../../components/semantic-status.js';
import { ProjectApiError, projectApi, type ProjectSummary } from '../../services/project-api.js';
import { setupStatus } from '../runtime/semantic-status.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { ProjectLoading, ProjectMessage } from './project-ui.js';

export function ProjectsPage() {
  const permissions = useAuthStore((state) => state.permissions);
  const canCreate = permissions.includes('CREATE_PROJECTS');
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectApi.list() });

  return (
    <section aria-labelledby="projects-heading" className="mx-auto min-w-0 max-w-[1280px]">
      <header className="border-b border-[var(--rift-border)] pb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Projects</p>
            <h1
              className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[var(--rift-text)] lg:text-[2.5rem]"
              id="projects-heading"
            >
              Projects
            </h1>
            <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
              Manage the applications Rift is authorised to investigate.
            </p>
          </div>
          {canCreate ? (
            <Link
              className="rift-button-primary shrink-0 gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              to="/projects/new"
            >
              <Plus aria-hidden="true" size={16} /> New Project
            </Link>
          ) : null}
        </div>
        {!projects.isPending && !projects.isError ? (
          <ProjectMetrics projects={projects.data} />
        ) : null}
      </header>

      <div className="mt-6">
        {projects.isPending ? (
          <ProjectLoading label="Loading projects…" />
        ) : projects.isError ? (
          <ProjectMessage
            description={projectErrorMessage(projects.error)}
            title={
              projects.error instanceof ProjectApiError && projects.error.status === 403
                ? 'Project access denied'
                : 'Projects unavailable'
            }
          />
        ) : projects.data.length === 0 ? (
          <ProjectEmptyState canCreate={canCreate} />
        ) : (
          <ul className="grid gap-5 xl:grid-cols-2" data-testid="project-list">
            {projects.data.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
            {canCreate ? <AddProjectCard /> : null}
          </ul>
        )}
      </div>
    </section>
  );
}

function ProjectMetrics({ projects }: { projects: ProjectSummary[] }) {
  const metrics = [
    { label: 'Total projects', value: String(projects.length), available: true },
    { label: 'Environments', value: '—', available: false },
    { label: 'Investigations', value: '—', available: false },
    { label: 'Findings', value: '—', available: false },
  ];
  return (
    <dl
      className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--rift-border)] bg-[var(--rift-border)] sm:grid-cols-4"
      aria-label="Project totals"
    >
      {metrics.map((metric) => (
        <div className="bg-[var(--rift-surface)] px-4 py-3" key={metric.label}>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rift-text-muted)]">
            {metric.label}
          </dt>
          <dd
            className={`mt-1 text-xl font-semibold tracking-[-0.03em] ${metric.available ? 'text-[var(--rift-text)]' : 'text-[var(--rift-text-muted)]'}`}
            title={metric.available ? undefined : 'Not exposed by the Projects list API'}
          >
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const name = displayProjectName(project.name);
  const configured = Boolean(project.applicationUrl) && project.safety.configured;
  const host = hostname(project.applicationUrl);
  return (
    <li className="min-w-0">
      <article className="group flex h-full min-h-[330px] flex-col rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] p-5 transition duration-200 motion-reduce:transform-none motion-reduce:transition-none hover:-translate-y-0.5 hover:border-[var(--rift-border-strong)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)] text-sm font-semibold tracking-[0.08em] text-[var(--rift-text)]"
            >
              {monogram(name)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-[-0.025em] text-[var(--rift-text)]">
                {name}
              </h2>
              <span className="mt-1.5 block"><MappedSemanticBadge status={setupStatus(configured ? 'configured' : 'incomplete')} /></span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <details className="relative">
              <summary
                aria-label={`Project actions for ${name}`}
                className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-[var(--rift-text-muted)] transition hover:bg-[var(--rift-surface-hover)] hover:text-[var(--rift-text)] marker:hidden"
              >
                <MoreHorizontal aria-hidden="true" size={18} />
              </summary>
              <div className="absolute right-0 z-10 mt-2 min-w-36 rounded-lg border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] p-1 text-sm shadow-xl">
                <Link
                  className="block rounded-md px-3 py-2 text-[var(--rift-text-secondary)] hover:bg-[var(--rift-surface-hover)] hover:text-[var(--rift-text)]"
                  to={`/projects/${project.id}`}
                >
                  Open
                </Link>
                <Link
                  className="block rounded-md px-3 py-2 text-[var(--rift-text-secondary)] hover:bg-[var(--rift-surface-hover)] hover:text-[var(--rift-text)]"
                  to={`/projects/${project.id}/settings`}
                >
                  Settings
                </Link>
                <Link
                  className="block rounded-md px-3 py-2 text-[var(--rift-text-secondary)] hover:bg-[var(--rift-surface-hover)] hover:text-[var(--rift-text)]"
                  to={`/projects/${project.id}/safety`}
                >
                  Safety
                </Link>
              </div>
            </details>
            <time
              className="mt-1 whitespace-nowrap text-[10px] text-[var(--rift-text-muted)]"
              dateTime={project.updatedAt}
            >
              Updated {formatDate(project.updatedAt)}
            </time>
          </div>
        </div>

        <p className="mt-5 line-clamp-3 text-sm leading-6 text-[var(--rift-text-secondary)]">
          {project.description || 'No project description has been added.'}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-[var(--rift-border)] py-4 text-sm sm:grid-cols-4">
          <ProjectMetric label="Environment" value="Not available" />
          <ProjectMetric label="Investigations" value="—" />
          <ProjectMetric label="Findings" value="—" />
          <ProjectMetric
            label="Restrictions"
            value={String(project.safety.prohibitedActionCount)}
          />
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--rift-text-muted)]">
          <span>Application · {host}</span>
          <span>Allowed hosts · {project.safety.authorisedHostCount}</span>
        </div>

        <footer className="mt-auto flex items-center justify-between gap-4 pt-6">
          <span
            className="min-w-0 truncate text-xs text-[var(--rift-text-muted)]"
            title={project.applicationUrl ?? undefined}
          >
            {host}
          </span>
          <Link
            className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--rift-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            to={`/projects/${project.id}`}
          >
            Open project{' '}
            <ArrowRight
              aria-hidden="true"
              className="transition duration-200 motion-reduce:transition-none group-hover:translate-x-0.5"
              size={15}
            />
          </Link>
        </footer>
      </article>
    </li>
  );
}

function ProjectMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--rift-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-[var(--rift-text-secondary)]">{value}</dd>
    </div>
  );
}

function AddProjectCard() {
  return (
    <li className="min-w-0">
      <Link
        className="group flex h-full min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--rift-border-strong)] bg-transparent p-8 text-center transition duration-200 motion-reduce:transform-none motion-reduce:transition-none hover:-translate-y-0.5 hover:border-zinc-500 hover:bg-[var(--rift-surface)]"
        to="/projects/new"
      >
        <span className="flex size-12 items-center justify-center rounded-full border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] text-[var(--rift-text-secondary)]">
          <CirclePlus aria-hidden="true" size={20} />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-[var(--rift-text)]">Add another project</h2>
        <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
          Start investigating a new application.
        </p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--rift-text)]">
          New Project{' '}
          <ArrowRight
            aria-hidden="true"
            className="transition duration-200 group-hover:translate-x-0.5"
            size={14}
          />
        </span>
      </Link>
    </li>
  );
}

function ProjectEmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div
      className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] px-6 py-10 text-center sm:px-10"
      data-testid="projects-empty-state"
    >
      <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)]">
        <ShieldCheck aria-hidden="true" className="text-[var(--rift-text-secondary)]" size={21} />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-[var(--rift-text)]">
        Define your first authorised target
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--rift-text-secondary)]">
        Connect an application, record access references, and establish the boundary Rift must obey.
      </p>
      <ol className="mx-auto mt-7 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
        {['Connect application', 'Define access', 'Set safety boundary'].map((label, index) => (
          <li
            className="rounded-lg border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] p-4"
            key={label}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rift-text-muted)]">
              0{index + 1}
            </span>
            <span className="mt-2 block text-sm font-medium text-[var(--rift-text)]">{label}</span>
          </li>
        ))}
      </ol>
      {canCreate ? (
        <Link className="rift-button-primary mt-7 gap-2" to="/projects/new">
          <Plus aria-hidden="true" size={16} /> Create a project
        </Link>
      ) : null}
    </div>
  );
}

function displayProjectName(name: string) {
  return name === 'TaskOS Demo Commerce' ? 'Rift Demo Commerce' : name;
}

function monogram(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
      : (parts[0]?.slice(0, 2) ?? 'RP')
  ).toUpperCase();
}

function hostname(value: string | null) {
  if (!value) return 'Not configured';
  try {
    return new URL(value).hostname;
  } catch {
    return 'Invalid URL';
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
}

function projectErrorMessage(error: unknown) {
  return error instanceof ProjectApiError
    ? error.message
    : 'Rift could not load projects. Try again in a moment.';
}
