import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { environmentApi } from '../../services/environment-api.js';
import {
  primaryButton,
  ProjectLoading,
  ProjectMessage,
  secondaryButton,
} from '../projects/project-ui.js';
import { journeyApi, type Journey } from './journey-api.js';
import { useCanMutateJourneys } from './journey-permissions.js';

export function JourneysPage() {
  const { projectId = '' } = useParams();
  const canMutate = useCanMutateJourneys();
  const queryClient = useQueryClient();
  const journeys = useQuery({
    queryKey: ['journeys', projectId],
    queryFn: () => journeyApi.list(projectId),
  });
  const environments = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentApi.list(projectId),
  });
  const duplicate = useMutation({
    mutationFn: (journeyId: string) => journeyApi.duplicate(projectId, journeyId),
    onSuccess: (copy) => {
      queryClient.setQueryData<Journey[]>(['journeys', projectId], (current = []) => [
        copy,
        ...current,
      ]);
    },
  });
  const archive = useMutation({
    mutationFn: (journeyId: string) => journeyApi.remove(projectId, journeyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journeys', projectId] });
    },
  });

  if (journeys.isPending) return <ProjectLoading label="Loading Journeys…" />;
  if (journeys.isError)
    return (
      <ProjectMessage
        description={journeys.error.message}
        title="Journeys could not be loaded"
      />
    );

  const environmentNames = new Map(
    environments.data?.map((environment) => [environment.id, environment.name]) ?? [],
  );

  return (
    <section>
      <PageHeading
        action={
          canMutate ? (
            <Link className={primaryButton} to={`/projects/${projectId}/journeys/new`}>
              Create Journey
            </Link>
          ) : undefined
        }
        description="Build deterministic, project-scoped browser Journeys from supported actions."
        eyebrow="Project setup"
        title="Journeys"
      />
      {!canMutate ? (
        <p className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
          You have read-only Journey access. Mutation controls are available to Owners and Admins.
        </p>
      ) : null}
      {duplicate.error || archive.error ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {(duplicate.error ?? archive.error)?.message}
        </p>
      ) : null}
      {environments.isError ? (
        <p className="mt-4 text-sm text-amber-300" role="alert">
          Environment names could not be loaded. Journey access remains available.
        </p>
      ) : null}
      {journeys.data.length === 0 ? (
        <div className="card mt-6">
          <h2 className="font-bold">No Journeys yet</h2>
          <p className="mt-2 text-sm text-slate-400">
            Create a Journey to define a safe, repeatable sequence for this project.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {journeys.data.map((journey) => (
            <article className="card min-w-0" key={journey.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-black">{journey.name}</h2>
                  <p className="mt-1 break-words text-sm text-slate-400">
                    {journey.description || 'No description'}
                  </p>
                </div>
                <StatusBadge status={journey.validationStatus} />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <Summary label="Environment" value={environmentNames.get(journey.environmentId) ?? 'Unavailable'} />
                <Summary label="Executable steps" value={String(journey.steps.length)} />
                <Summary label="State" value={journey.state} />
                <Summary label="Updated" value={formatTime(journey.updatedAt)} />
              </dl>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  className={secondaryButton}
                  to={`/projects/${projectId}/journeys/${journey.id}`}
                >
                  Open
                </Link>
                {canMutate ? (
                  <>
                    <button
                      className={secondaryButton}
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.mutate(journey.id)}
                      type="button"
                    >
                      <Copy aria-hidden="true" size={16} /> Duplicate
                    </button>
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-900 px-4 py-2 font-bold text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                      disabled={archive.isPending}
                      onClick={() => {
                        if (window.confirm(`Archive “${journey.name}”?`)) archive.mutate(journey.id);
                      }}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} /> Archive
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: Journey['validationStatus'] }) {
  const classes =
    status === 'READY'
      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
      : status === 'INVALID'
        ? 'border-red-800 bg-red-950/40 text-red-300'
        : 'border-amber-800 bg-amber-950/40 text-amber-300';
  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${classes}`}>{status}</span>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words font-bold text-slate-200">{value}</dd>
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
