import type { InvestigationEvent } from '@taskos/shared-types';
import { ArrowUpRight } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store.js';
import {
  CompletedRunSummary,
  EventTimeline,
  EvidenceSummary,
  InvestigationOverviewHeader,
  LiveFindingSummary,
  PanelState,
  ProgressSummary,
  RuntimeNav,
  WorkerPanel,
  WorldMatrix,
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
import { InvestigationReport } from './investigation-report.js';

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
  const { pathname } = useLocation();
  if (!investigationId) return <PanelState title="Investigation not found">The URL does not include an investigation ID.</PanelState>;

  const progress = useInvestigationProgress(investigationId);
  const status = progress.data?.status;
  const plan = useExperimentPlan(investigationId, status);
  const worlds = useInvestigationWorlds(investigationId, status);
  const experiments = useInvestigationExperiments(investigationId, status);
  const workers = useInvestigationWorkers(investigationId, status);
  const evidence = useInvestigationEvidence(investigationId, status);
  const findings = useInvestigationFindings(investigationId, status);
  const canVerifyRepair = useAuthStore((state) => state.permissions.includes('EDIT_PROJECTS'));

  if (progress.isLoading) return <PanelState title="Loading investigation">Loading investigation header, progress, and runtime status…</PanelState>;
  if (progress.error || !progress.data) {
    return <PanelState title="Investigation unavailable" retry={() => void progress.refetch()}>{progress.error instanceof Error ? progress.error.message : 'Rift could not load this investigation.'}</PanelState>;
  }

  const workerProvider = workers.data?.[0]?.provider;
  const worldsView = pathname.endsWith('/worlds');
  const liveView = pathname.endsWith('/live');

  return (
    <section className="mx-auto min-w-0 max-w-[1280px]">
      <header className="mb-6 flex flex-col gap-5 border-b border-[var(--rift-border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{progress.data.status} · Investigation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[var(--rift-text)] lg:text-[2.5rem]">
            {worldsView ? 'Tested worlds' : liveView ? 'Live investigation' : 'Investigation report'}
          </h1>
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
            {worldsView ? 'World outcomes, tested variables, and failure-region exploration.' : liveView ? `${phaseLabel(progress.data.status)}. Operational execution details update from the investigation API.` : 'Conclusion, evidence, and the smallest failure trigger established by Rift.'}
          </p>
        </div>
        <Link className="rift-button-secondary shrink-0 gap-2" to={`/investigations/${investigationId}/plan`}>
          Experiment plan <ArrowUpRight aria-hidden="true" size={14} />
        </Link>
      </header>
      <RuntimeNav investigationId={investigationId} />

      {worldsView ? (
        <div className="grid gap-5">
          {worlds.error || experiments.error || evidence.error ? (
            <PanelState title="World data partially unavailable" retry={() => { void worlds.refetch(); void experiments.refetch(); void evidence.refetch(); }}>
              One or more world panels could not load. Loaded panels remain visible.
            </PanelState>
          ) : null}
          <WorldTable worlds={worlds.data ?? []} experiments={experiments.data ?? []} workers={workers.data ?? []} evidence={evidence.data ?? []} />
          <details className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[var(--rift-text)] marker:hidden">Outcome matrix</summary>
            <div className="border-t border-[var(--rift-border)] p-5"><WorldMatrix worlds={worlds.data ?? []} experiments={experiments.data ?? []} workers={workers.data ?? []} evidence={evidence.data ?? []} /></div>
          </details>
        </div>
      ) : liveView ? (
        <div className="grid gap-5">
          <InvestigationOverviewHeader progress={progress.data} plan={plan.data} workerProvider={workerProvider} />
          <ProgressSummary progress={progress.data} />
          <CompletedRunSummary progress={progress.data} findings={findings.data ?? []} />
          {workers.error ? <PanelState title="Workers unavailable" retry={() => void workers.refetch()}>{workers.error instanceof Error ? workers.error.message : 'Worker data could not load.'}</PanelState> : <WorkerPanel workers={workers.data ?? []} experiments={experiments.data ?? []} />}
          <EventTimeline events={progress.data.recentEvents} />
        </div>
      ) : (
        <div className="grid gap-5">
          {findings.error || evidence.error || worlds.error || experiments.error ? (
            <PanelState title="Report data partially unavailable" retry={() => { void findings.refetch(); void evidence.refetch(); void worlds.refetch(); void experiments.refetch(); }}>
              One or more report sources could not load. Available conclusions and links remain visible.
            </PanelState>
          ) : null}
          <InvestigationReport
            canVerifyRepair={canVerifyRepair}
            evidence={evidence.data ?? []}
            experiments={experiments.data ?? []}
            findings={findings.data ?? []}
            investigationId={investigationId}
            progress={progress.data}
            worlds={worlds.data ?? []}
          />
          <details className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[var(--rift-text)] marker:hidden">Supporting runtime record</summary>
            <div className="grid gap-5 border-t border-[var(--rift-border)] p-5">
              <LiveFindingSummary findings={findings.data ?? []} investigationId={investigationId} investigationStatus={progress.data.status} />
              <EvidenceSummary evidence={evidence.data ?? []} />
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
