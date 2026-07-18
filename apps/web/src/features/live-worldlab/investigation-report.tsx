import type { Finding, InvestigationProgress } from '@taskos/shared-types';
import { ArrowRight, Check, FileText, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  EvidenceArtifactResponse,
  InvestigationExperiment,
  InvestigationWorld,
} from '../../services/api/index.js';
import {
  completedWorlds,
  conditionRecord,
  failureBoundaryFromWorlds,
  failureBoundaryViewModel,
  formatConditionKey,
  formatConditionValue,
  humanize,
  phaseLabel,
  terminalSummary,
} from '../runtime/runtime-normalizers.js';

type InvestigationReportProps = {
  investigationId: string;
  progress: InvestigationProgress;
  findings: Finding[];
  evidence: EvidenceArtifactResponse[];
  worlds: InvestigationWorld[];
  experiments: InvestigationExperiment[];
  canVerifyRepair: boolean;
};

export function InvestigationReport({
  investigationId,
  progress,
  findings,
  evidence,
  worlds,
  experiments,
  canVerifyRepair,
}: InvestigationReportProps) {
  const finding = findings.find((item) => item.confidence === 'CONFIRMED') ?? findings[0];
  const active = !['COMPLETED', 'FAILED', 'CANCELLED'].includes(progress.status);
  const finalReports = evidence.filter((artifact) => artifact.type === 'FINAL_REPORT');
  const evidenceDescription = describeEvidence(evidence);
  const retained = finding ? conditionRecord(finding, 'retainedConditions') : {};
  const findingBoundary = finding ? failureBoundaryViewModel(finding) : undefined;
  const observedBoundary = failureBoundaryFromWorlds(worlds, experiments);
  const boundary = findingBoundary && (findingBoundary.passingBoundMs !== undefined || findingBoundary.failingBoundMs !== undefined)
    ? findingBoundary
    : observedBoundary;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]">
        <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.65fr)]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <ReportStatus>{phaseLabel(progress.status)}</ReportStatus>
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--rift-text-muted)]">{progress.status}</span>
            </div>
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rift-text-muted)]">Investigation conclusion</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.045em] text-[var(--rift-text)] sm:text-[2.55rem]">
              {conclusionTitle(progress, finding)}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--rift-text-secondary)]">
              {terminalSummary(progress, findings)}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {finding ? (
                <Link className="rift-button-primary gap-2" to={`/investigations/${investigationId}/findings/${finding.id}`}>
                  {finalReports.length ? 'Open final report' : 'Open finding'} <ArrowRight aria-hidden="true" size={14} />
                </Link>
              ) : (
                <Link className="rift-button-secondary gap-2" to={`/investigations/${investigationId}/worlds`}>
                  Review tested worlds <ArrowRight aria-hidden="true" size={14} />
                </Link>
              )}
              <Link className="rift-button-secondary gap-2" to={`/investigations/${investigationId}/findings`}>
                All findings
              </Link>
            </div>
          </div>

          <dl className="grid grid-cols-2 border-t border-[var(--rift-border)] lg:grid-cols-1 lg:border-l lg:border-t-0">
            <ReportMetric label="Confidence" value={finding ? humanize(finding.confidence) : active ? 'Pending' : 'No finding'} />
            <ReportMetric label="Validated reproductions" value={finding ? finding.reproductionCount.toLocaleString() : '0'} />
            <ReportMetric label="Evidence artifacts" value={evidence.length.toLocaleString()} />
            <ReportMetric label="Worlds tested" value={completedWorlds(progress.progress).toLocaleString()} />
          </dl>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <section className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] p-6">
          <SectionLabel>Confirmed finding</SectionLabel>
          {finding ? (
            <>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-[-0.025em] text-[var(--rift-text)]">{finding.title}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--rift-text-secondary)]">{finding.summary}</p>
                </div>
                <ReportStatus>{humanize(finding.confidence)}</ReportStatus>
              </div>
              <div className="mt-6 border-t border-[var(--rift-border)] pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--rift-text-muted)]">Minimal tested trigger</p>
                {Object.keys(retained).length ? (
                  <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {Object.entries(retained).slice(0, 6).map(([key, value]) => (
                      <div className="flex items-start justify-between gap-4 border-b border-[var(--rift-border)] pb-2.5" key={key}>
                        <dt className="text-xs text-[var(--rift-text-muted)]">{formatConditionKey(key)}</dt>
                        <dd className="text-right text-xs font-medium text-[var(--rift-text)]">{formatConditionValue(key, value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-[var(--rift-text-secondary)]">Rift has not recorded a retained minimal-tested condition set yet.</p>
                )}
                <p className="mt-3 text-xs leading-5 text-[var(--rift-text-muted)]">This is the smallest condition set established by this investigation, not a claim of global minimality.</p>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--rift-text-secondary)]">{active ? 'No confirmed Finding has been produced yet. This report updates as the investigation progresses.' : 'No business invariant violation was confirmed in the tested worlds.'}</p>
          )}
        </section>

        <div className="grid gap-5">
          <ReportAction
            description={finalReports.length ? evidenceDescription : `The final report has not been generated yet. ${evidenceDescription}`}
            href={finding ? `/investigations/${investigationId}/findings/${finding.id}` : `/investigations/${investigationId}/findings`}
            icon={<FileText aria-hidden="true" size={17} />}
            label={finalReports.length ? 'Read report and evidence' : 'Review evidence status'}
            title="Final report"
          />
          <ReportAction
            description={finding ? 'Replay the bounded persisted repair plan against an authorised target Environment.' : 'Repair Verification becomes available after Rift records a Finding.'}
            href={finding && canVerifyRepair ? `/investigations/${investigationId}/findings/${finding.id}/repair-verifications/new` : finding ? `/investigations/${investigationId}/findings/${finding.id}` : `/investigations/${investigationId}/findings`}
            icon={<ShieldCheck aria-hidden="true" size={17} />}
            label={finding && canVerifyRepair ? 'Verify repair' : finding ? 'Open finding' : 'View findings'}
            title="Repair Verification"
          />
        </div>
      </div>

      <FailureBoundary boundary={boundary} />
    </div>
  );
}

function FailureBoundary({ boundary }: { boundary: ReturnType<typeof failureBoundaryFromWorlds> }) {
  const passing = boundary.passingBoundMs;
  const failing = boundary.failingBoundMs;
  return (
    <section className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionLabel>Failure boundary</SectionLabel>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--rift-text)]">Observed tested interval</h2>
        </div>
        <span className="text-xs text-[var(--rift-text-muted)]">Target precision: {boundary.targetPrecisionMs !== undefined ? `${boundary.targetPrecisionMs.toLocaleString()} ms` : 'Not recorded'}</span>
      </div>
      {passing !== undefined || failing !== undefined ? (
        <>
          <div className="mt-6 grid grid-cols-[auto_minmax(40px,1fr)_auto_minmax(40px,1fr)_auto] items-center gap-3 text-xs">
            <BoundaryPoint label="Stable" value={passing !== undefined ? `${passing.toLocaleString()} ms` : 'Not established'} />
            <span className="h-px bg-[var(--rift-border-strong)]" />
            <BoundaryPoint label="Untested" value={passing !== undefined && failing !== undefined ? `${Math.max(0, failing - passing).toLocaleString()} ms interval` : 'Open interval'} />
            <span className="h-px bg-[var(--rift-border-strong)]" />
            <BoundaryPoint label="Failure" value={failing !== undefined ? `${failing.toLocaleString()} ms` : 'Not established'} />
          </div>
          <p className="mt-5 text-sm leading-6 text-[var(--rift-text-secondary)]">
            {passing !== undefined && failing !== undefined
              ? `Rift observed stable behaviour at or below ${passing.toLocaleString()} ms and failure at or above ${failing.toLocaleString()} ms. Values inside the interval remain unproven.`
              : 'Only one side of the tested boundary was established, so Rift does not present an exact causal threshold.'}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-[var(--rift-text-secondary)]">A bounded timing interval could not be established from the recorded worlds.</p>
      )}
    </section>
  );
}

function BoundaryPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-center">
      <span className="mx-auto block size-2 rounded-full bg-white" />
      <span className="mt-2 block font-medium text-[var(--rift-text)]">{value}</span>
      <span className="mt-0.5 block uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">{label}</span>
    </div>
  );
}

function ReportAction({ title, description, href, label, icon }: { title: string; description: string; href: string; label: string; icon: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] p-5">
      <div className="flex items-center gap-2 text-[var(--rift-text)]">{icon}<h2 className="font-semibold">{title}</h2></div>
      <p className="mt-3 text-sm leading-5 text-[var(--rift-text-secondary)]">{description}</p>
      <Link className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--rift-text)] hover:text-white" to={href}>{label}<ArrowRight aria-hidden="true" size={13} /></Link>
    </section>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-[var(--rift-border)] p-4 last:border-b-0 even:border-r-0 lg:border-r-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--rift-text-muted)]">{label}</dt>
      <dd className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-[var(--rift-text)]">{value}</dd>
    </div>
  );
}

function ReportStatus({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--rift-text)]"><Check aria-hidden="true" size={11} />{children}</span>;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[var(--rift-text-muted)]">{children}</p>;
}

function conclusionTitle(progress: InvestigationProgress, finding: Finding | undefined) {
  const status = String(progress.status);
  if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) return 'Rift is still testing the failure region.';
  if (status === 'FAILED') return 'The investigation stopped before a conclusion was reached.';
  if (status === 'CANCELLED') return 'The investigation was cancelled before completion.';
  if (!finding) return 'No invariant violation was confirmed in the tested worlds.';
  if (finding.confidence === 'CONFIRMED') return finding.title;
  return `Rift found evidence consistent with ${finding.title.toLowerCase()}`;
}

function describeEvidence(evidence: EvidenceArtifactResponse[]) {
  if (!evidence.length) return 'No evidence artifacts have been recorded yet.';
  const labels: Record<string, string> = {
    FINAL_REPORT: 'final reports',
    SCREENSHOT: 'screenshots',
    TRACE: 'traces',
    CONSOLE_LOG: 'console logs',
    NETWORK_LOG: 'network logs',
    WORKER_RESULT: 'worker results',
    ENVIRONMENT_MANIFEST: 'environment manifests',
  };
  const counts = evidence.reduce<Record<string, number>>((result, artifact) => {
    result[artifact.type] = (result[artifact.type] ?? 0) + 1;
    return result;
  }, {});
  const summary = Object.entries(counts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3)
    .map(([type, count]) => `${count.toLocaleString()} ${labels[type] ?? humanize(type).toLowerCase()}`)
    .join(', ');
  return `${evidence.length.toLocaleString()} linked artifacts: ${summary}.`;
}
