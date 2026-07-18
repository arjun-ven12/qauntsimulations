import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { environmentApi } from '../../services/environment-api.js';
import { Field, primaryButton, secondaryButton } from '../projects/project-ui.js';
import type { JourneyInput, JourneyValidationResult } from './journey-api.js';
import {
  addStep,
  changeAction,
  checkoutTemplate,
  duplicateStep,
  formErrors,
  moveStep,
  normaliseSteps,
  removeStep,
  reviewFor,
  stepDescription,
  toJourneyInput,
  type BuilderStep,
  type ExecutableJourneyAction,
  type JourneyFormValue,
} from './journey-form.model.js';

const actions: Array<{ value: ExecutableJourneyAction; label: string }> = [
  { value: 'GOTO', label: 'Go to path or URL' },
  { value: 'CLICK', label: 'Click element' },
  { value: 'FILL', label: 'Fill field' },
  { value: 'WAIT_FOR', label: 'Wait for element' },
  { value: 'ASSERT_VISIBLE', label: 'Assert visible' },
];

export function JourneyForm({
  initial,
  projectId,
  pending,
  readOnly = false,
  submitLabel = 'Save Journey',
  error,
  successMessage,
  onSubmit,
  onValidate,
}: {
  initial: JourneyFormValue;
  projectId: string;
  pending: boolean;
  readOnly?: boolean;
  submitLabel?: string;
  error?: string | undefined;
  successMessage?: string | undefined;
  onSubmit(input: JourneyInput): void;
  onValidate?: (() => Promise<JourneyValidationResult>) | undefined;
}) {
  const [value, setValue] = useState<JourneyFormValue>(() => structuredClone(initial));
  const [submitted, setSubmitted] = useState(false);
  const [validation, setValidation] = useState<JourneyValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const environments = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentApi.list(projectId),
  });
  const errors = formErrors(value);
  const review = reviewFor(value);
  const blockingValidation = validation?.status === 'INVALID';
  const saveDisabled =
    pending ||
    readOnly ||
    environments.isPending ||
    Object.keys(errors).length > 0 ||
    blockingValidation;

  const change = (next: JourneyFormValue | ((current: JourneyFormValue) => JourneyFormValue)) => {
    setValue(next);
    setValidation(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (saveDisabled) return;
    onSubmit(toJourneyInput(value));
  };

  const validate = async () => {
    if (!onValidate || validating) return;
    setValidating(true);
    try {
      const result = await onValidate();
      setValidation(result);
      setValue((current) => ({ ...current, validationStatus: result.status }));
    } finally {
      setValidating(false);
    }
  };

  return (
    <form className="mt-6 space-y-6" onSubmit={submit}>
      {readOnly ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
          You have read-only Journey access. Owner or Admin access is required to make changes.
        </div>
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

      <fieldset className="space-y-6" disabled={readOnly}>
        <FormSection
          description="Name the Journey and decide whether it is ready to be enabled."
          title="Basic details"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field error={submitted ? errors.name : undefined} label="Journey name">
              <input
                className="w-full"
                maxLength={200}
                onChange={(event) => change({ ...value, name: event.target.value })}
                placeholder="Checkout Purchase Flow"
                value={value.name}
              />
            </Field>
            <Field label="State">
              <select
                className="w-full"
                onChange={(event) =>
                  change({ ...value, state: event.target.value as JourneyFormValue['state'] })
                }
                value={value.state}
              >
                <option value="DRAFT">Draft</option>
                <option value="ENABLED">Enabled</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea
              className="min-h-28 w-full resize-y"
              maxLength={1_000}
              onChange={(event) => change({ ...value, description: event.target.value })}
              placeholder="Describe what this Journey proves."
              value={value.description ?? ''}
            />
          </Field>
        </FormSection>

        <FormSection
          description="Journeys can target only Environments belonging to this project."
          title="Environment"
        >
          {environments.isError ? (
            <p className="text-sm text-red-300" role="alert">
              Environments could not be loaded. {environments.error.message}
            </p>
          ) : null}
          <div className="grid gap-5 md:grid-cols-2">
            <Field error={submitted ? errors.environmentId : undefined} label="Environment">
              <select
                className="w-full"
                disabled={readOnly || environments.isPending}
                onChange={(event) => change({ ...value, environmentId: event.target.value })}
                value={value.environmentId}
              >
                <option value="">
                  {environments.isPending ? 'Loading Environments…' : 'Select an Environment'}
                </option>
                {environments.data?.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name} · {environment.validationStatus}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              description="Use a relative path for the selected Environment or an authorised HTTP(S) URL."
              error={submitted ? errors.startPath : undefined}
              label="Start path or URL"
            >
              <input
                className="w-full"
                onChange={(event) => change({ ...value, startPath: event.target.value })}
                placeholder="/products/test-product"
                value={value.startPath}
              />
            </Field>
          </div>
          {!readOnly ? (
            <button
              className={secondaryButton}
              disabled={!value.environmentId}
              onClick={() => change(checkoutTemplate(value.environmentId))}
              type="button"
            >
              Use checkout template
            </button>
          ) : null}
        </FormSection>

        <FormSection
          description="Steps execute from top to bottom. Positions are normalised after every change."
          title="Ordered steps"
        >
          <div className="space-y-4">
            {value.steps.map((step, index) => (
              <StepCard
                errorFor={(field) => (submitted ? errors[`step-${index}-${field}`] : undefined)}
                index={index}
                key={step.clientId}
                onChange={(updated) =>
                  change({
                    ...value,
                    steps: normaliseSteps(
                      value.steps.map((current, currentIndex) =>
                        currentIndex === index ? updated : current,
                      ),
                    ),
                  })
                }
                onDuplicate={() => change({ ...value, steps: duplicateStep(value.steps, index) })}
                onMove={(direction) =>
                  change({ ...value, steps: moveStep(value.steps, index, direction) })
                }
                onRemove={() => change({ ...value, steps: removeStep(value.steps, index) })}
                readOnly={readOnly}
                step={step}
                total={value.steps.length}
              />
            ))}
          </div>
          {submitted && errors.steps ? (
            <p className="text-sm text-red-300" role="alert">
              {errors.steps}
            </p>
          ) : null}
          {!readOnly ? (
            <button
              className={secondaryButton}
              onClick={() => change({ ...value, steps: addStep(value.steps) })}
              type="button"
            >
              <Plus aria-hidden="true" size={17} /> Add step
            </button>
          ) : null}
        </FormSection>

        <FormSection
          description="This assertion runs after every Journey step completes."
          title="Completion condition"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Condition">
              <select
                className="w-full"
                onChange={(event) =>
                  change({
                    ...value,
                    completionCondition:
                      event.target.value === 'TEXT'
                        ? {
                            type: 'TEXT',
                            selector: value.completionCondition.selector,
                            expectedText: '',
                          }
                        : { type: 'VISIBLE', selector: value.completionCondition.selector },
                  })
                }
                value={value.completionCondition.type}
              >
                <option value="VISIBLE">Element is visible</option>
                <option value="TEXT">Element contains text</option>
              </select>
            </Field>
            <Field
              description='Prefer stable data-testid selectors. Example: [data-testid="add-to-cart"]'
              error={submitted ? errors.completionSelector : undefined}
              label="Completion selector"
            >
              <input
                className="w-full"
                onChange={(event) =>
                  change({
                    ...value,
                    completionCondition: {
                      ...value.completionCondition,
                      selector: event.target.value,
                    },
                  })
                }
                placeholder='[data-testid="order-id"]'
                value={value.completionCondition.selector}
              />
            </Field>
          </div>
          {value.completionCondition.type === 'TEXT' ? (
            <Field label="Expected text">
              <input
                className="w-full"
                onChange={(event) =>
                  change({
                    ...value,
                    completionCondition: {
                      type: 'TEXT',
                      selector: value.completionCondition.selector,
                      expectedText: event.target.value,
                    },
                  })
                }
                value={value.completionCondition.expectedText}
              />
            </Field>
          ) : null}
        </FormSection>
      </fieldset>

      <JourneyPreview value={value} />

      <FormSection
        description="Review the executable contract and validate saved configuration against Project Safety."
        title="Validation and review"
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <ReviewItem label="Journey" value={value.name || 'Untitled'} />
          <ReviewItem
            label="Environment"
            value={
              environments.data?.find((item) => item.id === value.environmentId)?.name ||
              'Not selected'
            }
          />
          <ReviewItem label="Executable steps" value={String(review.executableSteps)} />
          <ReviewItem label="Screenshot checkpoints" value={String(review.screenshots)} />
          <ReviewItem label="Assertions" value={String(review.assertions)} />
          <ReviewItem
            label="Completion"
            value={`${value.completionCondition.type}: ${value.completionCondition.selector || 'Not set'}`}
          />
          <ReviewItem
            label="Validation state"
            value={validation?.status ?? value.validationStatus}
          />
          <ReviewItem label="Safety compatibility" value={safetySummary(validation)} />
        </dl>
        {validation ? <ValidationChecks result={validation} /> : null}
        <div className="flex flex-wrap gap-3">
          {onValidate && !readOnly ? (
            <button
              className={secondaryButton}
              disabled={validating || pending}
              onClick={() => void validate()}
              type="button"
            >
              {validating ? 'Validating…' : 'Validate saved Journey'}
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

function StepCard({
  step,
  index,
  total,
  readOnly,
  errorFor,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  step: BuilderStep;
  index: number;
  total: number;
  readOnly: boolean;
  errorFor(field: string): string | undefined;
  onChange(step: BuilderStep): void;
  onMove(direction: -1 | 1): void;
  onDuplicate(): void;
  onRemove(): void;
}) {
  return (
    <article className="rift-editable-row min-w-0 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cyan/15 text-sm font-black text-cyan">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="break-words font-bold">{stepDescription(step)}</p>
            <p className="text-xs text-slate-500">Position {step.order}</p>
          </div>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <IconButton
              disabled={index === 0}
              label={`Move step ${index + 1} up`}
              onClick={() => onMove(-1)}
            >
              <ArrowUp size={16} />
            </IconButton>
            <IconButton
              disabled={index === total - 1}
              label={`Move step ${index + 1} down`}
              onClick={() => onMove(1)}
            >
              <ArrowDown size={16} />
            </IconButton>
            <IconButton label={`Duplicate step ${index + 1}`} onClick={onDuplicate}>
              <Copy size={16} />
            </IconButton>
            <IconButton label={`Remove step ${index + 1}`} onClick={onRemove}>
              <Trash2 size={16} />
            </IconButton>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
        <Field label="Step label">
          <input
            className="w-full"
            disabled={readOnly}
            maxLength={120}
            onChange={(event) =>
              onChange({
                ...step,
                metadata: {
                  ...step.metadata,
                  name: event.target.value || undefined,
                  ...(step.metadata.screenshotCheckpoint
                    ? { screenshotCheckpointName: event.target.value }
                    : {}),
                },
              })
            }
            placeholder="Optional human-readable label"
            value={step.metadata.name ?? ''}
          />
        </Field>
        <Field label="Action">
          <select
            className="w-full"
            disabled={readOnly}
            onChange={(event) =>
              onChange(changeAction(step, event.target.value as ExecutableJourneyAction))
            }
            value={step.action}
          >
            {actions.map((action) => (
              <option key={action.value} value={action.value}>
                {action.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <ActionFields errorFor={errorFor} onChange={onChange} readOnly={readOnly} step={step} />
      </div>

      <div className="rift-choice-control mt-5 p-4">
        <label className="flex items-start gap-3">
          <input
            checked={Boolean(step.metadata.screenshotCheckpoint)}
            className="mt-1"
            disabled={readOnly}
            onChange={(event) =>
              onChange({
                ...step,
                metadata: {
                  ...step.metadata,
                  screenshotCheckpoint: event.target.checked || undefined,
                  screenshotCheckpointName: event.target.checked
                    ? (step.metadata.screenshotCheckpointName ?? step.metadata.name ?? '')
                    : undefined,
                },
              })
            }
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-bold">Screenshot checkpoint</span>
            <span className="text-xs text-slate-500">
              Capture evidence after this executable step.
            </span>
          </span>
        </label>
        {step.metadata.screenshotCheckpoint ? (
          <div className="mt-4">
            <Field error={errorFor('checkpoint')} label="Checkpoint name">
              <input
                className="w-full"
                disabled={readOnly}
                onChange={(event) =>
                  onChange({
                    ...step,
                    metadata: {
                      ...step.metadata,
                      screenshotCheckpointName: event.target.value,
                      name: event.target.value,
                    },
                  })
                }
                placeholder="checkout-form-loaded"
                value={step.metadata.screenshotCheckpointName ?? ''}
              />
            </Field>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ActionFields({
  step,
  readOnly,
  errorFor,
  onChange,
}: {
  step: BuilderStep;
  readOnly: boolean;
  errorFor(field: string): string | undefined;
  onChange(step: BuilderStep): void;
}) {
  if (step.action === 'GOTO')
    return (
      <Field
        description="Use a relative path for the selected Environment or an authorised HTTP(S) URL."
        error={errorFor('value')}
        label="Path or URL"
      >
        <input
          className="w-full"
          disabled={readOnly}
          onChange={(event) => onChange({ ...step, value: event.target.value })}
          placeholder="/products/test-product"
          value={step.value ?? ''}
        />
      </Field>
    );

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <Field
        description='Prefer stable data-testid selectors. Example: [data-testid="add-to-cart"]'
        error={errorFor('selector')}
        label="Selector"
      >
        <input
          className="w-full"
          disabled={readOnly}
          onChange={(event) => onChange({ ...step, selector: event.target.value })}
          placeholder='[data-testid="add-to-cart"]'
          value={step.selector ?? ''}
        />
      </Field>
      {step.action === 'FILL' ? (
        <Field error={errorFor('value')} label="Value">
          <input
            className="w-full"
            disabled={readOnly}
            onChange={(event) => onChange({ ...step, value: event.target.value })}
            placeholder="customer@example.test"
            value={step.value ?? ''}
          />
        </Field>
      ) : null}
      {step.action === 'WAIT_FOR' ? (
        <Field error={errorFor('timeout')} label="Timeout in milliseconds">
          <input
            className="w-full"
            disabled={readOnly}
            min={1}
            onChange={(event) =>
              onChange({
                ...step,
                metadata: {
                  ...step.metadata,
                  expectedState: 'VISIBLE',
                  timeoutMs: Number(event.target.value),
                },
              })
            }
            type="number"
            value={step.metadata.timeoutMs ?? 30_000}
          />
        </Field>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function JourneyPreview({ value }: { value: JourneyFormValue }) {
  return (
    <FormSection
      description="The exact linear route Rift will execute, from entry point to completion evidence."
      title="Execution path"
    >
      <div className="grid gap-px overflow-hidden rounded-lg border border-[var(--rift-border)] bg-[var(--rift-border)] sm:grid-cols-3">
        <PathSummary label="Entry point" value={value.startPath || 'Not configured'} />
        <PathSummary label="Executable steps" value={String(value.steps.length)} />
        <PathSummary label="Completion" value={completionLabel(value)} />
      </div>
      <ol className="relative mt-6 space-y-0" aria-label="Journey execution path">
        <ExecutionPathItem
          detail={value.startPath || 'No entry point configured'}
          index="00"
          label="Open application"
          tone="start"
        />
        {value.steps.map((step, index) => (
          <ExecutionPathItem
            detail={stepDescription(step)}
            index={String(index + 1).padStart(2, '0')}
            key={step.clientId}
            label={actionLabel(step.action)}
          />
        ))}
        <ExecutionPathItem
          detail={completionDetail(value)}
          index={String(value.steps.length + 1).padStart(2, '0')}
          label="Verify completion"
          last
          tone="complete"
        />
      </ol>
    </FormSection>
  );
}

function PathSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-[var(--rift-surface-raised)] px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--rift-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-[var(--rift-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ExecutionPathItem({
  index,
  label,
  detail,
  last = false,
  tone = 'step',
}: {
  index: string;
  label: string;
  detail: string;
  last?: boolean;
  tone?: 'start' | 'step' | 'complete';
}) {
  return (
    <li className="relative grid min-w-0 grid-cols-[36px_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
      {!last ? (
        <span
          aria-hidden="true"
          className="absolute left-[17px] top-8 h-[calc(100%-20px)] w-px bg-[var(--rift-border-strong)]"
        />
      ) : null}
      <span
        className={`relative z-[1] flex size-9 items-center justify-center rounded-full border text-[10px] font-semibold ${tone === 'complete' ? 'border-[var(--status-pass-border)] bg-[var(--status-pass-bg)] text-[var(--status-pass)]' : tone === 'start' ? 'border-[var(--status-running-border)] bg-[var(--status-running-bg)] text-[var(--status-running)]' : 'border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)] text-[var(--rift-text-secondary)]'}`}
      >
        {index}
      </span>
      <div className="min-w-0 rounded-lg border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold text-[var(--rift-text)]">{label}</h3>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">
            {tone === 'step' ? `Step ${Number(index)}` : tone}
          </span>
        </div>
        <p className="mt-1 break-words text-sm leading-5 text-[var(--rift-text-secondary)]">
          {detail}
        </p>
      </div>
    </li>
  );
}

function actionLabel(action: BuilderStep['action']) {
  return actions.find((candidate) => candidate.value === action)?.label ?? action;
}

function completionLabel(value: JourneyFormValue) {
  return value.completionCondition.type === 'TEXT' ? 'Expected text' : 'Visible element';
}

function completionDetail(value: JourneyFormValue) {
  const condition = value.completionCondition;
  if (condition.type === 'TEXT')
    return `${condition.selector || 'No selector'} contains “${condition.expectedText || 'No expected text'}”`;
  return `${condition.selector || 'No selector'} is visible`;
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-800 p-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-bold text-slate-200">{value}</dd>
    </div>
  );
}

function ValidationChecks({ result }: { result: JourneyValidationResult }) {
  return (
    <div className="space-y-2" aria-live="polite">
      {result.checks.map((check) => (
        <div
          className={`rounded-lg border p-3 text-sm ${statusClasses(check.status)}`}
          key={`${check.key}-${check.stepOrder ?? 'journey'}`}
        >
          <strong>{check.status}</strong>: {check.message}
        </div>
      ))}
    </div>
  );
}

function statusClasses(status: JourneyValidationResult['checks'][number]['status']) {
  if (status === 'PASSED') return 'border-emerald-900 bg-emerald-950/30 text-emerald-200';
  if (status === 'WARNING') return 'border-amber-900 bg-amber-950/30 text-amber-200';
  return 'border-red-900 bg-red-950/30 text-red-200';
}

function safetySummary(result: JourneyValidationResult | null) {
  if (!result) return 'Not validated';
  const safety = result.checks.filter((check) => check.key.startsWith('safety-'));
  if (safety.some((check) => check.status === 'FAILED')) return 'FAILED';
  if (safety.some((check) => check.status === 'WARNING')) return 'WARNING';
  return result.status === 'READY' ? 'PASSED' : result.status;
}
