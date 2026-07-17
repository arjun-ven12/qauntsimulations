import type { InvestigationEvent } from '@taskos/shared-types';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import {
  EventTimeline,
  EvidenceViewer,
  InvestigationOverviewHeader,
  PanelState,
  ProgressSummary,
  RuntimeNav,
  WorkerPanel,
  WorldTable,
} from '../runtime/runtime-components.js';
import { phaseLabel } from '../runtime/runtime-normalizers.js';
import {
  useExperimentPlan,
  useInvestigationEvidence,
  useInvestigationExperiments,
  useInvestigationFindings,
  useInvestigationProgress,
  useInvestigationWorkers,
  useInvestigationWorlds,
} from '../runtime/use-runtime-queries.js';

function metadataString(event: InvestigationEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function metadataNumber(event: InvestigationEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function providerLabel(event: InvestigationEvent) {
  const provider = metadataString(event, 'provider');
  if (!provider) return null;
  if (provider === 'LOCAL') return 'Local worker';
  if (provider === 'DAYTONA') return 'Daytona sandbox';
  return `Provider: ${provider}`;
}

export function timingLabels(event: InvestigationEvent) {
  return [
    ['Setup', metadataNumber(event, 'sandboxSetupDurationMs')],
    ['Worker', metadataNumber(event, 'workerExecutionDurationMs')],
    ['Artifacts', metadataNumber(event, 'artifactDownloadDurationMs')],
  ]
    .filter((item): item is [string, number] => item[1] !== null)
    .map(([label, value]) => `${label}: ${Math.round(value).toLocaleString()} ms`);
}

export function cleanupWarning(event: InvestigationEvent) {
  const phase = metadataString(event, 'phase');
  const outcome = metadataString(event, 'cleanupOutcome');
  const error = metadataString(event, 'error') ?? metadataString(event, 'cleanupError');
  if (phase !== 'sandbox_cleanup_failed' && outcome !== 'FAILED' && !error) return null;
  return error ? `Cleanup failed: ${error}` : 'Cleanup failed. Manual sandbox cleanup may be required.';
}

export function plannerLabels(event: InvestigationEvent) {
  return [
    ['Planner', metadataString(event, 'plannerProvenance')],
    ['Plan status', metadataString(event, 'plannerStatus')],
  ]
    .filter((item): item is [string, string] => item[1] !== null)
    .map(([label, value]) => `${label}: ${value.replaceAll('_', ' ')}`);
}

export function LiveWorldLabPage() {
  const { investigationId } = useParams();
  if (!investigationId) return <PanelState title="Investigation not found">The URL does not include an investigation ID.</PanelState>;

  const progress = useInvestigationProgress(investigationId);
  const status = progress.data?.status;
  const plan = useExperimentPlan(investigationId);
  const worlds = useInvestigationWorlds(investigationId, status);
  const experiments = useInvestigationExperiments(investigationId, status);
  const workers = useInvestigationWorkers(investigationId, status);
  const evidence = useInvestigationEvidence(investigationId, status);
  const findings = useInvestigationFindings(investigationId, status);

  if (progress.isLoading) return <PanelState title="Loading investigation">Loading investigation header, progress, and runtime status…</PanelState>;
  if (progress.error || !progress.data) {
    return <PanelState title="Investigation unavailable" retry={() => void progress.refetch()}>{progress.error instanceof Error ? progress.error.message : 'WorldLab could not load this investigation.'}</PanelState>;
  }

  const workerProvider = workers.data?.[0]?.provider;

  return (
    <>
      <PageHeading
        eyebrow={progress.data.status}
        title="Investigation overview"
        description={`${phaseLabel(progress.data.status)}. Runtime data is loaded from the investigation API.`}
        action={<Link className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink" to={`/investigations/${investigationId}/plan`}>View plan</Link>}
      />
      <RuntimeNav investigationId={investigationId} />
      <InvestigationOverviewHeader progress={progress.data} plan={plan.data} workerProvider={workerProvider} />
      <div className="grid gap-5">
        <ProgressSummary progress={progress.data} />
        {worlds.error || experiments.error || evidence.error ? (
          <PanelState title="World data partially unavailable" retry={() => { void worlds.refetch(); void experiments.refetch(); void evidence.refetch(); }}>
            One or more world panels could not load. Loaded panels remain visible.
          </PanelState>
        ) : null}
        <WorldTable worlds={worlds.data ?? []} experiments={experiments.data ?? []} evidence={evidence.data ?? []} />
        {workers.error ? <PanelState title="Workers unavailable" retry={() => void workers.refetch()}>{workers.error instanceof Error ? workers.error.message : 'Worker data could not load.'}</PanelState> : <WorkerPanel workers={workers.data ?? []} />}
        <EventTimeline events={progress.data.recentEvents} />
        {findings.error ? (
          <PanelState title="Findings unavailable" retry={() => void findings.refetch()}>{findings.error instanceof Error ? findings.error.message : 'Findings could not load.'}</PanelState>
        ) : (
          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">Findings</h2>
              <Link className="text-sm font-bold text-cyan" to={`/investigations/${investigationId}/findings`}>Open findings</Link>
            </div>
            <p className="mt-3 text-sm text-slate-400">{findings.data?.length ?? 0} findings linked to this investigation.</p>
          </section>
        )}
        {evidence.error ? <PanelState title="Evidence unavailable" retry={() => void evidence.refetch()}>{evidence.error instanceof Error ? evidence.error.message : 'Evidence could not load.'}</PanelState> : <EvidenceViewer evidence={evidence.data ?? []} />}
      </div>
    </>
  );
}
