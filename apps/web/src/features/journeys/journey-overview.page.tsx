import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { environmentApi } from '../../services/environment-api.js';
import { ProjectLoading, ProjectMessage, secondaryButton } from '../projects/project-ui.js';
import { journeyApi, type JourneyValidationResult } from './journey-api.js';
import { JourneyPreview } from './journey-form.js';
import { toFormValue } from './journey-form.model.js';
import { useCanMutateJourneys } from './journey-permissions.js';

export function JourneyOverviewPage() {
  const { projectId = '', journeyId = '' } = useParams();
  const canMutate = useCanMutateJourneys();
  const queryClient = useQueryClient();
  const journey = useQuery({
    queryKey: ['journey', projectId, journeyId],
    queryFn: () => journeyApi.get(projectId, journeyId),
  });
  const environments = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentApi.list(projectId),
  });
  const validate = useMutation({
    mutationFn: () => journeyApi.validate(projectId, journeyId),
    onSuccess: (result) => {
      queryClient.setQueryData(['journey', projectId, journeyId], result.journey);
      void queryClient.invalidateQueries({ queryKey: ['journeys', projectId] });
    },
  });

  if (journey.isPending) return <ProjectLoading label="Loading Journey…" />;
  if (journey.isError)
    return <ProjectMessage description={journey.error.message} title="Journey unavailable" />;

  const item = journey.data;
  const environment = environments.data?.find((candidate) => candidate.id === item.environmentId);
  const preview = toFormValue(item);
  return (
    <section className="mx-auto max-w-[1120px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Journey overview</p>
          <h1 className="mt-2 break-words text-3xl font-black lg:text-4xl">{item.name}</h1>
          <p className="mt-2 max-w-2xl break-words text-slate-400">
            {item.description || 'No description'}
          </p>
        </div>
        {canMutate ? (
          <Link
            className={secondaryButton}
            to={`/projects/${projectId}/journeys/${journeyId}/settings`}
          >
            Edit Settings
          </Link>
        ) : null}
      </div>
      {!canMutate ? (
        <p className="mt-5 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
          You have read-only Journey access.
        </p>
      ) : null}
      <dl className="card mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <OverviewItem label="Environment" value={environment?.name ?? 'Unavailable'} />
        <OverviewItem label="State" value={item.state} />
        <OverviewItem label="Validation" value={item.validationStatus} />
        <OverviewItem label="Executable steps" value={String(item.steps.length)} />
        <OverviewItem label="Start" value={item.startPath} />
        <OverviewItem
          label="Completion"
          value={`${item.completionCondition.type}: ${item.completionCondition.selector}`}
        />
      </dl>
      {canMutate ? (
        <div className="mt-5">
          <button
            className={secondaryButton}
            disabled={validate.isPending}
            onClick={() => validate.mutate()}
            type="button"
          >
            {validate.isPending ? 'Validating…' : 'Validate Journey'}
          </button>
        </div>
      ) : null}
      {validate.error ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {validate.error.message}
        </p>
      ) : null}
      {validate.data ? <ValidationPanel result={validate.data} /> : null}
      <div className="mt-6">
        <JourneyPreview value={preview} />
      </div>
    </section>
  );
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-bold">{value}</dd>
    </div>
  );
}

function ValidationPanel({ result }: { result: JourneyValidationResult }) {
  return (
    <section className="card mt-6" aria-live="polite">
      <h2 className="font-black">Validation: {result.status}</h2>
      <div className="mt-4 space-y-2">
        {result.checks.map((check) => (
          <p className="text-sm" key={`${check.key}-${check.stepOrder ?? 'journey'}`}>
            <strong>{check.status}</strong>: {check.message}
          </p>
        ))}
      </div>
    </section>
  );
}
