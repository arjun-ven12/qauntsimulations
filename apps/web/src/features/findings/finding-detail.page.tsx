import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { FindingDetailSections, PanelState, RuntimeNav, StatusBadge } from '../runtime/runtime-components.js';
import { boundedRange, causalConditions, formatDate, formatValue, humanize, shortId } from '../runtime/runtime-normalizers.js';
import { useFindingDetail, useInvestigationEvidence, useInvestigationExperiments, useInvestigationProgress, useInvestigationWorlds } from '../runtime/use-runtime-queries.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { isActiveRepairVerification } from '../repair-verification/repair-verification-api.js';
import { useRepairVerifications } from '../repair-verification/use-repair-verification.js';

export function FindingDetailPage() {
  const { investigationId, findingId } = useParams();
  if (!investigationId || !findingId) return <PanelState title="Finding not found">The URL does not include both an investigation ID and finding ID.</PanelState>;

  const progress = useInvestigationProgress(investigationId);
  const finding = useFindingDetail(investigationId, findingId);
  const status = progress.data?.status;
  const worlds = useInvestigationWorlds(investigationId, status);
  const experiments = useInvestigationExperiments(investigationId, status);
  const evidence = useInvestigationEvidence(investigationId, status);
  const repairVerifications = useRepairVerifications(findingId);
  const editable = useAuthStore((state) => state.permissions.includes('EDIT_PROJECTS'));

  if (finding.isLoading) return <PanelState title="Loading finding">Loading finding detail, minimisation metadata, and linked evidence…</PanelState>;
  if (finding.error || !finding.data) {
    return <PanelState title="Finding unavailable" retry={() => void finding.refetch()}>{finding.error instanceof Error ? finding.error.message : 'Rift could not load this finding.'}</PanelState>;
  }

  const conditions = causalConditions(finding.data);
  const range = boundedRange(finding.data);
  const sourceWorld = conditions.sourceWorldId ?? conditions.worldId;
  const sourceExperiment = conditions.sourceExperimentId ?? conditions.experimentId;

  return (
    <>
      <PageHeading
        eyebrow={finding.data.confidence}
        title={finding.data.title}
        description="Rift finding detail with minimisation, evidence, and final report metadata."
        action={<Link className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink" to={`/investigations/${investigationId}/findings`}>Back to findings</Link>}
      />
      <RuntimeNav investigationId={investigationId} />
      <section className="card mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="font-bold">Repair Verification</h2><p className="mt-1 text-sm text-slate-400">Replay the bounded persisted repair plan against an authorised target Environment.</p></div>
          {editable ? <Link className="rounded-lg bg-cyan px-4 py-2 text-sm font-bold text-ink" to={`/investigations/${investigationId}/findings/${findingId}/repair-verifications/new`}>Verify repair</Link> : <span className="text-sm text-slate-400">Edit access required</span>}
        </div>
        {repairVerifications.data?.[0] ? <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><StatusBadge tone={repairVerifications.data[0].executionStatus === 'COMPLETED' ? 'green' : repairVerifications.data[0].executionStatus === 'FAILED' ? 'red' : 'slate'}>{repairVerifications.data[0].executionStatus}</StatusBadge><span>{repairVerifications.data[0].verificationResult?.replaceAll('_', ' ') ?? (isActiveRepairVerification(repairVerifications.data[0].executionStatus) ? 'Verification in progress' : 'No conclusive result')}</span><Link className="text-cyan underline" to={`/investigations/${investigationId}/findings/${findingId}/repair-verifications/${repairVerifications.data[0].repairVerificationId}`}>Open verification</Link></div> : null}
        {repairVerifications.isError ? <p className="mt-3 text-sm text-slate-400">Repair Verification history is unavailable right now.</p> : null}
      </section>
      <div className="mb-5 grid gap-4 lg:grid-cols-4">
        <div className="card"><div className="text-xs text-slate-500">Investigation</div><div className="mt-1 font-mono text-sm" title={investigationId}>{shortId(investigationId, 12)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Status</div><div className="mt-1"><StatusBadge tone={progress.data?.status === 'COMPLETED' ? 'green' : 'slate'}>{progress.data?.status ?? 'Unknown'}</StatusBadge></div></div>
        <div className="card"><div className="text-xs text-slate-500">First observed</div><div className="mt-1 text-sm">{formatDate(finding.data.createdAt)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Bounded range</div><div className="mt-1 text-sm">{formatValue(range.knownPassingDelayMs ?? range.lowerPassingBoundMs)} → {formatValue(range.knownFailingDelayMs ?? range.upperFailingBoundMs)} ms</div></div>
      </div>
      <section className="card mb-5">
        <h2 className="font-bold">Source observation</h2>
        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-950 p-3"><dt className="text-xs text-slate-500">Source world</dt><dd className="mt-1 font-mono text-sm">{formatValue(sourceWorld)}</dd></div>
          <div className="rounded-xl bg-slate-950 p-3"><dt className="text-xs text-slate-500">Source experiment</dt><dd className="mt-1 font-mono text-sm">{formatValue(sourceExperiment)}</dd></div>
          <div className="rounded-xl bg-slate-950 p-3"><dt className="text-xs text-slate-500">Failed invariants</dt><dd className="mt-1 text-sm">{Array.isArray(conditions.failedInvariantIds) ? conditions.failedInvariantIds.map(String).join(', ') : 'Not recorded'}</dd></div>
        </dl>
      </section>
      <section className="card mb-5">
        <h2 className="font-bold">Reproduction</h2>
        <p className="mt-3 text-sm text-slate-400">
          {finding.data.reproductions.filter((run) => run.reproduced).length} reproduced runs and {finding.data.reproductions.filter((run) => !run.reproduced).length} contradictory/control runs are linked to this finding.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {finding.data.reproductions.map((run) => <StatusBadge key={run.id} tone={run.reproduced ? 'red' : 'green'}>{humanize(run.reproduced ? 'reproduced' : 'did_not_reproduce')}</StatusBadge>)}
        </div>
      </section>
      {worlds.isError ? <PanelState title="World history unavailable" retry={() => void worlds.refetch()}>Finding detail loaded, but world history could not be loaded.</PanelState> : null}
      {experiments.isError ? <PanelState title="Experiment history unavailable" retry={() => void experiments.refetch()}>Finding detail loaded, but experiment history could not be loaded.</PanelState> : null}
      {evidence.isError ? <PanelState title="Evidence unavailable" retry={() => void evidence.refetch()}>Finding detail loaded, but evidence metadata could not be loaded.</PanelState> : null}
      <FindingDetailSections
        evidence={evidence.data ?? finding.data.evidence}
        experiments={experiments.data ?? []}
        finding={finding.data}
        investigationStatus={progress.data?.status}
        worlds={worlds.data ?? []}
      />
    </>
  );
}
