import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import {
  environmentApi,
  type Environment,
  type EnvironmentInput,
} from '../../services/environment-api.js';
import { EnvironmentForm, environmentDefaults } from './environment-form.js';

export function NewEnvironmentPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: EnvironmentInput) => environmentApi.create(projectId, input),
    onSuccess: (environment: Environment) => {
      void queryClient.invalidateQueries({ queryKey: ['environments', projectId] });
      navigate(`/projects/${projectId}/environments/${environment.id}`);
    },
  });

  return (
    <section className="mx-auto max-w-[1050px]">
      <PageHeading
        description="Define an authorised test target and the exact behavior Rift may use."
        eyebrow="Project setup"
        title="Create Environment"
      />
      {mutation.error ? (
        <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      <EnvironmentForm
        initial={environmentDefaults()}
        onSubmit={(input) => mutation.mutate(input)}
        pending={mutation.isPending}
        projectId={projectId}
      />
    </section>
  );
}
