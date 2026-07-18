import { ArrowLeft, ArrowRight, Check, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  CredentialReference,
  EndpointReference,
  ProjectSetupInput,
} from '../../services/project-api.js';
import {
  TemplateManager,
  builtInTemplate,
  projectTemplatePayloadSchema,
} from '../templates/index.js';
import { Field, primaryButton, secondaryButton } from './project-ui.js';

export interface ProjectFormValue extends ProjectSetupInput {
  credentialReferences: CredentialReference[];
}

export function ProjectForm({
  initial,
  submitLabel,
  pending,
  formError,
  successMessage,
  requireAcknowledgement,
  guided = false,
  onSubmit,
}: {
  initial?: ProjectFormValue | undefined;
  submitLabel: string;
  pending: boolean;
  formError?: string;
  successMessage?: string;
  requireAcknowledgement?: boolean;
  guided?: boolean;
  onSubmit(value: ProjectSetupInput, acknowledgement: boolean): Promise<boolean>;
}) {
  const empty = useMemo<ProjectFormValue>(() => initial ?? emptyProject(), [initial]);
  const [value, setValue] = useState(empty);
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const submitting = useRef(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    setValue(empty);
    setDirty(false);
  }, [empty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update(patch: Partial<ProjectFormValue>) {
    setValue((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || pending) return;
    const nextErrors = validate(value, requireAcknowledgement && !acknowledged);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      document.getElementById(`${id}-${firstError}`)?.focus();
      return;
    }
    submitting.current = true;
    try {
      const saved = await onSubmit(
        {
          ...value,
          name: value.name.trim(),
          description: value.description?.trim() || null,
          repositoryUrl: value.repositoryUrl?.trim() || null,
          credentialReferences: value.credentialReferences.map(({ label, reference }) => ({
            label: label.trim(),
            reference: reference.trim(),
          })),
        },
        acknowledged,
      );
      if (saved) setDirty(false);
    } finally {
      submitting.current = false;
    }
  }

  function showErrors(nextErrors: Record<string, string>) {
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (!firstError) return false;
    requestAnimationFrame(() => {
      errorSummary.current?.focus();
      document.getElementById(`${id}-${firstError}`)?.focus();
    });
    return true;
  }

  function advance() {
    const allErrors = validate(value, false);
    const keys = step === 0 ? ['name', 'applicationUrl', 'repositoryUrl'] : ['references'];
    const stepErrors = Object.fromEntries(
      Object.entries(allErrors).filter(([key]) => keys.includes(key)),
    );
    if (showErrors(stepErrors)) return;
    setErrors({});
    setStep((current) => Math.min(current + 1, 2));
  }

  const templateManager = (
    <TemplateManager
      builtIns={[
        builtInTemplate(
          'PROJECT',
          'project-built-in-web-application',
          'Web application',
          'A clean authorised web application configuration.',
          emptyProject(),
        ),
      ]}
      category="PROJECT"
      onApply={(payload) => {
        setValue(payload);
        setErrors({});
        setDirty(true);
      }}
      payloadSchema={projectTemplatePayloadSchema}
      preview={(payload) => (
        <TemplateSummary
          items={[
            ['Project', payload.name || 'Untitled'],
            ['Application', projectHostname(payload.applicationUrl)],
            [
              'Access references',
              String(
                payload.credentialReferences.length +
                  payload.apiEndpoints.length +
                  payload.webhookEndpoints.length,
              ),
            ],
          ]}
        />
      )}
      value={value}
    />
  );

  if (guided) {
    const host = projectHostname(value.applicationUrl);
    const accessCount =
      value.credentialReferences.length + value.apiEndpoints.length + value.webhookEndpoints.length;
    const finalErrors = validate(value, requireAcknowledgement && !acknowledged);
    const canSubmit = Object.keys(finalErrors).length === 0 && !pending;
    const steps = ['Application', 'Access & Environment', 'Safety Boundary'];

    return (
      <form
        className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start"
        id={`${id}-guided-form`}
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <div className="xl:col-span-2">{templateManager}</div>
        <div className="min-w-0">
          <ol
            aria-label="Project setup progress"
            className="mb-6 grid grid-cols-3 overflow-hidden rounded-lg border border-[var(--rift-border)] bg-[var(--rift-surface)]"
          >
            {steps.map((label, index) => (
              <li
                aria-current={index === step ? 'step' : undefined}
                className={`min-w-0 border-l border-[var(--rift-border)] px-3 py-3 first:border-l-0 sm:px-4 ${index === step ? 'bg-[var(--rift-surface-raised)]' : ''}`}
                key={label}
              >
                <span
                  className={`block text-[10px] font-semibold tracking-[0.14em] ${index <= step ? 'text-[var(--rift-text)]' : 'text-[var(--rift-text-muted)]'}`}
                >
                  0{index + 1}
                </span>
                <span
                  className={`mt-1 block text-[11px] font-medium leading-tight sm:text-sm ${index === step ? 'text-[var(--rift-text)]' : 'text-[var(--rift-text-secondary)]'}`}
                >
                  {label}
                </span>
              </li>
            ))}
          </ol>

          <div className="sr-only" ref={errorSummary} role="alert" tabIndex={-1}>
            {Object.keys(errors).length ? 'Review the highlighted fields before continuing.' : ''}
          </div>

          {step === 0 ? (
            <GuidedSection
              description="Identify the application Rift is authorised to investigate."
              number="01"
              title="Application"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field error={errors.name} errorId={`${id}-name-error`} label="Project name *">
                  <input
                    aria-describedby={errors.name ? `${id}-name-error` : undefined}
                    aria-invalid={Boolean(errors.name)}
                    autoComplete="organization-title"
                    className="w-full"
                    id={`${id}-name`}
                    maxLength={100}
                    onChange={(event) => update({ name: event.target.value })}
                    placeholder="Rift Demo Commerce"
                    value={value.name}
                  />
                </Field>
                <Field
                  error={errors.applicationUrl}
                  errorId={`${id}-applicationUrl-error`}
                  label="Application URL *"
                >
                  <input
                    aria-describedby={
                      errors.applicationUrl ? `${id}-applicationUrl-error` : undefined
                    }
                    aria-invalid={Boolean(errors.applicationUrl)}
                    className="w-full"
                    id={`${id}-applicationUrl`}
                    inputMode="url"
                    onChange={(event) => update({ applicationUrl: event.target.value })}
                    placeholder="https://staging.example.com"
                    type="url"
                    value={value.applicationUrl}
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className="min-h-28 w-full resize-y"
                  maxLength={1_000}
                  onChange={(event) => update({ description: event.target.value })}
                  placeholder="What should Rift understand about this application?"
                  value={value.description ?? ''}
                />
              </Field>
              <Field
                error={errors.repositoryUrl}
                errorId={`${id}-repositoryUrl-error`}
                label="Repository URL (optional)"
              >
                <input
                  aria-describedby={errors.repositoryUrl ? `${id}-repositoryUrl-error` : undefined}
                  aria-invalid={Boolean(errors.repositoryUrl)}
                  className="w-full"
                  id={`${id}-repositoryUrl`}
                  inputMode="url"
                  onChange={(event) => update({ repositoryUrl: event.target.value || null })}
                  placeholder="https://github.com/team/application"
                  type="url"
                  value={value.repositoryUrl ?? ''}
                />
              </Field>
            </GuidedSection>
          ) : null}

          {step === 1 ? (
            <GuidedSection
              description="Record optional references and endpoints already supported by this project. Environment-specific setup remains available after creation."
              number="02"
              title="Access & Environment"
            >
              <ReferenceSection
                description="Reference a credential managed outside Rift. Never paste passwords or keys."
                emptyLabel="No credential references — optional."
                items={value.credentialReferences}
                kind="credential"
                onChange={(credentialReferences) => update({ credentialReferences })}
                title="Credential references"
              />
              <ReferenceSection
                description="General API defaults; environment-specific URLs can be completed later."
                emptyLabel="No API endpoints — optional."
                items={value.apiEndpoints}
                kind="endpoint"
                onChange={(apiEndpoints) => update({ apiEndpoints })}
                title="API endpoints"
              />
              <ReferenceSection
                description="Optional authorised webhook endpoints. Rift will not call them during setup."
                emptyLabel="No webhook endpoints — optional."
                items={value.webhookEndpoints}
                kind="endpoint"
                onChange={(webhookEndpoints) => update({ webhookEndpoints })}
                title="Webhook endpoints"
              />
              {errors.references ? (
                <p className="text-sm text-[var(--status-fail)]" role="alert">
                  {errors.references}
                </p>
              ) : null}
            </GuidedSection>
          ) : null}

          {step === 2 ? (
            <GuidedSection
              description="Rift will only operate within the permissions and boundaries defined here."
              number="03"
              title="Safety Boundary"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <BoundaryRow label="Allowed application host" value={host} />
                <BoundaryRow label="Allowed host count" value={host === 'Incomplete' ? '0' : '1'} />
                <BoundaryRow label="Prohibited actions" value="Configure after creation" />
                <BoundaryRow label="Environment" value="Configure after creation" />
              </div>
              <div className="rounded-lg border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-4">
                <label
                  className="flex cursor-pointer items-start gap-3"
                  htmlFor={`${id}-acknowledgement`}
                >
                  <input
                    checked={acknowledged}
                    className="mt-0.5 size-4 shrink-0"
                    id={`${id}-acknowledgement`}
                    onChange={(event) => {
                      setAcknowledged(event.target.checked);
                      setDirty(true);
                    }}
                    type="checkbox"
                  />
                  <span>
                    <span className="text-sm font-semibold text-[var(--rift-text)]">
                      Authorised testing confirmation
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[var(--rift-text-secondary)]">
                      I confirm that these targets and credential references are authorised for
                      automated testing.
                    </span>
                    {errors.acknowledgement ? (
                      <span className="mt-1 block text-sm text-[var(--status-fail)]" role="alert">
                        {errors.acknowledgement}
                      </span>
                    ) : null}
                  </span>
                </label>
              </div>
            </GuidedSection>
          ) : null}

          <div className="mt-5 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button
                className={secondaryButton}
                onClick={() => {
                  setErrors({});
                  setStep((current) => current - 1);
                }}
                type="button"
              >
                <ArrowLeft aria-hidden="true" className="mr-2" size={16} /> Back
              </button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <button className={primaryButton} onClick={advance} type="button">
                Continue <ArrowRight aria-hidden="true" className="ml-2" size={16} />
              </button>
            ) : null}
          </div>
        </div>

        <aside
          className="rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] p-5 xl:sticky xl:top-6"
          aria-label="Setup summary"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--rift-text-muted)]">
            Setup summary
          </p>
          <dl className="mt-5 divide-y divide-[var(--rift-border)]">
            <SummaryRow
              configured={Boolean(value.name.trim()) && host !== 'Incomplete'}
              label="Application"
              value={value.name.trim() || 'Incomplete'}
            />
            <SummaryRow
              configured
              label="Access & Environment"
              value={
                accessCount ? `${accessCount} item${accessCount === 1 ? '' : 's'}` : 'Optional'
              }
            />
            <SummaryRow
              configured={acknowledged}
              label="Safety Boundary"
              value={acknowledged ? 'Confirmed' : 'Incomplete'}
            />
          </dl>
          <div className="mt-5 space-y-2 rounded-lg border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] p-4 text-xs">
            <SummaryValue label="Hostname" value={host} />
            <SummaryValue label="Allowed hosts" value={host === 'Incomplete' ? '0' : '1'} />
            <SummaryValue label="Prohibited actions" value="0" />
          </div>
          <div className="mt-5 flex gap-2 text-xs leading-5 text-[var(--rift-text-secondary)]">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--rift-text-muted)]"
              size={15}
            />
            The application host becomes the initial authorised boundary. Detailed safety rules
            remain editable after creation.
          </div>
          {formError ? (
            <div
              className="mt-4 rounded-lg border border-[var(--status-fail-border)] bg-[var(--status-fail-bg)] px-3 py-2 text-sm text-[var(--status-fail)]"
              role="alert"
            >
              {formError}
            </div>
          ) : null}
          <button
            className={`${primaryButton} mt-5 w-full justify-center`}
            disabled={!canSubmit}
            type="submit"
          >
            {pending ? 'Creating project…' : submitLabel}
          </button>
          {!canSubmit && !pending ? (
            <p className="mt-2 text-center text-xs text-[var(--rift-text-muted)]">
              Complete required fields and confirm authorisation to create the project.
            </p>
          ) : null}
          {dirty ? (
            <p className="mt-3 text-center text-xs text-[var(--status-pending)]">Unsaved changes</p>
          ) : null}
        </aside>
      </form>
    );
  }

  return (
    <form className="space-y-6" noValidate onSubmit={(event) => void submit(event)}>
      {templateManager}
      <FormSection
        description="Name the application and explain why Rift will investigate it."
        title="Basic details"
      >
        <Field error={errors.name} errorId={`${id}-name-error`} label="Project name">
          <input
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
            aria-invalid={Boolean(errors.name)}
            autoComplete="organization-title"
            className="w-full"
            id={`${id}-name`}
            maxLength={100}
            onChange={(event) => update({ name: event.target.value })}
            value={value.name}
          />
        </Field>
        <Field label="Description">
          <textarea
            className="min-h-28 w-full resize-y"
            maxLength={1_000}
            onChange={(event) => update({ description: event.target.value })}
            value={value.description ?? ''}
          />
        </Field>
      </FormSection>

      <FormSection
        description="Environment Setup will later define the exact test deployment. Only HTTP and HTTPS targets are accepted."
        title="Application"
      >
        <Field error={errors.applicationUrl} label="Application URL">
          <input
            aria-invalid={Boolean(errors.applicationUrl)}
            className="w-full"
            id={`${id}-applicationUrl`}
            inputMode="url"
            onChange={(event) => update({ applicationUrl: event.target.value })}
            placeholder="https://staging.example.com"
            type="url"
            value={value.applicationUrl}
          />
        </Field>
      </FormSection>

      <FormSection
        description="Repository access is not performed here. This is configuration only."
        title="Repository information"
      >
        <Field error={errors.repositoryUrl} label="Repository URL (optional)">
          <input
            aria-invalid={Boolean(errors.repositoryUrl)}
            className="w-full"
            id={`${id}-repositoryUrl`}
            inputMode="url"
            onChange={(event) => update({ repositoryUrl: event.target.value || null })}
            placeholder="https://github.com/team/application"
            type="url"
            value={value.repositoryUrl ?? ''}
          />
        </Field>
      </FormSection>

      <ReferenceSection
        description="Store a reference to a test credential managed outside Rift. Do not paste passwords or secret keys here."
        emptyLabel="No credential references configured."
        items={value.credentialReferences}
        kind="credential"
        onChange={(credentialReferences) => update({ credentialReferences })}
        title="Credential references"
      />
      <ReferenceSection
        description="General API defaults only; environment-specific URLs belong in Environment Setup."
        emptyLabel="No API endpoints configured."
        items={value.apiEndpoints}
        kind="endpoint"
        onChange={(apiEndpoints) => update({ apiEndpoints })}
        title="API endpoints"
      />
      <ReferenceSection
        description="Optional authorised webhook endpoints. Rift will not call them during setup."
        emptyLabel="No webhook endpoints configured."
        items={value.webhookEndpoints}
        kind="endpoint"
        onChange={(webhookEndpoints) => update({ webhookEndpoints })}
        title="Webhook endpoints"
      />

      {requireAcknowledgement ? (
        <div className="card border-amber-500/30">
          <label className="flex items-start gap-3">
            <input
              checked={acknowledged}
              className="mt-1 size-4"
              id={`${id}-acknowledgement`}
              onChange={(event) => setAcknowledged(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="font-bold">Authorised testing confirmation</span>
              <span className="mt-1 block text-sm text-slate-400">
                I confirm that these targets and credentials are authorised for automated testing.
              </span>
              {errors.acknowledgement ? (
                <span className="mt-1 block text-sm text-red-300" role="alert">
                  {errors.acknowledgement}
                </span>
              ) : null}
            </span>
          </label>
        </div>
      ) : null}

      {formError ? (
        <div
          className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {formError}
        </div>
      ) : null}
      {errors.references ? (
        <div
          className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {errors.references}
        </div>
      ) : null}
      {successMessage ? (
        <div
          className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button className={primaryButton} disabled={pending} type="submit">
          {pending ? 'Saving project…' : submitLabel}
        </button>
        {dirty ? <span className="text-sm text-amber-300">Unsaved changes</span> : null}
      </div>
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
    <section className="card space-y-5">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function GuidedSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)] p-5 sm:p-6 [&_input:not([type=checkbox])]:min-h-11 [&_textarea]:rounded-[10px] [&_input]:rounded-[10px]">
      <div className="border-b border-[var(--rift-border)] pb-5">
        <p className="text-[10px] font-semibold tracking-[0.15em] text-[var(--rift-text-muted)]">
          {number}
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[var(--rift-text)]">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--rift-text-secondary)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function BoundaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--rift-text-muted)]">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium text-[var(--rift-text)]">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  configured,
}: {
  label: string;
  value: string;
  configured: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0">
      <dt className="text-sm text-[var(--rift-text-secondary)]">{label}</dt>
      <dd
        className={`flex min-w-0 items-center gap-1.5 text-right text-xs font-medium ${configured ? 'text-[var(--status-pass)]' : 'text-[var(--status-pending)]'}`}
      >
        {configured ? <Check aria-hidden="true" size={13} /> : null}
        <span className="max-w-32 truncate" title={value}>
          {value}
        </span>
      </dd>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--rift-text-muted)]">{label}</dt>
      <dd className="max-w-40 truncate text-right text-[var(--rift-text-secondary)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ReferenceSection<T extends CredentialReference | EndpointReference>({
  title,
  description,
  emptyLabel,
  kind,
  items,
  onChange,
}: {
  title: string;
  description: string;
  emptyLabel: string;
  kind: 'credential' | 'endpoint';
  items: T[];
  onChange(items: T[]): void;
}) {
  const add = () =>
    onChange([
      ...items,
      (kind === 'credential' ? { label: '', reference: '' } : { label: '', url: '' }) as T,
    ]);
  return (
    <FormSection description={description} title={title}>
      {items.length === 0 ? <p className="text-sm text-slate-500">{emptyLabel}</p> : null}
      {items.map((item, index) => (
        <div
          className="rift-editable-row grid gap-3 p-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto]"
          key={index}
        >
          <Field label="Label">
            <input
              className="w-full"
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, label: event.target.value };
                onChange(next);
              }}
              value={item.label}
            />
          </Field>
          <Field label={kind === 'credential' ? 'Credential reference' : 'URL'}>
            <input
              className="w-full"
              inputMode={kind === 'endpoint' ? 'url' : 'text'}
              onChange={(event) => {
                const next = [...items];
                next[index] = {
                  ...item,
                  ...(kind === 'credential'
                    ? { reference: event.target.value }
                    : { url: event.target.value }),
                };
                onChange(next);
              }}
              placeholder={
                kind === 'credential' ? 'vault://team/project/test-user' : 'https://api.example.com'
              }
              value={
                kind === 'credential'
                  ? (item as CredentialReference).reference
                  : (item as EndpointReference).url
              }
            />
          </Field>
          <button
            aria-label={`Remove ${title.toLowerCase()} entry ${index + 1}`}
            className={`${secondaryButton} self-end px-3`}
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            type="button"
          >
            <Trash2 aria-hidden="true" size={17} />
          </button>
        </div>
      ))}
      <button className={secondaryButton} onClick={add} type="button">
        <Plus aria-hidden="true" className="mr-2" size={17} /> Add{' '}
        {title.toLowerCase().replace(/s$/, '')}
      </button>
    </FormSection>
  );
}

