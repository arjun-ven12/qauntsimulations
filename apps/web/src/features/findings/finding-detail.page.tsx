import { Link, useParams } from 'react-router-dom';
import {
  FindingDetailSections,
  PanelState,
  RuntimeNav,
  StatusBadge,
} from '../runtime/runtime-components.js';
import {
  causalStatus,
  formatDate,
  humanize,
} from '../runtime/runtime-normalizers.js';
import {
  useFindingDetail,
  useInvestigationEvidence,
  useInvestigationExperiments,
  useInvestigationProgress,
  useInvestigationWorlds,
} from '../runtime/use-runtime-queries.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useRepairVerifications } from '../repair-verification/use-repair-verification.js';
import {
  confidenceTone,
  findingSeverityTone,
  findingStateStatus,
  repairVerificationTone,
} from '../runtime/semantic-status.js';

export function FindingDetailPage() {
  const { investigationId, findingId } = useParams();

  if (!investigationId || !findingId) {
    return (
      <PanelState title="Finding not found">
        The URL does not include both an investigation ID and finding ID.
      </PanelState>
    );
  }

  const progress = useInvestigationProgress(investigationId);
  const finding = useFindingDetail(investigationId, findingId);
  const status = progress.data?.status;
  const worlds = useInvestigationWorlds(investigationId, status);
  const experiments = useInvestigationExperiments(investigationId, status);
  const evidence = useInvestigationEvidence(investigationId, status);
  const repairVerifications = useRepairVerifications(findingId);
  const editable = useAuthStore((state) =>
    state.permissions.includes('EDIT_PROJECTS'),
  );

  if (finding.isLoading) {
    return (
      <PanelState title="Loading finding">
        Loading finding detail, minimisation metadata, and linked evidence…
      </PanelState>
    );
  }

  if (finding.error || !finding.data) {
    return (
      <PanelState
        title="Finding unavailable"
        retry={() => void finding.refetch()}
      >
        {finding.error instanceof Error
          ? finding.error.message
          : 'Rift could not load this finding.'}
      </PanelState>
    );
  }

  const findingState = causalStatus(finding.data);
  const reproducedRuns = finding.data.reproductionCount;
  const verification = repairVerifications.data?.[0];
  const verifyPath = `/investigations/${investigationId}/findings/${findingId}/repair-verifications/new`;

  const repairVerification = (
    <section
      className="card"
      id="repair-verification"
      aria-labelledby="repair-verification-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            className="text-xl font-bold"
            id="repair-verification-heading"
          >
            Repair Verification
          </h2>
          <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
            Replay the persisted exact reproduction, adjacent controls, and
            bounded regressions against a target environment.
          </p>
        </div>

        {editable ? (
          <Link className="rift-button-primary" to={verifyPath}>
            Verify repair
          </Link>
        ) : (
          <span className="text-sm text-[var(--rift-text-secondary)]">
            Edit access required
          </span>
        )}
      </div>

      <div className="mt-5 border-t border-[var(--rift-border)] pt-4">
        {verification ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <StatusBadge
              tone={repairVerificationTone(
                verification.executionStatus,
                verification.verificationResult,
              )}
            >
              {humanize(
                verification.verificationResult ??
                  verification.executionStatus,
              )}
            </StatusBadge>

            <span className="text-[var(--rift-text-secondary)]">
              Target{' '}
              <span className="font-mono text-xs">
                {verification.environmentId}
              </span>
            </span>

            <span className="text-[var(--rift-text-muted)]">
              Started{' '}
              {formatDate(
                verification.startedAt ?? verification.createdAt,
              )}
            </span>

            <Link
              className="font-medium underline decoration-[var(--rift-border-strong)] underline-offset-4"
              to={`/investigations/${investigationId}/findings/${findingId}/repair-verifications/${verification.repairVerificationId}`}
            >
              Open verification details
            </Link>
          </div>
        ) : (
          <p className="text-sm text-[var(--rift-text-secondary)]">
            {repairVerifications.isError
              ? 'Verification history is unavailable right now.'
              : 'No repair verification has been run yet.'}
          </p>
        )}
      </div>
    </section>
  );

  return (
    <>
      <header className="mb-7">
        <Link
          className="text-sm font-medium text-[var(--rift-text-secondary)] underline decoration-[var(--rift-border-strong)] underline-offset-4"
          to={`/investigations/${investigationId}/findings`}
        >
          ← Back to Findings
        </Link>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="eyebrow">
              {humanize(finding.data.confidence)} finding
            </div>

            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[var(--rift-text)] lg:text-4xl">
              {finding.data.title}
            </h1>

            <p className="mt-3 text-[var(--rift-text-secondary)]">
              {finding.data.summary}
            </p>

            <div
              className="mt-4 flex flex-wrap gap-2"
              aria-label="Finding status summary"
            >
              <StatusBadge tone={findingSeverityTone(finding.data.severity)}>
                {humanize(finding.data.severity)} severity
              </StatusBadge>

              <StatusBadge tone={confidenceTone(finding.data.confidence)}>
                {humanize(finding.data.confidence)} confidence
              </StatusBadge>

              <StatusBadge tone={findingStateStatus(findingState).tone}>
                {humanize(findingState)}
              </StatusBadge>

              <StatusBadge tone={reproducedRuns > 0 ? 'fail' : 'neutral'}>
                {reproducedRuns > 0
                  ? `${reproducedRuns} reproduced`
                  : 'Not reproduced'}
              </StatusBadge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="rift-button-secondary"
              to={`/investigations/${investigationId}`}
            >
              Open investigation
            </Link>

            {editable ? (
              <Link className="rift-button-primary" to={verifyPath}>
                Verify repair
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <RuntimeNav findingContext investigationId={investigationId} />

      {worlds.isError ? (
        <div className="mb-5">
          <PanelState
            title="World history unavailable"
            retry={() => void worlds.refetch()}
          >
            Finding detail loaded, but world history could not be loaded.
          </PanelState>
        </div>
      ) : null}

      {experiments.isError ? (
        <div className="mb-5">
          <PanelState
            title="Experiment history unavailable"
            retry={() => void experiments.refetch()}
          >
            Finding detail loaded, but experiment history could not be loaded.
          </PanelState>
        </div>
      ) : null}

      {evidence.isError ? (
        <div className="mb-5">
          <PanelState
            title="Evidence unavailable"
            retry={() => void evidence.refetch()}
          >
            Finding detail loaded, but evidence metadata could not be loaded.
          </PanelState>
        </div>
      ) : null}

      <FindingDetailSections
        evidence={evidence.data ?? finding.data.evidence}
        experiments={experiments.data ?? []}
        finding={finding.data}
        investigationStatus={progress.data?.status}
        repairVerification={repairVerification}
        worlds={worlds.data ?? []}
      />
    </>
  );
}
