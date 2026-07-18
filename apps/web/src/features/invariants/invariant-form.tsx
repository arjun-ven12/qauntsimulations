import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, primaryButton, secondaryButton } from '../projects/project-ui.js';
import {
  TemplateManager,
  builtInTemplate,
  invariantTemplatePayloadSchema,
  type InvariantTemplatePayload,
} from '../templates/index.js';
import type { InvariantInput, InvariantValidationResult } from './invariant-api.js';
import {
  invariantFormErrors,
  invariantTemplates,
  templateName,
  templateValue,
  toInvariantInput,
  valuesMatch,
  type InvariantFormValue,
} from './invariant-form.model.js';
import {
  InvariantStructuredPreview,
  InvariantValidationPanel,
} from './invariant-structured-preview.js';

const methods = ['POST', 'PUT', 'PATCH'] as const;
const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export function InvariantForm({
  initial,
  pending,
  readOnly = false,
  submitLabel = 'Save Invariant',
  error,
  successMessage,
  onSubmit,
  onValidate,
}: {
  initial: InvariantFormValue;
  pending: boolean;
  readOnly?: boolean;
  submitLabel?: string;
  error?: string | undefined;
  successMessage?: string | undefined;
  onSubmit(input: InvariantInput): void;
  onValidate?: (() => Promise<InvariantValidationResult>) | undefined;
}) {
  const [value, setValue] = useState<InvariantFormValue>(() => structuredClone(initial));
  const [savedValue, setSavedValue] = useState<InvariantFormValue>(() => structuredClone(initial));
  const [submitted, setSubmitted] = useState(false);
  const [validation, setValidation] = useState<InvariantValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const previousSuccess = useRef<string | undefined>(undefined);
  const errors = invariantFormErrors(value);
  const dirty = !valuesMatch(value, savedValue);
  const blockingValidation = validation?.checks.some((check) => check.status === 'FAILED') ?? false;
  const saveDisabled = pending || readOnly || Object.keys(errors).length > 0 || blockingValidation;

  useEffect(() => {
    if (!successMessage) {
      previousSuccess.current = undefined;
      return;
    }
    if (successMessage && successMessage !== previousSuccess.current) {
      setSavedValue(structuredClone(value));
      previousSuccess.current = successMessage;
    }
  }, [successMessage, value]);

  const change = (next: InvariantFormValue) => {
    setValue({ ...next, validationStatus: 'DRAFT' });
    setValidation(null);
    setValidationError(undefined);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (saveDisabled) return;
    onSubmit(toInvariantInput(value));
  };

  const validate = async () => {
    if (!onValidate || validating) return;
    setValidating(true);
    setValidationError(undefined);
    try {
      const result = await onValidate();
      setValidation(result);
      setValue((current) => ({ ...current, validationStatus: result.status }));
    } catch (validationFailure) {
      setValidationError(
        validationFailure instanceof Error
          ? validationFailure.message
          : 'Invariant validation failed.',
      );
    } finally {
      setValidating(false);
    }
  };

  return (
    <form className="mt-6 space-y-6" onSubmit={submit}>
      {readOnly ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
          You have read-only Invariant access. Owner or Admin access is required to make changes.
        </div>
      ) : null}
      {dirty ? (
        <p className="text-sm font-bold text-amber-300" role="status">
          Unsaved changes
        </p>
      ) : null}
      {error ? (
        <div
          className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {successMessage ? (
        <p className="text-sm font-bold text-emerald-300" role="status">
          {successMessage}
        </p>
      ) : null}

      {!readOnly ? (
        <TemplateManager
          builtIns={invariantTemplates.map((template) =>
            builtInTemplate(
              'INVARIANT',
              `invariant-built-in-${template.id}`,
              template.displayName,
              template.description,
              invariantTemplateValue(templateValue(template)),
            ),
          )}
          category="INVARIANT"
          onApply={(payload) => change({ ...structuredClone(payload), validationStatus: 'DRAFT' })}
          payloadSchema={invariantTemplatePayloadSchema}
          preview={(payload) => (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <TemplatePreview label="Evaluator" value={payload.type} />
              <TemplatePreview label="Severity" value={payload.severity} />
              <TemplatePreview label="Enabled" value={payload.enabled ? 'Yes' : 'No'} />
              <TemplatePreview
                label="Request paths"
                value={payload.configuration.requestPatterns.join(', ')}
              />
              <TemplatePreview label="Methods" value={payload.configuration.methods.join(', ')} />
              <TemplatePreview label="Failure meaning" value={payload.description} />
            </dl>
          )}
          value={invariantTemplateValue(value)}
        />
      ) : null}

      <fieldset className="space-y-6" disabled={readOnly}>
        <FormSection
          description="The business rule is descriptive context. It is never executed."
          title="Basic details"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field error={submitted ? errors.name : undefined} label="Name">
              <input
                className="w-full"
                maxLength={200}
                onChange={(event) => change({ ...value, name: event.target.value })}
                placeholder="No duplicate payment"
                value={value.name}
              />
            </Field>
            <Field error={submitted ? errors.type : undefined} label="Template / evaluator">
              <select
                className="w-full"
                onChange={(event) => {
                  const template = invariantTemplates.find(
                    (candidate) => candidate.type === event.target.value,
                  );
                  if (template)
                    change({
                      ...value,
                      type: template.type,
                      configuration: structuredClone(template.configuration),
                    });
                }}
                value={value.type}
              >
                <option value="NO_DUPLICATE_PAYMENT">No duplicate payment</option>
                <option value="NO_DUPLICATE_ORDER">No duplicate order</option>
              </select>
            </Field>
          </div>
          <Field
            description="Write a plain-language outcome, not code, SQL, or an expression."
            error={submitted ? errors.description : undefined}
            label="Plain-language business rule"
          >
            <textarea
              className="min-h-32 w-full resize-y"
              maxLength={2_000}
              onChange={(event) => change({ ...value, description: event.target.value })}
              placeholder="A customer must never be charged twice for one checkout."
              value={value.description}
            />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field error={submitted ? errors.severity : undefined} label="Severity">
              <select
                className="w-full"
                onChange={(event) =>
                  change({
                    ...value,
                    severity: event.target.value as InvariantFormValue['severity'],
                  })
                }
                value={value.severity}
              >
                {severities.map((severity) => (
                  <option key={severity} value={severity}>
                    {friendlySeverity(severity)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              description="Disabled Invariants remain saved and editable, but are excluded from future investigations by default."
              label="Enabled state"
            >
              <label className="rift-choice-control flex min-h-11 items-center gap-3 px-4">
                <input
                  checked={value.enabled}
                  onChange={(event) => change({ ...value, enabled: event.target.checked })}
                  type="checkbox"
                />
                <span className="font-bold">{value.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </Field>
          </div>
        </FormSection>

        <FormSection
          description="Only configuration accepted by the selected evaluator can be saved."
          title="Structured configuration"
        >
          <Field
            description="One plain URL path per line. Regular expressions and executable syntax are not supported."
            error={submitted ? errors.requestPatterns : undefined}
            label="Request paths"
          >
            <textarea
              className="min-h-28 w-full resize-y font-mono text-sm"
              onChange={(event) =>
                change({
                  ...value,
                  configuration: {
                    ...value.configuration,
                    requestPatterns: event.target.value.split('\n'),
                  },
                })
              }
              value={value.configuration.requestPatterns.join('\n')}
            />
          </Field>
          <Field error={submitted ? errors.methods : undefined} label="Observed HTTP methods">
            <div className="flex flex-wrap gap-3">
              {methods.map((method) => (
                <label
                  className="rift-choice-control flex min-h-11 items-center gap-2 px-4"
                  key={method}
                >
                  <input
                    checked={value.configuration.methods.includes(method)}
                    onChange={(event) => {
                      const nextMethods = event.target.checked
                        ? [...value.configuration.methods, method]
                        : value.configuration.methods.filter((candidate) => candidate !== method);
                      change({
                        ...value,
                        configuration: { ...value.configuration, methods: nextMethods },
                      });
                    }}
                    type="checkbox"
                  />
                  <span className="font-mono text-sm font-bold">{method}</span>
                </label>
              ))}
            </div>
          </Field>
          {value.type === 'NO_DUPLICATE_ORDER' ? (
            <Field
              description="Optional safe DOM selector used to find an order ID; response evidence remains available."
              error={submitted ? errors.orderIdSelector : undefined}
              label="Order ID selector"
            >
              <input
                className="w-full font-mono text-sm"
                maxLength={500}
                onChange={(event) =>
                  change({
                    ...value,
                    configuration: {
                      ...value.configuration,
                      orderIdSelector: event.target.value,
                    },
                  })
                }
                placeholder='[data-testid="order-id"]'
                value={value.configuration.orderIdSelector ?? ''}
              />
            </Field>
          ) : null}
        </FormSection>
      </fieldset>

      <InvariantStructuredPreview value={value} />

      <FormSection
        description="Confirm the exact persisted definition and its runtime compatibility."
        title="Review"
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <ReviewItem label="Name" value={value.name || 'Untitled'} />
          <ReviewItem label="Friendly template" value={templateName(value.type)} />
          <ReviewItem label="Evaluator identifier" value={value.type} mono />
          <ReviewItem label="Severity" value={value.severity} />
          <ReviewItem label="Enabled state" value={value.enabled ? 'Enabled' : 'Disabled'} />
          <ReviewItem label="Business rule" value={value.description || 'Not provided'} />
          <ReviewItem
            label="Structured configuration"
            value={`${value.configuration.methods.join(', ') || 'No methods'} · ${value.configuration.requestPatterns.filter(Boolean).join(', ') || 'No paths'}`}
          />
          <ReviewItem
            label="Validation state"
            value={validation?.status ?? value.validationStatus}
          />
          <ReviewItem
            label="Runtime compatibility"
            value={runtimeCompatibility(value, errors, validation)}
          />
        </dl>
        {validationError ? (
          <p className="text-sm text-red-300" role="alert">
            {validationError}
          </p>
        ) : null}
        {validation ? <InvariantValidationPanel result={validation} /> : null}
        <div className="flex flex-wrap gap-3">
          {onValidate && !readOnly ? (
            <button
              className={secondaryButton}
              disabled={validating || pending || dirty}
              onClick={() => void validate()}
              type="button"
            >
              {validating ? 'Validating…' : 'Validate saved Invariant'}
            </button>
          ) : null}
          {!readOnly ? (
            <button className={primaryButton} disabled={saveDisabled} type="submit">
              {pending ? 'Saving…' : submitLabel}
            </button>
          ) : null}
        </div>
      </FormSection>
    </form>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card min-w-0 space-y-5">
      <div>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ReviewItem({
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
      <dt className="text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words font-bold ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function friendlySeverity(severity: (typeof severities)[number]) {
  return `${severity.charAt(0)}${severity.slice(1).toLowerCase()} (${severity})`;
}

function TemplatePreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--rift-text-muted)]">{label}</dt>
      <dd className="mt-1 truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function invariantTemplateValue(value: InvariantFormValue): InvariantTemplatePayload {
  const { validationStatus: _validationStatus, ...payload } = value;
  return payload;
}

function runtimeCompatibility(
  value: InvariantFormValue,
  errors: Record<string, string>,
  validation: InvariantValidationResult | null,
) {
  if (validation?.status === 'INVALID') return 'Blocked by failed validation';
  if (Object.keys(errors).length) return 'Incomplete or unsupported';
  if (!value.enabled) return 'Valid, intentionally excluded while disabled';
  return 'Compatible with the registered runtime evaluator';
}
