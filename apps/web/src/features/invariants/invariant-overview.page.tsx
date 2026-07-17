import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ProjectLoading, ProjectMessage, secondaryButton } from '../projects/project-ui.js';
import { invariantApi } from './invariant-api.js';
import { templateName, toFormValue } from './invariant-form.model.js';
import { useCanMutateInvariants } from './invariant-permissions.js';
import {
  InvariantStructuredPreview,
  InvariantValidationPanel,
  StatusPill,
} from './invariant-structured-preview.js';

export function InvariantOverviewPage() {
  const { projectId = '', invariantId = '' } = useParams();
  const canMutate = useCanMutateInvariants();
  const queryClient = useQueryClient();
  const invariant = useQuery({
    queryKey: ['invariant', projectId, invariantId],
    queryFn: () => invariantApi.get(projectId, invariantId),
  });
  const validate = useMutation({
    mutationFn: () => invariantApi.validate(projectId, invariantId),
    onSuccess: (result) => {
      queryClient.setQueryData(['invariant', projectId, invariantId], result.invariant);
      void queryClient.invalidateQueries({ queryKey: ['invariants', projectId] });
    },
  });

  if (invariant.isPending) return <ProjectLoading label="Loading Invariant…" />;
  if (invariant.isError)
    return <ProjectMessage description={invariant.error.message} title="Invariant unavailable" />;

  const item = invariant.data;
  const supported = Boolean(item.type && item.configuration && item.severity);
  return (
    <section className="mx-auto max-w-[1120px] min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Invariant overview</p>
          <h1 className="mt-2 break-words text-3xl font-black lg:text-4xl">{item.name}</h1>
          <p className="mt-2 max-w-2xl break-words text-slate-400">{item.description}</p>
        </div>
        {canMutate && supported ? (
          <Link
            className={secondaryButton}
            to={`/projects/${projectId}/invariants/${invariantId}/settings`}
          >
            Edit Settings
          </Link>
        ) : null}
      </div>
      {!canMutate ? (
        <p className="mt-5 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
          You have read-only Invariant access.
        </p>
      ) : null}
      <dl className="card mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <OverviewItem
          label="Template"
          value={item.type ? templateName(item.type) : 'Unsupported legacy definition'}
        />
        <OverviewItem label="Evaluator" value={item.type ?? 'Unavailable'} mono />
        <OverviewItem label="Severity" value={item.severity ?? 'Unavailable'} />
        <OverviewItem label="State" value={item.enabled ? 'Enabled' : 'Disabled'} />
        <div className="min-w-0">
          <dt className="text-slate-500">Validation</dt>
          <dd className="mt-1"><StatusPill status={item.validationStatus} /></dd>
        </div>
        <OverviewItem
          label="Runtime compatibility"
          value={
            !supported
              ? 'Unsupported definition'
              : item.enabled
                ? 'Runtime compatible'
                : 'Excluded while disabled'
          }
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
            {validate.isPending ? 'Validating…' : 'Validate Invariant'}
          </button>
        </div>
      ) : null}
      {validate.error ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {validate.error.message}
        </p>
      ) : null}
      {validate.data ? (
        <div className="mt-6">
          <InvariantValidationPanel result={validate.data} />
        </div>
      ) : (
        <div className="card mt-6">
          <h2 className="font-black">Validation checks</h2>
          <p className="mt-2 text-sm text-slate-400">
            {canMutate
              ? 'Run validation to load the backend checks and returned messages.'
              : `No check details are loaded. Current validation state: ${item.validationStatus}.`}
          </p>
        </div>
      )}
      {supported ? (
        <div className="mt-6">
          <InvariantStructuredPreview value={toFormValue(item)} />
        </div>
      ) : (
        <ProjectMessage
          description="The stored definition does not match a supported evaluator schema. Recreate it from one of the two supported templates."
          title="Structured preview unavailable"
        />
      )}
    </section>
  );
}

function OverviewItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words font-bold ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
