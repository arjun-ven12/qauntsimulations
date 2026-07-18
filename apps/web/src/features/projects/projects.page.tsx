import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ProjectApiError, projectApi } from '../../services/project-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { primaryButton, ProjectLoading, ProjectMessage } from './project-ui.js';

export function ProjectsPage() {
  const permissions = useAuthStore((state) => state.permissions);
  const canCreate = permissions.includes('CREATE_PROJECTS');
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => projectApi.list() });

  return (
    <section aria-labelledby="projects-heading">
      <PageHeading
        action={
          canCreate ? (
            <Link className={primaryButton} to="/projects/new">
              <Plus aria-hidden="true" className="mr-2" size={17} /> New Project
            </Link>
          ) : undefined
        }
        description="Define the applications, integration references and safety boundaries Rift may use."
        eyebrow="Workspace"
        title="Projects"
      />
      <span className="sr-only" id="projects-heading">
        Rift projects
      </span>
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
        <div className="card py-10 text-center" data-testid="projects-empty-state">
          <ShieldCheck aria-hidden="true" className="mx-auto text-cyan" size={30} />
          <h2 className="mt-4 text-xl font-bold">Define your first safe target</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
            A project records the application, external credential references, integration URLs and
            boundaries Rift must obey. It does not run experiments by itself.
          </p>
          {canCreate ? (
            <Link className={`${primaryButton} mt-6`} to="/projects/new">
              Create a project
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" data-testid="project-list">
          {projects.data.map((project) => (
            <li className="min-w-0" key={project.id}>
              <Link className="card group block h-full" to={`/projects/${project.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="eyebrow">{project.organisation.name}</div>
                  <span className="text-xs text-slate-500">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-bold">{project.name}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                  {project.description || 'No project description.'}
                </p>
                <dl className="mt-5 grid gap-2 text-sm">
                  <ProjectFact label="Application" value={hostname(project.applicationUrl)} />
                  <ProjectFact label="Repository" value={hostname(project.repositoryUrl)} />
                  <ProjectFact
                    label="Safety"
                    value={`${project.safety.authorisedHostCount} hosts · ${project.safety.prohibitedActionCount} prohibited actions`}
                  />
                </dl>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-cyan">
                  Open project
                  <ArrowRight
                    aria-hidden="true"
                    className="transition group-hover:translate-x-1"
                    size={15}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[90px_minmax(0,1fr)] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-slate-300">{value}</dd>
    </div>
  );
}

function hostname(value: string | null) {
  if (!value) return 'Not configured';
  try {
    return new URL(value).hostname;
  } catch {
    return 'Invalid URL';
  }
}

function projectErrorMessage(error: unknown) {
  return error instanceof ProjectApiError
    ? error.message
    : 'Rift could not load projects. Try again in a moment.';
}
