import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { environmentApi } from '../../services/environment-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { invariantApi } from '../invariants/invariant-api.js';
import { journeyApi } from '../journeys/journey-api.js';
import { ProjectLoading, ProjectMessage } from '../projects/project-ui.js';
import { scenarioApi, type ScenarioLaunchInput } from './scenario-api.js';
import { ScenarioForm } from './scenario-form.js';
import { liveWorldLabRoute, scenarioDefaults } from './scenario-form.model.js';

export function ScenarioCreatePage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.organisation?.role);
  const currentRole = useAuthStore.getState().organisation?.role;
  const environments = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentApi.list(projectId),
  });
  const journeys = useQuery({
    queryKey: ['journeys', projectId],
    queryFn: () => journeyApi.list(projectId),
  });
  const invariants = useQuery({
    queryKey: ['invariants', projectId],
    queryFn: () => invariantApi.list(projectId),
  });
  const launch = useMutation({
    mutationFn: (input: ScenarioLaunchInput) => scenarioApi.launch(projectId, input),
    onSuccess: (investigation) => navigate(liveWorldLabRoute(investigation.id)),
  });

  if (environments.isPending || journeys.isPending || invariants.isPending)
    return <ProjectLoading label="Loading persisted launch configuration…" />;
  const loadingError = environments.error ?? journeys.error ?? invariants.error;
  if (loadingError)
    return (
      <ProjectMessage
        description={loadingError.message}
        title="Scenario configuration could not be loaded"
      />
    );
  if (role === 'VIEWER' || currentRole === 'VIEWER')
    return (
      <ProjectMessage
        description="Viewer access is read-only. Owner, Admin, or Member access is required to launch an Investigation."
        title="Read-only Scenario access"
      />
    );

  return (
    <section className="mx-auto max-w-[1120px] min-w-0">
      <PageHeading
        description="Select persisted configuration, preflight it against Project Safety, then launch the unchanged payload."
        eyebrow="World design"
        title="New Scenario Investigation"
      />
      <ScenarioForm
        environments={environments.data!}
        initial={scenarioDefaults(environments.data!)}
        invariants={invariants.data!}
        journeys={journeys.data!}
        launchError={launch.error}
        launchPending={launch.isPending}
        onLaunch={async (input) => {
          await launch.mutateAsync(input);
        }}
        onPreflight={(input) => scenarioApi.preflight(projectId, input)}
      />
    </section>
  );
}