function emptyProject(): ProjectFormValue {
  return {
    name: '',
    description: null,
    applicationUrl: '',
    repositoryUrl: null,
    credentialReferences: [],
    apiEndpoints: [],
    webhookEndpoints: [],
  };
}

function validate(value: ProjectFormValue, acknowledgementMissing?: boolean) {
  const errors: Record<string, string> = {};
  if (!value.name.trim()) errors.name = 'Enter a project name.';
  if (!value.applicationUrl.trim()) errors.applicationUrl = 'Enter the application URL.';
  else if (!isHttpUrl(value.applicationUrl))
    errors.applicationUrl = 'Enter a valid HTTP or HTTPS URL.';
  if (value.repositoryUrl && !isHttpUrl(value.repositoryUrl))
    errors.repositoryUrl = 'Enter a valid HTTP or HTTPS repository URL.';
  if (
    value.credentialReferences.some(
      (credential) => !credential.label.trim() || !credential.reference.trim(),
    )
  )
    errors.references = 'Complete the label and reference for every credential entry.';
  if (
    [...value.apiEndpoints, ...value.webhookEndpoints].some(
      (endpoint) => !endpoint.label.trim() || !isHttpUrl(endpoint.url),
    )
  )
    errors.references = 'Complete every endpoint label with a valid HTTP or HTTPS URL.';
  if (acknowledgementMissing)
    errors.acknowledgement = 'Confirm that these targets are authorised for automated testing.';
  return errors;
}

function isHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function projectHostname(value: string) {
  if (!isHttpUrl(value)) return 'Incomplete';
  return new URL(value).hostname;
}

function TemplateSummary({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs text-[var(--rift-text-muted)]">{label}</dt>
          <dd className="mt-1 truncate font-medium" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
