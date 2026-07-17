import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Settings, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ProjectApiError, projectApi } from '../../services/project-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { primaryButton, ProjectLoading, ProjectMessage, secondaryButton } from './project-ui.js';

export function ProjectOverviewPage() {
  const { projectId = '' } = useParams();
  const permissions = useAuthStore((state) => state.permissions);
  const project = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectApi.get(projectId),
  });

  if (project.isPending) return <ProjectLoading />;
  if (project.isError) {
    const denied = project.error instanceof ProjectApiError && project.error.status === 403;
    const missing = project.error instanceof ProjectApiError && project.error.status === 404;
    return (
      <ProjectMessage
        description={
          project.error instanceof Error ? project.error.message : 'Project unavailable.'
        }
        title={
          denied ? 'Project access denied' : missing ? 'Project not found' : 'Project unavailable'
        }
      />
    );
  }

  const value = project.data;
  return (
    <section>
      <PageHeading
        action={
          <div className="flex flex-wrap gap-2">
            {permissions.includes('EDIT_PROJECTS') ? (
              <Link className={secondaryButton} to={`/projects/${projectId}/settings`}>
                <Settings aria-hidden="true" className="mr-2" size={17} /> Settings
              </Link>
            ) : null}
            <Link className={primaryButton} to={`/projects/${projectId}/safety`}>
              <ShieldCheck aria-hidden="true" className="mr-2" size={17} /> Safety
            </Link>
            <Link className={secondaryButton} to={`/projects/${projectId}/environments`}>
              Environments
            </Link>
          </div>
        }
        description={value.description || 'No project description.'}
        eyebrow={value.organisation.name}
        title={value.name}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <OverviewCard label="Application" value={hostname(value.applicationUrl)} />
        <OverviewCard label="Repository" value={hostname(value.repositoryUrl)} />
        <OverviewCard
          label="Safety boundary"
          value={`${value.safety.domainAllowlist.length} authorised hosts`}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-lg font-bold">Integration references</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Detail label="API endpoints" value={String(value.apiEndpoints.length)} />
            <Detail label="Webhook endpoints" value={String(value.webhookEndpoints.length)} />
            <Detail
              label="Credential references"
              value={String(value.credentialReferences.length)}
            />
          </dl>
        </section>
        <section className="card">
          <h2 className="text-lg font-bold">Safety summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Detail
              label="Prohibited actions"
              value={String(value.safety.prohibitedActions.length)}
            />
            <Detail label="Allowed methods" value={value.safety.allowedHttpMethods.join(', ')} />
            <Detail label="Production access" value="Denied" />
          </dl>
        </section>
      </div>
    </section>
  );
}

function OverviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card min-w-0">
      <ExternalLink aria-hidden="true" className="text-cyan" size={20} />
      <div className="mt-4 text-xs uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-200">{value}</dd>
    </div>
  );
}

function hostname(value: string | null) {
  return value ? new URL(value).hostname : 'Not configured';
}
