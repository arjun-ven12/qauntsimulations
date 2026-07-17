import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { environmentApi } from '../../services/environment-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';

export function EnvironmentsPage() {
  const { projectId = '' } = useParams();
  const permissions = useAuthStore((state) => state.permissions);
  const query = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentApi.list(projectId),
  });
  const editable = permissions.includes('EDIT_PROJECTS');
  if (query.isPending) return <p>Loading environments…</p>;
  if (query.isError) return <p role="alert">Environments could not be loaded.</p>;
  return (
    <section>
      <PageHeading
        action={
          editable ? (
            <Link className={primaryButton} to={`/projects/${projectId}/environments/new`}>
              Create environment
            </Link>
          ) : undefined
        }
        description="Define where TaskOS may run journeys and experiments."
        eyebrow="Project setup"
        title="Environments"
      />
      {!editable ? (
        <p className="mt-4 text-sm text-slate-400">You have read-only Environment access.</p>
      ) : null}
      {query.data.length === 0 ? (
        <div className="card mt-6">
          Create an environment to define where TaskOS may run journeys and experiments.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {query.data.map((environment) => (
            <article className="card min-w-0" key={environment.id}>
              <div className="flex justify-between gap-2">
                <h2 className="min-w-0 break-words font-bold">{environment.name}</h2>
                {environment.isDefault ? <span className="badge">Default</span> : null}
              </div>
              <p className="mt-2 break-words text-sm text-slate-400">
                {environment.type} · {environment.baseUrl}
              </p>
              <p className="mt-2 text-sm">
                {environment.validationStatus} · {environment.paymentConfiguration.mode}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  className={secondaryButton}
                  to={`/projects/${projectId}/environments/${environment.id}`}
                >
                  Open
                </Link>
                {editable ? (
                  <Link
                    className={secondaryButton}
                    to={`/projects/${projectId}/environments/${environment.id}/settings`}
                  >
                    Settings
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
