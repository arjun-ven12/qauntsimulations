import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ExperimentPlanPanel, PanelState, RuntimeNav } from '../runtime/runtime-components.js';
import { humanize, plannerProviderLabel, providerFromPlan } from '../runtime/runtime-normalizers.js';
import { useExperimentPlan, useInvestigationProgress } from '../runtime/use-runtime-queries.js';

export function ExperimentPlanPage() {
  const { investigationId } = useParams();
  if (!investigationId) return <PanelState title="Investigation not found">The URL does not include an investigation ID.</PanelState>;

  const progress = useInvestigationProgress(investigationId);
  const plan = useExperimentPlan(investigationId);
  const providers = providerFromPlan(plan.data);

  return (
    <>
      <PageHeading
        eyebrow={progress.data?.status ?? 'Planning'}
        title="Experiment plan"
        description="Validated planner output, fallback behaviour, selected variables, and world proposals."
        action={<Link className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink" to={`/investigations/${investigationId}`}>Back to overview</Link>}
      />
      <RuntimeNav investigationId={investigationId} />
      {plan.isLoading ? <PanelState title="Loading plan">Loading planner output…</PanelState> : null}
      {plan.error ? <PanelState title="Plan unavailable" retry={() => void plan.refetch()}>{plan.error instanceof Error ? plan.error.message : 'Rift could not load the experiment plan.'}</PanelState> : null}
      {!plan.isLoading && !plan.error ? <ExperimentPlanPanel plan={plan.data ?? null} /> : null}
      <section className="card mt-5">
        <h2 className="font-bold">Planner provenance</h2>
        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-950 p-3"><dt className="text-xs text-slate-500">Requested provider</dt><dd className="mt-1 font-bold">{plannerProviderLabel(providers.requested)}</dd></div>
          <div className="rounded-xl bg-slate-950 p-3"><dt className="text-xs text-slate-500">Effective provider</dt><dd className="mt-1 font-bold">{plannerProviderLabel(providers.effective)}</dd></div>
          <div className="rounded-xl bg-slate-950 p-3"><dt className="text-xs text-slate-500">Planner status</dt><dd className="mt-1 font-bold">{humanize(providers.status)}</dd></div>
        </dl>
      </section>
    </>
  );
}
