import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { environmentApi } from '../../services/environment-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';

export function EnvironmentOverviewPage() {
  const { projectId = '', environmentId = '' } = useParams();
  const permissions = useAuthStore((state) => state.permissions);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['environment', projectId, environmentId],
    queryFn: () => environmentApi.get(projectId, environmentId),
  });
  const validate = useMutation({
    mutationFn: () => environmentApi.validate(projectId, environmentId),
    onSuccess: (environment) =>
      queryClient.setQueryData(['environment', projectId, environmentId], environment),
  });
  const setDefault = useMutation({
    mutationFn: () => environmentApi.setDefault(projectId, environmentId),
    onSuccess: async (environment) => {
      queryClient.setQueryData(['environment', projectId, environmentId], environment);
      await queryClient.invalidateQueries({ queryKey: ['environments', projectId] });
    },
  });
  if (query.isPending) return <p>Loading environment…</p>;
  if (query.isError) return <p role="alert">Environment not found.</p>;
  const environment = query.data;
  const editable = permissions.includes('EDIT_PROJECTS');
  return (
    <section>
      <div className="flex flex-wrap justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{environment.type}</p>
          <h1 className="break-words text-3xl font-bold">{environment.name}</h1>
        </div>
        {editable ? (
          <Link
            className={secondaryButton}
            to={`/projects/${projectId}/environments/${environmentId}/settings`}
          >
            Edit Settings
          </Link>
        ) : null}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Block
          title="Connection"
          values={[
            ['Base URL', environment.baseUrl],
            ['API URL', environment.apiBaseUrl],
            ['Validation', environment.validationStatus],
            ['Last validated', environment.lastValidatedAt],
          ]}
        />
        <Block
          title="Behaviour"
          values={[
            ['Payment mode', environment.paymentConfiguration.mode],
            ['Delay', String(environment.paymentConfiguration.delayMs)],
            ['Feature flags', String(environment.featureFlags.length)],
          ]}
        />
        <Block
          title="Reset and test data"
          values={[
            ['Reset mode', environment.resetConfiguration.mode],
            ['Product', environment.testDataConfiguration.productIdentifier],
            ['Isolation', environment.testDataConfiguration.isolation],
          ]}
        />
        <Block
          title="Credentials"
          values={environment.credentialReferences.map((credential) => [
            credential.label,
            credential.reference,
          ])}
        />
        <Block
          title="Safety"
          values={[
            ['Allowed actions', environment.allowedActions.join(', ') || 'None'],
            ['Project compatibility', 'Enforced server-side'],
          ]}
        />
        <Block
          title="Runtime readiness"
          values={[
            ['Status', environment.validationStatus],
            ['Remote access', remoteAccessLabel(environment.baseUrl)],
          ]}
        />
      </div>
      {environment.validationResults.map((result) => (
        <p className="mt-2" key={result.key}>
          {result.status}: {result.message}
        </p>
      ))}
      {editable ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className={primaryButton}
            disabled={validate.isPending}
            onClick={() => validate.mutate()}
            type="button"
          >
            {validate.isPending ? 'Validating…' : 'Validate Environment'}
          </button>
          <button
            className={secondaryButton}
            disabled={environment.isDefault || setDefault.isPending}
            onClick={() => setDefault.mutate()}
            type="button"
          >
            {environment.isDefault ? 'Default Environment' : 'Set as Default'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Block({
  title,
  values,
}: {
  title: string;
  values: Array<[string, string | null]>;
}) {
  return (
    <section className="card min-w-0">
      <h2 className="font-bold">{title}</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {values.map(([label, value]) => (
          <div className="grid min-w-0 gap-1 sm:grid-cols-[9rem_minmax(0,1fr)]" key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="min-w-0 break-words text-slate-200">{value || 'Not set'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function remoteAccessLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname === 'localhost'
      ? 'Local only'
      : 'Remote-ready assessment pending';
  } catch {
    return 'Invalid base URL';
  }
}
