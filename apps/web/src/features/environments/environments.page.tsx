import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { MappedSemanticBadge } from '../../components/semantic-status.js';
import { environmentApi, type Environment } from '../../services/environment-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';
import { environmentStatus } from '../runtime/semantic-status.js';
import {
  connectionCompleteness,
  environmentListSummary,
  readableEnvironmentValue,
  resetSchedule,
  validationResultSummary,
} from './environment-list.model.js';

export function EnvironmentsPage() {
  const { projectId = '' } = useParams();
  const permissions = useAuthStore((state) => state.permissions);
  const query = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentApi.list(projectId),
  });
  const editable = permissions.includes('EDIT_PROJECTS');
  if (query.isPending) return <p>Loading environments…</p>;
  if (query.isError) return <p role="alert">Environments could not be loaded.</p>;
  const summary = environmentListSummary(query.data);

  return (
    <section className="min-w-0">
      <PageHeading
        action={
          editable ? (
            <Link className={primaryButton} to={`/projects/${projectId}/environments/new`}>
              Create environment
            </Link>
          ) : undefined
        }
        description="Define where Rift may run journeys and experiments."
        eyebrow="Project setup"
        title="Environments"
      />

      <dl className="grid overflow-hidden rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label={summary.total === 1 ? 'Environment' : 'Environments'} value={summary.total} />
        <SummaryMetric label="Ready" value={summary.ready} />
        <SummaryMetric label="Default" value={summary.defaults} />
        <SummaryMetric label="Attention required" value={summary.attention} />
      </dl>

      {!editable ? (
        <p className="mt-4 rounded-lg border border-[var(--rift-border)] bg-[var(--rift-surface)] p-3 text-sm text-[var(--rift-text-secondary)]">
          You have read-only Environment access.
        </p>
      ) : null}

      {query.data.length === 0 ? (
        <div className="card mt-6">
          Create an environment to define where Rift may run journeys and experiments.
        </div>
      ) : (
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {query.data.map((environment) => (
            <EnvironmentCard editable={editable} environment={environment} key={environment.id} projectId={projectId} />
          ))}
        </div>
      )}
    </section>
  );
}

