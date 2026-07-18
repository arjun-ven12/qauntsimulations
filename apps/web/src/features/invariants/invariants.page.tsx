import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MappedSemanticBadge } from '../../components/semantic-status.js';
import { PageHeading } from '../../components/page-heading.js';
import {
  primaryButton,
  ProjectLoading,
  ProjectMessage,
  secondaryButton,
} from '../projects/project-ui.js';
import { invariantApi, type Invariant } from './invariant-api.js';
import { templateName } from './invariant-form.model.js';
import { useCanMutateInvariants } from './invariant-permissions.js';
import { StatusPill } from './invariant-structured-preview.js';
import { findingSeverityStatus, setupStatus } from '../runtime/semantic-status.js';

export function InvariantsPage() {
  const { projectId = '' } = useParams();
  const canMutate = useCanMutateInvariants();
  const queryClient = useQueryClient();
  const invariants = useQuery({
    queryKey: ['invariants', projectId],
    queryFn: () => invariantApi.list(projectId),
  });
  const duplicate = useMutation({
    mutationFn: (invariantId: string) => invariantApi.duplicate(projectId, invariantId),
    onSuccess: (copy) => {
      queryClient.setQueryData<Invariant[]>(['invariants', projectId], (current = []) => [
        copy,
        ...current,
      ]);
    },
  });
  const archive = useMutation({
    mutationFn: (invariantId: string) => invariantApi.remove(projectId, invariantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invariants', projectId] });
    },
  });

  if (invariants.isPending) return <ProjectLoading label="Loading Invariants…" />;
  if (invariants.isError)
    return (
      <ProjectMessage
        description={invariants.error.message}
        title="Invariants could not be loaded"
      />
    );

  return (
    <section className="min-w-0">
      <PageHeading
        action={
          canMutate ? (
            <Link className={primaryButton} to={`/projects/${projectId}/invariants/new`}>
              Create Invariant
            </Link>
          ) : undefined
        }
        description="Define project rules using runtime-supported, structured evaluators."
        eyebrow="Project setup"
        title="Invariants"
      />
      {!canMutate ? (
        <p className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
          You have read-only Invariant access. Mutation controls are available to Owners and Admins.
        </p>
      ) : null}
      {duplicate.error || archive.error ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {(duplicate.error ?? archive.error)?.message}
        </p>
      ) : null}
      {invariants.data.length === 0 ? (
        <div className="card mt-6">
          <h2 className="font-bold">No Invariants yet</h2>
          <p className="mt-2 text-sm text-slate-400">
            Create one from a suggested template to define the first protected business rule.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {invariants.data.map((invariant) => (
            <article className="card min-w-0" key={invariant.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-black">{invariant.name}</h2>
                  <p className="mt-1 break-words text-sm text-slate-400">
                    {invariant.description}
                  </p>
                </div>
                <StatusPill status={invariant.validationStatus} />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <Summary
                  label="Template"
                  value={invariant.type ? templateName(invariant.type) : 'Unsupported legacy definition'}
                />
                <Summary label="Evaluator" value={invariant.type ?? 'Unavailable'} mono />
                <SemanticSummary label="Severity" status={findingSeverityStatus(invariant.severity)} />
                <SemanticSummary label="State" status={setupStatus(invariant.enabled ? 'configured' : 'disabled')} />
                <Summary label="Validation" value={invariant.validationStatus} />
                <Summary label="Updated" value={formatTime(invariant.updatedAt)} />
              </dl>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  className={secondaryButton}
                  to={`/projects/${projectId}/invariants/${invariant.id}`}
                >
                  Open
                </Link>
                {canMutate ? (
                  <>
                    <button
                      className={secondaryButton}
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.mutate(invariant.id)}
                      type="button"
                    >
                      <Copy aria-hidden="true" size={16} /> Duplicate
                    </button>
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-900 px-4 py-2 font-bold text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                      disabled={archive.isPending}
                      onClick={() => {
                        if (window.confirm(`Archive “${invariant.name}”?`))
                          archive.mutate(invariant.id);
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

function Summary({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`break-words font-bold text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function SemanticSummary({ label, status }: { label: string; status: Parameters<typeof MappedSemanticBadge>[0]['status'] }) {
  return <div className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-1"><MappedSemanticBadge status={status} /></dd></div>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
