import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  CredentialReference,
  EndpointReference,
  ProjectSetupInput,
} from '../../services/project-api.js';
import { Field, primaryButton, secondaryButton } from './project-ui.js';

interface ProjectFormValue extends ProjectSetupInput {
  credentialReferences: CredentialReference[];
}

export function ProjectForm({
  initial,
  submitLabel,
  pending,
  formError,
  successMessage,
  requireAcknowledgement,
  onSubmit,
}: {
  initial?: ProjectFormValue | undefined;
  submitLabel: string;
  pending: boolean;
  formError?: string;
  successMessage?: string;
  requireAcknowledgement?: boolean;
  onSubmit(value: ProjectSetupInput, acknowledgement: boolean): Promise<boolean>;
}) {
  const empty = useMemo<ProjectFormValue>(() => initial ?? emptyProject(), [initial]);
  const [value, setValue] = useState(empty);
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
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

  return (
    <form className="space-y-6" noValidate onSubmit={(event) => void submit(event)}>
      <FormSection
        description="Name the application and explain why Rift will investigate it."
        title="Basic details"
      >
        <Field error={errors.name} label="Project name">
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
          className="grid gap-3 rounded-xl border border-slate-800 p-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto]"
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
