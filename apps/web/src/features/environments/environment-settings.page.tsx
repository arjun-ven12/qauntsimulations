import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import {
  environmentApi,
  type EnvironmentInput,
} from '../../services/environment-api.js';
import { ProjectLoading, ProjectMessage } from '../projects/project-ui.js';
import { EnvironmentForm } from './environment-form.js';

export function EnvironmentSettingsPage() {
  const { projectId = '', environmentId = '' } = useParams();
  const queryClient = useQueryClient();
  const environment = useQuery({
    queryKey: ['environment', projectId, environmentId],
    queryFn: () => environmentApi.get(projectId, environmentId),
  });
  const mutation = useMutation({
    mutationFn: (input: EnvironmentInput) =>
      environmentApi.update(projectId, environmentId, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['environment', projectId, environmentId], updated);
      await queryClient.invalidateQueries({ queryKey: ['environments', projectId] });
    },
  });

  if (environment.isPending) return <ProjectLoading label="Loading environment settings…" />;
  if (environment.isError)
    return (
      <ProjectMessage
        description={environment.error.message}
        title="Environment settings unavailable"
      />
    );

  const current = environment.data;
  const initial: EnvironmentInput = {
    name: current.name,
    description: current.description,
    type: current.type,
    baseUrl: current.baseUrl,
    apiBaseUrl: current.apiBaseUrl,
    healthCheckUrl: current.healthCheckUrl,
    isDefault: current.isDefault,
    configuration: current.configuration,
    acknowledgement: true,
  };

  return (
    <section className="mx-auto max-w-[1050px]">
      <PageHeading
        description={`Validation: ${current.validationStatus}. Saving meaningful changes resets validation.`}
        eyebrow={current.name}
        title="Environment Settings"
      />
      {mutation.error ? (
        <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      {mutation.isSuccess ? (
        <p className="mt-4 text-sm font-bold text-emerald-300" role="status">
          Environment saved.
        </p>
      ) : null}
      <EnvironmentForm
        initial={initial}
        onSubmit={(input) => mutation.mutate(input)}
        pending={mutation.isPending}
        projectId={projectId}
      />
    </section>
  );
}
