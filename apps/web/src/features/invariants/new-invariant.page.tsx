import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ProjectMessage } from '../projects/project-ui.js';
import { invariantApi, type InvariantInput } from './invariant-api.js';
import { InvariantForm } from './invariant-form.js';
import { invariantDefaults } from './invariant-form.model.js';
import { useCanMutateInvariants } from './invariant-permissions.js';

export function NewInvariantPage() {
  const { projectId = '' } = useParams();
  const canMutate = useCanMutateInvariants();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: InvariantInput) => invariantApi.create(projectId, input),
    onSuccess: async (invariant) => {
      await queryClient.invalidateQueries({ queryKey: ['invariants', projectId] });
      navigate(`/projects/${projectId}/invariants/${invariant.id}`);
    },
  });

  if (!canMutate)
    return (
      <ProjectMessage
        description="Owner or Admin access is required to create an Invariant."
        title="Read-only Invariant access"
      />
    );

  return (
    <section className="mx-auto max-w-[1120px] min-w-0">
      <PageHeading
        description="Start from a supported template, then review the exact structured definition."
        eyebrow="Invariant Builder"
        title="New Invariant"
      />
      <InvariantForm
        error={mutation.error?.message}
        initial={invariantDefaults()}
        onSubmit={(input) => mutation.mutate(input)}
        pending={mutation.isPending}
        submitLabel="Create Invariant"
      />
    </section>
  );
}
