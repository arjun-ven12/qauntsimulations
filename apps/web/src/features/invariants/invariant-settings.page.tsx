import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ProjectLoading, ProjectMessage } from '../projects/project-ui.js';
import { invariantApi, type InvariantInput } from './invariant-api.js';
import { InvariantForm } from './invariant-form.js';
import { toFormValue } from './invariant-form.model.js';
import { useCanMutateInvariants } from './invariant-permissions.js';

export function InvariantSettingsPage() {
  const { projectId = '', invariantId = '' } = useParams();
  const canMutate = useCanMutateInvariants();
  const queryClient = useQueryClient();
  const invariant = useQuery({
    queryKey: ['invariant', projectId, invariantId],
    queryFn: () => invariantApi.get(projectId, invariantId),
  });
  const mutation = useMutation({
    mutationFn: (input: InvariantInput) => invariantApi.update(projectId, invariantId, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['invariant', projectId, invariantId], updated);
      await queryClient.invalidateQueries({ queryKey: ['invariants', projectId] });
    },
  });

  if (invariant.isPending) return <ProjectLoading label="Loading Invariant settings…" />;
  if (invariant.isError)
    return <ProjectMessage description={invariant.error.message} title="Invariant unavailable" />;
  if (!invariant.data.type || !invariant.data.configuration || !invariant.data.severity)
    return (
      <ProjectMessage
        description="This legacy definition is unsupported and cannot be edited. Archive it and recreate it from a supported template."
        title="Invariant cannot be edited"
      />
    );

  return (
    <section className="mx-auto max-w-[1120px] min-w-0">
      <PageHeading
        description="Edit the same strict contract used when creating this Invariant."
        eyebrow={invariant.data.name}
        title="Invariant Settings"
      />
      <InvariantForm
        error={mutation.error?.message}
        initial={toFormValue(invariant.data)}
        onSubmit={(input) => mutation.mutate(input)}
        onValidate={async () => {
          const result = await invariantApi.validate(projectId, invariantId);
          queryClient.setQueryData(['invariant', projectId, invariantId], result.invariant);
          await queryClient.invalidateQueries({ queryKey: ['invariants', projectId] });
          return result;
        }}
        pending={mutation.isPending}
        readOnly={!canMutate}
        successMessage={mutation.isSuccess ? 'Invariant saved.' : undefined}
      />
    </section>
  );
}