function EnvironmentCard({
  editable,
  environment,
  projectId,
}: {
  editable: boolean;
  environment: Environment;
  projectId: string;
}) {
  const visibleActions = environment.allowedActions.slice(0, 3);
  const hiddenActionCount = environment.allowedActions.length - visibleActions.length;

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]">
      <div className="border-b border-[var(--rift-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--rift-text-muted)]">
                {readableEnvironmentValue(environment.type)}
              </span>
              {environment.isDefault ? <span className="badge">Default</span> : null}
            </div>
            <h2 className="mt-2 break-words text-xl font-semibold tracking-tight text-[var(--rift-text)]">
              {environment.name}
            </h2>
            {environment.description ? (
              <p className="mt-1 break-words text-sm text-[var(--rift-text-secondary)]">
                {environment.description}
              </p>
            ) : null}
          </div>
          <MappedSemanticBadge status={environmentStatus(environment.validationStatus)} />
        </div>
        <p className="mt-4 break-all font-mono text-xs text-[var(--rift-text-secondary)]">
          {environment.baseUrl}
        </p>
      </div>

      <dl className="grid grid-cols-2 border-b border-[var(--rift-border)] sm:grid-cols-4">
        <CardMetric label="Connections" value={`${connectionCompleteness(environment)} / 3`} />
        <CardMetric label="Feature flags" value={String(environment.featureFlags.length)} />
        <CardMetric label="Allowed actions" value={String(environment.allowedActions.length)} />
        <CardMetric label="Validation checks" value={String(environment.validationResults.length)} />
      </dl>

      <div className="grid gap-px bg-[var(--rift-border)] lg:grid-cols-2">
        <OperationalSection title="Connection">
          <Detail label="Application" value={environment.baseUrl} mono />
          <Detail label="API" value={environment.apiBaseUrl ?? 'Not configured'} mono />
          <Detail label="Health check" value={environment.healthCheckUrl ?? 'Not configured'} mono />
        </OperationalSection>
        <OperationalSection title="Runtime behaviour">
          <Detail
            label="Payment"
            value={`${readableEnvironmentValue(environment.paymentConfiguration.mode)} · ${readableEnvironmentValue(environment.paymentConfiguration.result)}`}
          />
          <Detail
            label="Retries"
            value={
              environment.paymentConfiguration.retryEnabled
                ? `Up to ${environment.paymentConfiguration.maxRetries}`
                : 'Disabled'
            }
          />
          <Detail
            label="Reset"
            value={`${readableEnvironmentValue(environment.resetConfiguration.mode)} · ${resetSchedule(environment)}`}
          />
        </OperationalSection>
        <OperationalSection title="Configuration">
          <Detail
            label="Feature flags"
            value={
              environment.featureFlags.length
                ? environment.featureFlags.map((flag) => flag.key).join(', ')
                : 'None configured'
            }
          />
          <Detail
            label="Test data isolation"
            value={readableEnvironmentValue(environment.testDataConfiguration.isolation)}
          />
          <div>
            <p className="text-xs text-[var(--rift-text-muted)]">Allowed actions</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleActions.length ? (
                visibleActions.map((action) => (
                  <span className="rounded-md border border-[var(--rift-border)] px-2 py-1 text-[11px] text-[var(--rift-text-secondary)]" key={action}>
                    {readableEnvironmentValue(action)}
                  </span>
                ))
              ) : (
                <span className="text-sm font-medium text-[var(--rift-text)]">None configured</span>
              )}
              {hiddenActionCount > 0 ? (
                <span className="rounded-md border border-[var(--rift-border)] px-2 py-1 text-[11px] text-[var(--rift-text-muted)]">
                  +{hiddenActionCount} more
                </span>
              ) : null}
            </div>
          </div>
        </OperationalSection>
        <OperationalSection title="Readiness">
          <Detail label="Validation" value={readableEnvironmentValue(environment.validationStatus)} />
          <Detail label="Checks" value={validationResultSummary(environment)} />
          <Detail
            label="Last validated"
            value={environment.lastValidatedAt ? formatTime(environment.lastValidatedAt) : 'Not yet validated'}
          />
        </OperationalSection>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--rift-border)] p-5">
        <p className="text-xs text-[var(--rift-text-muted)]">Updated {formatTime(environment.updatedAt)}</p>
        <div className="flex flex-wrap gap-2">
          <Link className={secondaryButton} to={`/projects/${projectId}/environments/${environment.id}`}>
            Open environment <ArrowRight aria-hidden="true" size={15} />
          </Link>
          {editable ? (
            <Link className={secondaryButton} to={`/projects/${projectId}/environments/${environment.id}/settings`}>
              <Settings2 aria-hidden="true" size={15} /> Settings
            </Link>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-[var(--rift-border)] px-5 py-4 last:border-b-0 sm:border-r sm:odd:border-r sm:[&:nth-child(n+3)]:border-b-0 xl:border-b-0 xl:last:border-r-0">
      <dd className="text-2xl font-semibold tabular-nums text-[var(--rift-text)]">{value}</dd>
      <dt className="mt-1 text-xs text-[var(--rift-text-muted)]">{label}</dt>
    </div>
  );
}

function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-[var(--rift-border)] p-4 even:border-r-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0">
      <dd className="text-lg font-semibold tabular-nums text-[var(--rift-text)]">{value}</dd>
      <dt className="mt-0.5 text-[11px] text-[var(--rift-text-muted)]">{label}</dt>
    </div>
  );
}

function OperationalSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-3 bg-[var(--rift-surface)] p-5">
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--rift-text-muted)]">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm font-medium text-[var(--rift-text)] ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
