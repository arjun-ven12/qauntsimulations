import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ProjectLoading, ProjectMessage } from '../projects/project-ui.js';
import { journeyApi, type JourneyInput } from './journey-api.js';
import { JourneyForm } from './journey-form.js';
import { toFormValue } from './journey-form.model.js';
import { useCanMutateJourneys } from './journey-permissions.js';

export function JourneySettingsPage() {
  const { projectId = '', journeyId = '' } = useParams();
  const canMutate = useCanMutateJourneys();
  const queryClient = useQueryClient();
  const journey = useQuery({
    queryKey: ['journey', projectId, journeyId],
    queryFn: () => journeyApi.get(projectId, journeyId),
  });
  const mutation = useMutation({
    mutationFn: (input: JourneyInput) => journeyApi.update(projectId, journeyId, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['journey', projectId, journeyId], updated);
      await queryClient.invalidateQueries({ queryKey: ['journeys', projectId] });
    },
  });

  if (journey.isPending) return <ProjectLoading label="Loading Journey settings…" />;
  if (journey.isError)
    return <ProjectMessage description={journey.error.message} title="Journey unavailable" />;

  return (
    <section className="mx-auto max-w-[1120px]">
      <PageHeading
        description="Edit the same contract used when creating this Journey."
        eyebrow={journey.data.name}
        title="Journey Settings"
      />
      <JourneyForm
        error={mutation.error?.message}
        initial={toFormValue(journey.data)}
        onSubmit={(input) => mutation.mutate(input)}
        onValidate={async () => {
          const result = await journeyApi.validate(projectId, journeyId);
          queryClient.setQueryData(['journey', projectId, journeyId], result.journey);
          await queryClient.invalidateQueries({ queryKey: ['journeys', projectId] });
          return result;
        }}
        pending={mutation.isPending}
        projectId={projectId}
        readOnly={!canMutate}
        successMessage={mutation.isSuccess ? 'Journey saved.' : undefined}
      />
    </section>
  );
}
