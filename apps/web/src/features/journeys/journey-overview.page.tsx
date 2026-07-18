import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SemanticBadge, SemanticStatus } from '../../components/semantic-status.js';
import { environmentApi } from '../../services/environment-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { validationStatus } from '../runtime/semantic-status.js';
import {
  primaryButton,
  ProjectLoading,
  ProjectMessage,
  secondaryButton,
} from '../projects/project-ui.js';
import {
  checksForStep,
  groupJourneySteps,
  humanStepLabel,
  isSensitiveStep,
  phaseTone,
  technicalActionLabel,
  type JourneyPhase,
  type JourneyPhaseTone,
} from './journey-presentation.js';
import {
  journeyApi,
  type Journey,
  type JourneyStep,
  type JourneyValidationCheck,
  type JourneyValidationResult,
} from './journey-api.js';
import { useCanMutateJourneys } from './journey-permissions.js';

export function JourneyOverviewPage() {
  const { projectId = '', journeyId = '' } = useParams();
  const canMutate = useCanMutateJourneys();
  const role = useAuthStore((state) => state.organisation?.role);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [lastValidatedAt, setLastValidatedAt] = useState<Date | null>(null);
  const journey = useQuery({
    queryKey: ['journey', projectId, journeyId],
    queryFn: () => journeyApi.get(projectId, journeyId),
  });
  const environments = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentApi.list(projectId),
  });
  const validate = useMutation({
    mutationFn: () => journeyApi.validate(projectId, journeyId),
    onSuccess: (result) => {
      queryClient.setQueryData(['journey', projectId, journeyId], result.journey);
      void queryClient.invalidateQueries({ queryKey: ['journeys', projectId] });
      setLastValidatedAt(new Date());
      setExpanded((current) => {
        const next = new Set(current);
        for (const phase of groupJourneySteps(result.journey.steps)) {
          if (
            phaseTone(phase, result.status, result.checks) === 'fail' ||
            phaseTone(phase, result.status, result.checks) === 'pending'
          )
            next.add(phase.id);
        }
        return next;
      });
    },
  });

  if (journey.isPending) return <ProjectLoading label="Loading Journey…" />;
  if (journey.isError)
    return <ProjectMessage description={journey.error.message} title="Journey unavailable" />;

  const item = journey.data;
  const environment = environments.data?.find((candidate) => candidate.id === item.environmentId);
  const checks = validate.data?.checks ?? [];
  const phases = groupJourneySteps(item.steps);
  const canStart =
    item.state === 'ENABLED' && item.validationStatus === 'READY' && role !== 'VIEWER';
  const startReason =
    item.state !== 'ENABLED'
      ? 'Enable this Journey before starting an Investigation.'
      : item.validationStatus !== 'READY'
        ? 'Validate this Journey successfully before starting an Investigation.'
        : role === 'VIEWER'
          ? 'Viewer access cannot start an Investigation.'
          : '';

  return (
    <section className="mx-auto min-w-0 max-w-[1120px]">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--rift-border)] pb-6">
        <div className="min-w-0">
          <p className="eyebrow">Journey overview</p>
          <h1 className="mt-2 break-words text-3xl font-black lg:text-4xl">{item.name}</h1>
          <p className="mt-2 max-w-2xl break-words text-[var(--rift-text-secondary)]">
            {item.description || 'No description'}
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {canStart ? (
            <Link className={primaryButton} to={`/projects/${projectId}/investigations/new`}>
              Start Investigation
            </Link>
          ) : (
            <button
              aria-describedby="investigation-unavailable"
              className={primaryButton}
              disabled
              type="button"
            >
              Start Investigation
            </button>
          )}
          {canMutate ? (
            <button
              className={secondaryButton}
              disabled={validate.isPending}
              onClick={() => validate.mutate()}
              type="button"
            >
              {validate.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                    size={16}
                  />
                  Validating…
                </span>
              ) : (
                'Validate Journey'
              )}
            </button>
          ) : null}
          {canMutate ? (
            <Link
              className={secondaryButton}
              to={`/projects/${projectId}/journeys/${journeyId}/settings`}
            >
              Edit Journey
            </Link>
          ) : null}
        </div>
      </header>

      {!canStart ? (
        <p
          className="mt-3 text-right text-xs text-[var(--rift-text-muted)]"
          id="investigation-unavailable"
        >
          {startReason}
        </p>
      ) : null}
      {!canMutate ? (
        <p className="mt-4 border border-[var(--rift-border)] bg-[var(--rift-surface)] p-4 text-sm text-[var(--rift-text-secondary)]">
          You have read-only Journey access.
        </p>
      ) : null}

      <OverviewCard
        environmentName={environment?.name ?? 'Unavailable'}
        item={item}
        lastValidatedAt={lastValidatedAt}
        validating={validate.isPending}
      />

      {validate.error ? (
        <p className="mt-4 text-sm text-[var(--status-fail-fg)]" role="alert">
          {validate.error.message}
        </p>
      ) : null}
      {validate.data ? <ValidationSummary result={validate.data} /> : null}

      <JourneyMap
        checks={checks}
        phases={phases}
        validating={validate.isPending}
        validation={item.validationStatus}
      />

      <section className="mt-8" aria-labelledby="execution-path-title">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--rift-border)] pb-4">
          <div>
            <p className="eyebrow">Technical implementation</p>
            <h2 className="mt-2 text-xl font-black" id="execution-path-title">
              Detailed execution path
            </h2>
            <p className="mt-1 text-sm text-[var(--rift-text-secondary)]">
              Expand a phase to inspect its ordered actions and selectors.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className={secondaryButton}
              onClick={() => setExpanded(new Set(phases.map((phase) => phase.id)))}
              type="button"
            >
              Expand all
            </button>
            <button
              className={secondaryButton}
              onClick={() => setExpanded(new Set())}
              type="button"
            >
              Collapse all
            </button>
          </div>
        </div>
        <ol className="divide-y divide-[var(--rift-border)]" aria-label="Journey execution phases">
          {phases.map((phase, index) => (
            <PhaseRow
              checks={checks}
              expanded={expanded.has(phase.id)}
              index={index}
              key={phase.id}
              onToggle={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(phase.id)) next.delete(phase.id);
                  else next.add(phase.id);
                  return next;
                })
              }
              phase={phase}
              tone={phaseTone(phase, item.validationStatus, checks, validate.isPending)}
            />
          ))}
        </ol>
      </section>
    </section>
  );
}

