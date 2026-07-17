import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ProjectMessage } from '../projects/project-ui.js';
import { journeyApi, type JourneyInput } from './journey-api.js';
import { JourneyForm } from './journey-form.js';
import { journeyDefaults } from './journey-form.model.js';
import { useCanMutateJourneys } from './journey-permissions.js';

export function NewJourneyPage() {
  const { projectId = '' } = useParams();
  const canMutate = useCanMutateJourneys();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: JourneyInput) => journeyApi.create(projectId, input),
    onSuccess: async (journey) => {
      await queryClient.invalidateQueries({ queryKey: ['journeys', projectId] });
      navigate(`/projects/${projectId}/journeys/${journey.id}`);
    },
  });

  if (!canMutate)
    return (
      <ProjectMessage
        description="Owner or Admin access is required to create a Journey."
        title="Read-only Journey access"
      />
    );

  return (
    <section className="mx-auto max-w-[1120px]">
      <PageHeading
        description="Compose an ordered, validated sequence using only runtime-supported actions."
        eyebrow="Journey Builder"
        title="New Journey"
      />
      <JourneyForm
        error={mutation.error?.message}
        initial={journeyDefaults()}
        onSubmit={(input) => mutation.mutate(input)}
        pending={mutation.isPending}
        projectId={projectId}
        submitLabel="Create Journey"
      />
    </section>
  );
}
