import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ExperimentPlanPanel, PanelState, RuntimeNav } from '../runtime/runtime-components.js';
import { useExperimentPlan, useInvestigationProgress } from '../runtime/use-runtime-queries.js';
import { demoPlanPreviewFixture } from './demo-plan-preview.fixture.js';

export function ExperimentPlanPage() {
  const { investigationId } = useParams();
  const [searchParams] = useSearchParams();
  const [demoPreviewExited, setDemoPreviewExited] = useState(false);
  if (!investigationId) return <PanelState title="Investigation not found">The URL does not include an investigation ID.</PanelState>;
  if (demoPlanPreviewEnabled(searchParams) && !demoPreviewExited) {
    return (
      <>
        <PageHeading
          eyebrow="DEMO PREVIEW"
          title="Experiment plan"
          description="Simulated successful ai& planning UI for presentation only. Not a persisted provider result."
          action={<Link className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink" to={`/investigations/${investigationId}`}>Back to overview</Link>}
        />
        <RuntimeNav investigationId={investigationId} />
        <ExperimentPlanPanel
          demoPreview={{
            onExit: () => setDemoPreviewExited(true),
          }}
          plan={demoPlanPreviewFixture}
        />
      </>
    );
  }

  return <PersistedExperimentPlanPage investigationId={investigationId} />;
}

function PersistedExperimentPlanPage({ investigationId }: { investigationId: string }) {
  const progress = useInvestigationProgress(investigationId);
  const plan = useExperimentPlan(investigationId, progress.data?.status);

  return (
    <>
      <PageHeading
        eyebrow={progress.data?.status ?? 'Planning'}
        title="Experiment plan"
        description="Validated planner output, fallback behaviour, selected variables, and world proposals."
        action={<Link className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink" to={`/investigations/${investigationId}`}>Back to overview</Link>}
      />
      <RuntimeNav investigationId={investigationId} />
      {plan.isLoading ? <PanelState title="Kimi is building the experiment plan">Loading persisted planner output and validation status…</PanelState> : null}
      {plan.error ? <PanelState title="Plan unavailable" retry={() => void plan.refetch()}>{plan.error instanceof Error ? plan.error.message : 'Rift could not load the experiment plan.'}</PanelState> : null}
      {!plan.isLoading && !plan.error ? <ExperimentPlanPanel plan={plan.data ?? null} /> : null}
    </>
  );
}

export function demoPlanPreviewEnabled(searchParams: URLSearchParams, env: Record<string, string | boolean | undefined> = import.meta.env): boolean {
  if (searchParams.get('demoPlanPreview') === 'true') return true;
  return env.VITE_DEMO_PLAN_PREVIEW_ENABLED === true || env.VITE_DEMO_PLAN_PREVIEW_ENABLED === 'true';
}
