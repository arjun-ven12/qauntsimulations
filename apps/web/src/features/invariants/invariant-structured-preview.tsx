import type { InvariantValidationResult } from './invariant-api.js';
import { MappedSemanticBadge } from '../../components/semantic-status.js';
import { findingSeverityStatus, setupStatus, validationStatus } from '../runtime/semantic-status.js';
import { templateName, type InvariantFormValue } from './invariant-form.model.js';

export function InvariantStructuredPreview({ value }: { value: InvariantFormValue }) {
  const patterns = value.configuration.requestPatterns.filter((pattern) => pattern.trim());
  const observation = `${value.configuration.methods.join(', ') || 'No methods selected'} requests matching ${patterns.join(', ') || 'no paths configured'}`;
  const failureMeaning =
    value.type === 'NO_DUPLICATE_PAYMENT'
      ? 'More than one matching payment request is observed for one checkout.'
      : 'More than one matching order request is observed for one checkout.';

  return (
    <section className="card min-w-0" data-testid="invariant-structured-preview">
      <div>
        <p className="eyebrow">Runtime-aligned definition</p>
        <h2 className="mt-2 text-xl font-black">Structured preview</h2>
        <p className="mt-1 text-sm text-slate-400">
          A readable interpretation of the same supported fields that will be submitted.
        </p>
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <PreviewItem label="Template" value={templateName(value.type)} />
        <PreviewItem label="Evaluator" value={value.type} mono />
        <PreviewItem label="Business rule" value={value.description || 'Not provided'} />
        <PreviewSemanticItem label="Severity" status={findingSeverityStatus(value.severity)} />
        <PreviewSemanticItem label="Enabled status" status={setupStatus(value.enabled ? 'configured' : 'disabled')} />
        <PreviewItem label="Required observation" value={observation} />
        {value.type === 'NO_DUPLICATE_ORDER' ? (
          <PreviewItem
            label="Order ID selector"
            value={value.configuration.orderIdSelector || 'Response evidence only'}
            mono
          />
        ) : null}
        <PreviewItem label="Failure meaning" value={failureMeaning} />
      </dl>
    </section>
  );
}

export function InvariantValidationPanel({
  result,
}: {
  result: InvariantValidationResult;
}) {
  return (
    <section className="card min-w-0" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black">Validation checks</h2>
        <StatusPill status={result.status} />
      </div>
      <div className="mt-4 space-y-3">
        {result.checks.map((check) => (
          <article
            className={`rift-semantic-callout--${validationStatus(check.status).tone} min-w-0 rounded-lg border bg-[var(--rift-surface-raised)] p-4`}
            data-tone={validationStatus(check.status).tone}
            key={check.key}
          >
            <div className="flex flex-wrap items-start gap-2">
              <StatusPill status={check.status} />
              <div className="min-w-0">
                <p className="break-words font-bold">{checkLabel(check.key)}</p>
                <p className="mt-1 break-words text-sm text-slate-400">{check.message}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <MappedSemanticBadge status={validationStatus(status)} />;
}

function PreviewItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words font-bold text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function PreviewSemanticItem({ label, status }: { label: string; status: Parameters<typeof MappedSemanticBadge>[0]['status'] }) {
  return <div className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-1"><MappedSemanticBadge status={status} /></dd></div>;
}

function checkLabel(key: string) {
  return key
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
