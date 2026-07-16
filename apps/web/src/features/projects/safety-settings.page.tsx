import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ProjectApiError, projectApi, type SafetyPolicy } from '../../services/project-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { primaryButton, ProjectLoading, ProjectMessage, secondaryButton } from './project-ui.js';

const methods = ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'] as const;
const restrictions = [
  'Test environments only',
  'Production and unknown domains denied',
  'Real payments denied',
  'Destructive account actions denied',
  'External data export denied',
  'Real customer changes denied',
  'External email and messaging denied',
  'Repository deletion denied',
  'Infrastructure changes denied',
  'Cross-organisation access denied',
];

export function SafetySettingsPage() {
  const { projectId = '' } = useParams();
  const permissions = useAuthStore((state) => state.permissions);
  const canManage = permissions.includes('MANAGE_PROJECT_SAFETY');
  const queryClient = useQueryClient();
  const [value, setValue] = useState<SafetyPolicy | null>(null);
  const [savedValue, setSavedValue] = useState<SafetyPolicy | null>(null);
  const [hostErrors, setHostErrors] = useState<Record<number, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submissionInFlight = useRef(false);
  const safety = useQuery({
    queryKey: ['projects', projectId, 'safety'],
    queryFn: () => projectApi.getSafety(projectId),
  });
  const project = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectApi.get(projectId),
  });

  useEffect(() => {
    if (safety.data) {
      setValue(safety.data);
      setSavedValue(safety.data);
    }
  }, [safety.data]);

  const dirty = Boolean(
    value && savedValue && policySignature(value) !== policySignature(savedValue),
  );
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  if (safety.isError || project.isError) {
    const requestError = safety.error ?? project.error;
    return (
      <ProjectMessage
        description={requestError instanceof Error ? requestError.message : 'Safety unavailable.'}
        title={
          requestError instanceof ProjectApiError
            ? requestError.status === 403
              ? 'Safety settings access denied'
              : requestError.status === 404
                ? 'Project not found'
                : 'Safety settings unavailable'
            : 'Safety settings unavailable'
        }
      />
    );
  }
  if (safety.isPending || project.isPending || !value)
    return <ProjectLoading label="Loading safety settings…" />;

  function addHost() {
    const blankIndex = value!.domainAllowlist.findIndex((host) => !host.trim());
    if (blankIndex >= 0) {
      setHostErrors((current) => ({ ...current, [blankIndex]: 'Allowed hosts cannot be blank.' }));
      return;
    }
    setValue({ ...value!, domainAllowlist: [...value!.domainAllowlist, ''] });
  }

  function addAction() {
    const blankIndex = value!.prohibitedActions.findIndex((action) => !action.trim());
    if (blankIndex >= 0) {
      setActionErrors((current) => ({
        ...current,
        [blankIndex]: 'Prohibited actions cannot be blank.',
      }));
      return;
    }
    setValue({ ...value!, prohibitedActions: [...value!.prohibitedActions, ''] });
  }

  async function save() {
    if (submissionInFlight.current) return;
    const nextHostErrors: Record<number, string> = {};
    const normalisedHosts = value!.domainAllowlist.map((host, index) => {
      const result = normaliseHost(host);
      if (result.error) nextHostErrors[index] = result.error;
      return result.value;
    });
    const seenHosts = new Map<string, number>();
    normalisedHosts.forEach((host, index) => {
      if (!host) return;
      const previous = seenHosts.get(host);
      if (previous !== undefined) {
        nextHostErrors[index] = 'This host is already allowed.';
        nextHostErrors[previous] = 'This host is duplicated.';
      } else seenHosts.set(host, index);
    });
    if (normalisedHosts.length === 0) {
      setHostErrors(nextHostErrors);
      setError('Add at least one allowed host.');
      return;
    }

    const nextActionErrors: Record<number, string> = {};
    const normalisedActions = value!.prohibitedActions.map((action) =>
      action.trim().replace(/\s+/g, ' '),
    );
    const seenActions = new Map<string, number>();
    normalisedActions.forEach((action, index) => {
      if (!action) nextActionErrors[index] = 'Prohibited actions cannot be blank.';
      const key = normaliseAction(action);
      const previous = seenActions.get(key);
      if (key && previous !== undefined) {
        nextActionErrors[index] = 'This prohibited action is duplicated.';
        nextActionErrors[previous] = 'This prohibited action is duplicated.';
      } else if (key) seenActions.set(key, index);
    });
    setHostErrors(nextHostErrors);
    setActionErrors(nextActionErrors);
    if (Object.keys(nextHostErrors).length || Object.keys(nextActionErrors).length) {
      setError('Correct the highlighted safety settings before saving.');
      return;
    }
    if (value!.allowedHttpMethods.length === 0) {
      setError('Select at least one allowed HTTP method.');
      return;
    }
    if (!acknowledged) {
      setError('Confirm that these targets are authorised for automated testing.');
      return;
    }
    submissionInFlight.current = true;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const updated = await projectApi.updateSafety(projectId, {
        domainAllowlist: normalisedHosts,
        allowedHttpMethods: value!.allowedHttpMethods,
        permitCheckoutSubmission: value!.permitCheckoutSubmission,
        permitMockPayment: value!.permitMockPayment,
        permitOrderCreation: value!.permitOrderCreation,
        prohibitedActions: normalisedActions,
        acknowledgement: true,
      });
      setValue(updated);
      setSavedValue(updated);
      queryClient.setQueryData(['projects', projectId, 'safety'], updated);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setAcknowledged(false);
      setMessage('Safety settings saved.');
    } catch (requestError) {
      setError(
        requestError instanceof ProjectApiError
          ? requestError.message
          : 'WorldLab could not save safety settings.',
      );
    } finally {
      submissionInFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl">
      <PageHeading
        description="Define the exact boundary WorldLab must obey. Unknown targets remain denied."
        eyebrow={project.data.name}
        title="Safety Settings"
      />
      {!canManage ? (
        <ProjectMessage
          description="Your organisation role may inspect this policy, but only authorised Owners and Administrators can change it."
          title="Read-only safety policy"
        />
      ) : null}
      {canManage && dirty ? (
        <p className="mb-4 text-sm font-bold text-amber-300" role="status">
          Unsaved changes
        </p>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0">
          <h2 className="text-xl font-bold">Allowed scope</h2>
          <p className="mt-1 text-sm text-slate-400">
            Only these hosts and HTTP methods are allowed.
          </p>
          <ul className="mt-4 space-y-3" data-testid="domain-allowlist">
            {value.domainAllowlist.map((host, index) => (
              <li className="min-w-0" key={index}>
                {canManage ? (
                  <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <label className="sr-only" htmlFor={`allowed-host-${index}`}>
                        Allowed host {index + 1}
                      </label>
                      <input
                        aria-describedby={
                          hostErrors[index] ? `allowed-host-error-${index}` : undefined
                        }
                        aria-invalid={Boolean(hostErrors[index])}
                        className="w-full font-mono"
                        id={`allowed-host-${index}`}
                        onChange={(event) => {
                          const next = [...value.domainAllowlist];
                          next[index] = event.target.value;
                          setValue({ ...value, domainAllowlist: next });
                          setHostErrors((current) => withoutIndex(current, index));
                        }}
                        value={host}
                      />
                      {hostErrors[index] ? (
                        <p className="mt-1 text-sm text-red-300" id={`allowed-host-error-${index}`}>
                          {hostErrors[index]}
                        </p>
                      ) : null}
                    </div>
                    <button
                      aria-label={`Remove host row ${index + 1}`}
                      className={`${secondaryButton} px-3`}
                      onClick={() => {
                        setValue({
                          ...value,
                          domainAllowlist: value.domainAllowlist.filter((_, row) => row !== index),
                        });
                        setHostErrors({});
                      }}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                  </div>
                ) : (
                  <span className="block break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-sm text-cyan">
                    {host}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canManage ? (
            <button className={`${secondaryButton} mt-3`} onClick={addHost} type="button">
              <Plus aria-hidden="true" className="mr-2" size={17} /> Add host
            </button>
          ) : null}
          <fieldset className="mt-5" disabled={!canManage}>
            <legend className="text-sm font-bold">Allowed HTTP methods</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {methods.map((method) => (
                <label className="flex items-center gap-2 text-sm" key={method}>
                  <input
                    checked={value.allowedHttpMethods.includes(method)}
                    onChange={(event) =>
                      setValue({
                        ...value,
                        allowedHttpMethods: event.target.checked
                          ? [...value.allowedHttpMethods, method]
                          : value.allowedHttpMethods.filter((item) => item !== method),
                      })
                    }
                    type="checkbox"
                  />
                  {method}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 space-y-3">
            <SafetyToggle
              checked={value.permitCheckoutSubmission}
              disabled={!canManage}
              label="Permit checkout submission"
              onChange={(permitCheckoutSubmission) =>
                setValue({ ...value, permitCheckoutSubmission })
              }
            />
            <SafetyToggle
              checked={value.permitMockPayment}
              disabled={!canManage}
              label="Permit mock payment"
              onChange={(permitMockPayment) => setValue({ ...value, permitMockPayment })}
            />
            <SafetyToggle
              checked={value.permitOrderCreation}
              disabled={!canManage}
              label="Permit test order creation"
              onChange={(permitOrderCreation) => setValue({ ...value, permitOrderCreation })}
            />
          </div>
        </section>

        <section className="card min-w-0">
          <h2 className="text-xl font-bold">Safety restrictions</h2>
          <p className="mt-1 text-sm text-slate-400">
            These fail-closed restrictions are always enforced.
          </p>
          <ul className="mt-4 space-y-2">
            {restrictions.map((restriction) => (
              <li className="flex gap-2 text-sm text-slate-300" key={restriction}>
                <ShieldAlert
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-amber-300"
                  size={16}
                />
                {restriction}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-6 min-w-0">
        <h2 className="text-xl font-bold">Prohibited actions</h2>
        <p className="mt-1 text-sm text-slate-400">Actions TaskOS must never perform.</p>
        {value.prohibitedActions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No prohibited actions configured.</p>
        ) : (
          <ul className="mt-4 space-y-3" data-testid="prohibited-actions">
            {value.prohibitedActions.map((action, index) => (
              <li
                className="grid min-w-0 gap-2 rounded-lg border border-slate-800 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                key={index}
              >
                {canManage ? (
                  <div className="min-w-0">
                    <label className="sr-only" htmlFor={`prohibited-action-${index}`}>
                      Prohibited action {index + 1}
                    </label>
                    <input
                      aria-describedby={
                        actionErrors[index] ? `prohibited-action-error-${index}` : undefined
                      }
                      aria-invalid={Boolean(actionErrors[index])}
                      className="w-full"
                      id={`prohibited-action-${index}`}
                      maxLength={240}
                      onChange={(event) => {
                        const next = [...value.prohibitedActions];
                        next[index] = event.target.value;
                        setValue({ ...value, prohibitedActions: next });
                        setActionErrors((current) => withoutIndex(current, index));
                      }}
                      value={action}
                    />
                    {actionErrors[index] ? (
                      <p
                        className="mt-1 text-sm text-red-300"
                        id={`prohibited-action-error-${index}`}
                      >
                        {actionErrors[index]}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <span className="break-words text-sm">{action}</span>
                )}
                {canManage ? (
                  <button
                    aria-label={`Remove action row ${index + 1}`}
                    className={`${secondaryButton} px-3`}
                    onClick={() => {
                      setValue({
                        ...value,
                        prohibitedActions: value.prohibitedActions.filter(
                          (_, row) => row !== index,
                        ),
                      });
                      setActionErrors({});
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <button className={`${secondaryButton} mt-4`} onClick={addAction} type="button">
            <Plus aria-hidden="true" className="mr-2" size={17} /> Add action
          </button>
        ) : null}
      </section>

      {canManage ? (
        <section className="card mt-6 border-amber-500/30">
          <label className="flex items-start gap-3">
            <input
              checked={acknowledged}
              className="mt-1 size-4"
              onChange={(event) => setAcknowledged(event.target.checked)}
              type="checkbox"
            />
            <span className="text-sm">
              I confirm that these targets and credentials are authorised for automated testing.
            </span>
          </label>
          {error ? (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="mt-3 text-sm text-emerald-300" role="status">
              {message}
            </p>
          ) : null}
          <button
            className={`${primaryButton} mt-4`}
            disabled={pending}
            onClick={() => void save()}
            type="button"
          >
            {pending ? 'Saving safety settings…' : 'Save safety settings'}
          </button>
        </section>
      ) : null}
    </section>
  );
}

function SafetyToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function policySignature(policy: SafetyPolicy) {
  return JSON.stringify({
    domainAllowlist: policy.domainAllowlist,
    allowedHttpMethods: policy.allowedHttpMethods,
    permitCheckoutSubmission: policy.permitCheckoutSubmission,
    permitMockPayment: policy.permitMockPayment,
    permitOrderCreation: policy.permitOrderCreation,
    prohibitedActions: policy.prohibitedActions,
  });
}

function normaliseAction(action: string) {
  return action
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!?]+$/, '');
}

function normaliseHost(input: string): { value: string; error?: string } {
  const raw = input.trim();
  if (!raw) return { value: '', error: 'Allowed hosts cannot be blank.' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return { value: '', error: 'Only HTTP and HTTPS URLs are supported.' };
      return { value: url.hostname.replace(/^\[|\]$/g, '').toLowerCase() };
    } catch {
      return { value: '', error: 'Enter a valid hostname or HTTP(S) URL.' };
    }
  }
  if (raw.includes('/') || raw.includes('?') || raw.includes('#'))
    return { value: '', error: 'Enter a hostname without a path or query string.' };
  const host = raw.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || isValidIpv4(host) || isValidIpv6(host)) return { value: host };
  if (
    !host.includes('.') ||
    !/^(?=.{1,253}$)(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      host,
    )
  )
    return { value: '', error: 'Enter a valid hostname.' };
  return { value: host };
}

function isValidIpv4(value: string) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isValidIpv6(value: string) {
  if (!value.includes(':') || !/^[0-9a-f:]+$/i.test(value)) return false;
  try {
    return new URL(`http://[${value}]`).hostname.length > 0;
  } catch {
    return false;
  }
}

function withoutIndex(errors: Record<number, string>, index: number) {
  const next = { ...errors };
  delete next[index];
  return next;
}
