import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { FindingDetailSections, PanelState, RuntimeNav, StatusBadge } from '../runtime/runtime-components.js';
import { boundedRange, causalConditions, formatDate, formatValue, humanize, shortId } from '../runtime/runtime-normalizers.js';
import { useFindingDetail, useInvestigationProgress } from '../runtime/use-runtime-queries.js';

export function FindingDetailPage() {
  const { investigationId, findingId } = useParams();
  if (!investigationId || !findingId) return <PanelState title="Finding not found">The URL does not include both an investigation ID and finding ID.</PanelState>;

  const progress = useInvestigationProgress(investigationId);
  const finding = useFindingDetail(investigationId, findingId);

  if (finding.isLoading) return <PanelState title="Loading finding">Loading finding detail, minimisation metadata, and linked evidence…</PanelState>;
  if (finding.error || !finding.data) {
    return <PanelState title="Finding unavailable" retry={() => void finding.refetch()}>{finding.error instanceof Error ? finding.error.message : 'WorldLab could not load this finding.'}</PanelState>;
  }

  const conditions = causalConditions(finding.data);
  const range = boundedRange(finding.data);

  return (
    <>
      <PageHeading
        eyebrow={finding.data.confidence}
        title={finding.data.title}
        description="Runtime-backed finding detail with minimisation, evidence, and final report metadata."
        action={<Link className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink" to={`/investigations/${investigationId}/findings`}>Back to findings</Link>}
      />
      <RuntimeNav investigationId={investigationId} />
      <div className="mb-5 grid gap-4 lg:grid-cols-4">
        <div className="card"><div className="text-xs text-slate-500">Investigation</div><div className="mt-1 font-mono text-sm" title={investigationId}>{shortId(investigationId, 12)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Status</div><div className="mt-1"><StatusBadge tone={progress.data?.status === 'COMPLETED' ? 'green' : 'slate'}>{progress.data?.status ?? 'Unknown'}</StatusBadge></div></div>
        <div className="card"><div className="text-xs text-slate-500">First observed</div><div className="mt-1 text-sm">{formatDate(finding.data.createdAt)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Bounded range</div><div className="mt-1 text-sm">{formatValue(range.knownPassingDelayMs ?? range.lowerPassingBoundMs)} → {formatValue(range.knownFailingDelayMs ?? range.upperFailingBoundMs)} ms</div></div>
      </div>
      <section className="card mb-5">
        <h2 className="font-bold">Source observation</h2>
        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-950 p-3"><dt className="text-xs text-slate-500">Source world</dt><dd className="mt-1 font-mono text-sm">{formatValue(conditions.sourceWorldId)}</dd></div>
          <div className="rounded-xl bg-slate-950 p-3"><dt className="text-xs text-slate-500">Source experiment</dt><dd className="mt-1 font-mono text-sm">{formatValue(conditions.sourceExperimentId)}</dd></div>
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
      <FindingDetailSections finding={finding.data} />
    </>
  );
}