function OverviewCard({
  environmentName,
  item,
  lastValidatedAt,
  validating,
}: {
  environmentName: string;
  item: Journey;
  lastValidatedAt: Date | null;
  validating: boolean;
}) {
  const semantic = validating
    ? { tone: 'running' as const, label: 'Validation running' }
    : validationStatus(item.state === 'DRAFT' ? 'DRAFT' : item.validationStatus);
  return (
    <section
      className="mt-6 border-y border-[var(--rift-border)] bg-[var(--rift-surface)] px-5 py-5"
      aria-label="Journey overview details"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">{semantic.label}</p>
        <SemanticBadge label={semantic.label} tone={semantic.tone} />
      </div>
      <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewItem label="Environment" value={environmentName} />
        <OverviewItem
          label="Journey state"
          value={item.state === 'ENABLED' ? 'Enabled' : 'Draft'}
        />
        <OverviewItem
          label="Validation state"
          value={validationStatus(item.validationStatus).label}
        />
        <OverviewItem label="Executable steps" value={String(item.steps.length)} />
        <OverviewItem
          label="Last validated"
          value={lastValidatedAt ? 'Just now' : 'Not available'}
        />
        <OverviewItem label="Entry point" mono value={item.startPath || 'Not configured'} />
        <OverviewItem label="Completion" value={completionSummary(item)} />
      </div>
    </section>
  );
}

function OverviewItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--rift-text-muted)]">
        {label}
      </dt>
      <dd className={`mt-1 break-words text-sm font-semibold ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function JourneyMap({
  phases,
  validation,
  checks,
  validating,
}: {
  phases: JourneyPhase<JourneyStep>[];
  validation: Journey['validationStatus'];
  checks: JourneyValidationCheck[];
  validating: boolean;
}) {
  return (
    <section className="mt-8 min-w-0" aria-labelledby="journey-map-title">
      <p className="eyebrow">Business journey</p>
      <h2 className="mt-2 text-xl font-black" id="journey-map-title">
        Journey map
      </h2>
      <div className="mt-4 overflow-x-auto pb-2" data-testid="journey-map-scroll">
        <ol className="flex min-w-max items-stretch" aria-label="High-level journey map">
          {phases.map((phase, index) => {
            const tone = phaseTone(phase, validation, checks, validating);
            return (
              <li className="flex items-center" key={phase.id}>
                {index ? (
                  <span aria-hidden="true" className="px-2 text-[var(--rift-text-muted)]">
                    →
                  </span>
                ) : null}
                <div className="w-44 border border-[var(--rift-border)] bg-[var(--rift-surface)] p-3">
                  <SemanticStatus label={toneLabel(tone)} tone={tone} />
                  <p className="mt-3 font-bold">{phase.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--rift-text-secondary)]">
                    {phase.steps.length} {phase.steps.length === 1 ? 'step' : 'steps'}
                  </p>
                  <p className="mt-2 text-xs text-[var(--rift-text-muted)]">{phase.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function PhaseRow({
  phase,
  index,
  expanded,
  tone,
  checks,
  onToggle,
}: {
  phase: JourneyPhase<JourneyStep>;
  index: number;
  expanded: boolean;
  tone: JourneyPhaseTone;
  checks: JourneyValidationCheck[];
  onToggle(): void;
}) {
  const panelId = `phase-${phase.id}`;
  return (
    <li>
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        className="grid min-h-14 w-full grid-cols-[32px_40px_minmax(0,1fr)_auto] items-center gap-3 px-1 py-3 text-left hover:bg-[var(--rift-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={onToggle}
        type="button"
      >
        <span aria-hidden="true" className={`rift-semantic-label--${tone}`}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
        <span className="font-mono text-xs text-[var(--rift-text-muted)]">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0">
          <span className="block font-bold">{phase.title}</span>
          <span className="block truncate text-xs text-[var(--rift-text-muted)]">
            {phase.description}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
          <SemanticStatus label={toneLabel(tone)} tone={tone} />
          <span className="whitespace-nowrap text-xs text-[var(--rift-text-secondary)]">
            {phase.steps.length} {phase.steps.length === 1 ? 'step' : 'steps'}
          </span>
        </span>
      </button>
      {expanded ? (
        <ol
          className="border-t border-[var(--rift-border)] bg-[var(--rift-surface)]"
          id={panelId}
          aria-label={`${phase.title} steps`}
        >
          {phase.steps.map((step) => (
            <StepRow checks={checksForStep(checks, step.order)} key={step.id} step={step} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function StepRow({ step, checks }: { step: JourneyStep; checks: JourneyValidationCheck[] }) {
  return (
    <li className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-[var(--rift-border)] px-4 py-4 last:border-b-0 sm:px-12">
      <span className="font-mono text-xs text-[var(--rift-text-muted)]">
        {String(step.order + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{humanStepLabel(step)}</p>
        <p className="mt-1 text-xs text-[var(--rift-text-secondary)]">
          {technicalActionLabel(step.action)}
        </p>
        {step.selector ? (
          <code className="mt-2 block break-all text-xs text-[var(--rift-text-muted)]">
            {step.selector}
          </code>
        ) : null}
        {step.value ? (
          <p className="mt-2 break-all font-mono text-xs text-[var(--rift-text-muted)]">
            Value: {isSensitiveStep(step) ? '••••••••' : step.value}
          </p>
        ) : null}
        {step.metadata.timeoutMs ? (
          <p className="mt-2 text-xs text-[var(--rift-text-muted)]">
            Timeout: {step.metadata.timeoutMs.toLocaleString()} ms
          </p>
        ) : null}
        {checks.map((check) => {
          const tone =
            check.status === 'FAILED' ? 'fail' : check.status === 'WARNING' ? 'pending' : 'pass';
          return (
            <p
              className={`rift-semantic-callout--${tone} mt-3 border-l-2 pl-3 text-sm text-[var(--rift-text-secondary)]`}
              key={`${check.key}-${check.message}`}
            >
              <strong className={`rift-semantic-label--${tone}`}>
                {readableStatus(check.status)}
              </strong>{' '}
              — {check.message}
            </p>
          );
        })}
      </div>
    </li>
  );
}

function ValidationSummary({ result }: { result: JourneyValidationResult }) {
  const counts = result.checks.reduce(
    (total, check) => ({ ...total, [check.status]: total[check.status] + 1 }),
    { PASSED: 0, WARNING: 0, FAILED: 0 },
  );
  return (
    <section
      className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border border-[var(--rift-border)] bg-[var(--rift-surface)] p-4"
      aria-live="polite"
    >
      <SemanticBadge
        label={validationStatus(result.status).label}
        tone={validationStatus(result.status).tone}
      />
      <p className="text-sm text-[var(--rift-text-secondary)]">
        {counts.PASSED} passed · {counts.WARNING} warning · {counts.FAILED} failed
      </p>
      {result.checks
        .filter((check) => check.stepOrder === undefined)
        .map((check) => (
          <p
            className="basis-full text-sm text-[var(--rift-text-secondary)]"
            key={`${check.key}-${check.message}`}
          >
            <strong>{readableStatus(check.status)}</strong>: {check.message}
          </p>
        ))}
    </section>
  );
}

function completionSummary(item: Journey): string {
  const condition = item.completionCondition;
  if (/order-id|order[_-]?number/i.test(condition.selector)) return 'Order ID visible';
  if (condition.type === 'TEXT') return `Expected text visible in ${condition.selector}`;
  return `${condition.selector || 'Configured element'} visible`;
}

function toneLabel(tone: JourneyPhaseTone): string {
  return {
    pass: 'Validated',
    running: 'Validating',
    pending: 'Warning',
    fail: 'Invalid',
    neutral: 'Not validated',
  }[tone];
}

function readableStatus(status: JourneyValidationCheck['status']): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
