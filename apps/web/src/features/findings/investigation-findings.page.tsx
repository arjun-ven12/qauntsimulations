import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { FindingsList, PanelState, RuntimeNav } from '../runtime/runtime-components.js';
import { phaseLabel } from '../runtime/runtime-normalizers.js';
import { useInvestigationFindings, useInvestigationProgress } from '../runtime/use-runtime-queries.js';

export function InvestigationFindingsPage() {
  const { investigationId } = useParams();
  if (!investigationId) return <PanelState title="Investigation not found">The URL does not include an investigation ID.</PanelState>;

  const progress = useInvestigationProgress(investigationId);
  const findings = useInvestigationFindings(investigationId, progress.data?.status);

  return (
    <>
      <PageHeading
        eyebrow={progress.data?.status ?? 'Findings'}
        title="Investigation findings"
        description={progress.data ? `${phaseLabel(progress.data.status)} · ${progress.data.findingsCount} findings recorded.` : 'Evidence-backed invariant findings.'}
        action={<Link className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink" to={`/investigations/${investigationId}`}>Back to overview</Link>}
      />
      <RuntimeNav investigationId={investigationId} />
      {findings.isLoading ? <PanelState title="Loading findings">Loading evidence-backed findings…</PanelState> : null}
      {findings.error ? <PanelState title="Findings unavailable" retry={() => void findings.refetch()}>{findings.error instanceof Error ? findings.error.message : 'WorldLab could not load findings.'}</PanelState> : null}
      {!findings.isLoading && !findings.error ? <FindingsList investigationId={investigationId} findings={findings.data ?? []} /> : null}
    </>
  );
}
