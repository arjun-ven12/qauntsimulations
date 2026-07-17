import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  type EnvironmentAction,
  type EnvironmentConfig,
  type EnvironmentInput,
  type HttpMethod,
} from '../../services/environment-api.js';
import { projectApi } from '../../services/project-api.js';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'];
const ENVIRONMENT_TYPES: EnvironmentInput['type'][] = [
  'LOCAL',
  'STAGING',
  'PREVIEW',
  'TEST_MIRROR',
];
const ACTIONS: EnvironmentAction[] = [
  'NAVIGATE_APPLICATION',
  'READ_APPLICATION_STATE',
  'SUBMIT_FORMS',
  'PERFORM_CHECKOUT',
  'SUBMIT_MOCK_PAYMENT',
  'CREATE_TEST_ORDER',
  'RESET_TEST_DATA',
  'CHANGE_FEATURE_FLAGS',
  'CAPTURE_SCREENSHOTS',
  'CAPTURE_TRACES',
  'RECORD_NETWORK_TRAFFIC',
];

function emptyConfiguration(): EnvironmentConfig {
  return {
    featureFlagEndpoint: null,
    featureFlagMethod: 'POST',
    featureFlags: [],
    payment: {
      mode: 'MOCK',
      delayMs: 0,
      result: 'SUCCESS',
      retryEnabled: false,
      maxRetries: 0,
    },
    reset: {
      mode: 'NONE',
      endpoint: null,
      method: 'POST',
      credentialReference: null,
      timeoutMs: 10000,
      expectedStatus: 200,
      beforeEachWorld: false,
      afterEachWorld: false,
      procedure: null,
      scriptReference: null,
    },
    testData: {
      customerCredentialReference: null,
      productIdentifier: null,
      initialInventory: 0,
      seedProfile: null,
      orderCleanup: null,
      isolation: 'UNIQUE_TEST_DATA_PER_WORLD',
    },
    credentialReferences: [],
    allowedActions: [],
  };
}

export function environmentDefaults(): EnvironmentInput {
  return {
    name: '',
    description: null,
    type: 'LOCAL',
    baseUrl: 'http://localhost:5174',
    apiBaseUrl: 'http://localhost:5174/api',
    healthCheckUrl: null,
    isDefault: true,
    configuration: emptyConfiguration(),
    acknowledgement: true,
  };
}

function initialise(initial: EnvironmentInput): EnvironmentInput {
  const defaults = emptyConfiguration();
  const { validationResults: _validationResults, ...configuration } = initial.configuration;
  return {
    ...initial,
    configuration: {
      ...defaults,
      ...configuration,
      payment: { ...defaults.payment, ...configuration.payment },
      reset: { ...defaults.reset, ...configuration.reset },
      testData: { ...defaults.testData, ...configuration.testData },
      featureFlags: configuration.featureFlags ?? [],
      credentialReferences: configuration.credentialReferences ?? [],
      allowedActions: configuration.allowedActions ?? [],
    },
  };
}

export function EnvironmentForm({
  initial,
  onSubmit,
  pending,
  projectId,
  submitLabel = 'Save Environment',
}: {
  initial: EnvironmentInput;
  onSubmit: (input: EnvironmentInput) => void;
  pending: boolean;
  projectId: string;
  submitLabel?: string;
}) {
  const [value, setValue] = useState(() => initialise(initial));
  const [authorised, setAuthorised] = useState(false);
  const configuration = value.configuration;
  const safetyQuery = useQuery({
    queryKey: ['projects', projectId, 'safety'],
    queryFn: () => projectApi.getSafety(projectId),
  });
  const blockingReasons = useMemo(
    () => getSafetyBlockingReasons(value, safetyQuery.data),
    [safetyQuery.data, value],
  );

  function setConfiguration(next: EnvironmentConfig) {
    setValue((current) => ({ ...current, configuration: next }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authorised || safetyQuery.isPending || safetyQuery.isError || blockingReasons.length) return;
    const { validationResults: _validationResults, ...cleanConfiguration } = value.configuration;
    onSubmit({ ...value, configuration: cleanConfiguration, acknowledgement: true });
  }

  return (
    <form className="mx-auto mt-6 max-w-[1050px] space-y-6" onSubmit={submit}>
      <FormSection
        description="Name this test target and describe how it is used."
        number="01"
        title="Basic details"
      >
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <TextField
            label="Environment name"
            maxLength={100}
            onChange={(name) => setValue({ ...value, name })}
            required
            value={value.name}
          />
          <SelectField
            label="Type"
            onChange={(type) =>
              setValue({ ...value, type: type as EnvironmentInput['type'] })
            }
            value={value.type}
          >
            {ENVIRONMENT_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </SelectField>
          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-200" htmlFor="environment-description">
              Description
            </label>
            <textarea
              className="mt-2 block min-h-28 w-full resize-y"
              id="environment-description"
              maxLength={2000}
              onChange={(event) =>
                setValue({ ...value, description: nullable(event.target.value) })
              }
              rows={4}
              value={value.description ?? ''}
            />
          </div>
          <CheckboxRow
            checked={value.isDefault}
            label="Make this the default environment"
            onChange={(isDefault) => setValue({ ...value, isDefault })}
          />
        </div>
      </FormSection>

      <FormSection
        description="Define the application endpoints TaskOS may connect to."
        number="02"
        title="Application connection"
      >
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <TextField
            label="Base URL"
            onChange={(baseUrl) => setValue({ ...value, baseUrl })}
            placeholder="https://staging.example.com"
            required
            type="url"
            value={value.baseUrl}
          />
          <TextField
            label="API URL"
            onChange={(apiBaseUrl) => setValue({ ...value, apiBaseUrl: nullable(apiBaseUrl) })}
            placeholder="https://staging.example.com/api"
            type="url"
            value={value.apiBaseUrl ?? ''}
          />
          <TextField
            label="Health-check URL"
            onChange={(healthCheckUrl) =>
              setValue({ ...value, healthCheckUrl: nullable(healthCheckUrl) })
            }
            placeholder="https://staging.example.com/health"
            type="url"
            value={value.healthCheckUrl ?? ''}
          />
          <TextField
            label="Feature-flag endpoint"
            onChange={(featureFlagEndpoint) =>
              setConfiguration({
                ...configuration,
                featureFlagEndpoint: nullable(featureFlagEndpoint),
              })
            }
            placeholder="https://staging.example.com/api/flags"
            type="url"
            value={configuration.featureFlagEndpoint ?? ''}
          />
          <SelectField
            label="Feature-flag method"
            onChange={(featureFlagMethod) =>
              setConfiguration({
                ...configuration,
                featureFlagMethod: featureFlagMethod as HttpMethod,
              })
            }
            value={configuration.featureFlagMethod}
          >
            {HTTP_METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </SelectField>
        </div>
      </FormSection>

      <FormSection
        description="Set typed feature-flag overrides for this environment."
        number="03"
        title="Feature flags"
      >
        <div className="space-y-4">
          {configuration.featureFlags.length === 0 ? (
            <EmptyState>No feature flags configured.</EmptyState>
          ) : null}
          {configuration.featureFlags.map((flag, index) => (
            <div className="min-w-0 rounded-xl border border-slate-800 p-4" key={index}>
              <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <TextField
                  label="Key"
                  maxLength={100}
                  onChange={(key) =>
                    updateFeatureFlag(index, { ...flag, key }, configuration, setConfiguration)
                  }
                  required
                  value={flag.key}
                />
                <SelectField
                  label="Type"
                  onChange={(nextType) => {
                    const type = nextType as typeof flag.type;
                    updateFeatureFlag(
                      index,
                      { ...flag, type, value: type === 'BOOLEAN' ? false : type === 'NUMBER' ? 0 : '' },
                      configuration,
                      setConfiguration,
                    );
                  }}
                  value={flag.type}
                >
                  <option>BOOLEAN</option>
                  <option>NUMBER</option>
                  <option>STRING</option>
                </SelectField>
                {flag.type === 'BOOLEAN' ? (
                  <SelectField
                    label="Value"
                    onChange={(nextValue) =>
                      updateFeatureFlag(
                        index,
                        { ...flag, value: nextValue === 'true' },
                        configuration,
                        setConfiguration,
                      )
                    }
                    value={String(flag.value)}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </SelectField>
                ) : (
                  <TextField
                    label="Value"
                    onChange={(nextValue) =>
                      updateFeatureFlag(
                        index,
                        { ...flag, value: flag.type === 'NUMBER' ? Number(nextValue) : nextValue },
                        configuration,
                        setConfiguration,
                      )
                    }
                    required
                    type={flag.type === 'NUMBER' ? 'number' : 'text'}
                    value={String(flag.value)}
                  />
                )}
                <TextField
                  label="Description"
                  maxLength={300}
                  onChange={(description) =>
                    updateFeatureFlag(
                      index,
                      { ...flag, description: nullable(description) },
                      configuration,
                      setConfiguration,
                    )
                  }
                  value={flag.description ?? ''}
                />
              </div>
              <button
                className={`${secondaryButton} mt-4 w-full sm:w-auto`}
                onClick={() =>
                  setConfiguration({
                    ...configuration,
                    featureFlags: configuration.featureFlags.filter((_, item) => item !== index),
                  })
                }
                type="button"
              >
                <Trash2 aria-hidden="true" className="mr-2" size={16} /> Remove
              </button>
            </div>
          ))}
          <button
            className={`${secondaryButton} w-full sm:w-auto`}
            onClick={() =>
              setConfiguration({
                ...configuration,
                featureFlags: [
                  ...configuration.featureFlags,
                  { key: '', type: 'BOOLEAN', value: false, description: null },
                ],
              })
            }
            type="button"
          >
            <Plus aria-hidden="true" className="mr-2" size={17} /> Add feature flag
          </button>
        </div>
      </FormSection>

      <FormSection
        description="Control the payment adapter response used by automated worlds."
        number="04"
        title="Payment behaviour"
      >
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <SelectField
            label="Payment mode"
            onChange={(mode) =>
              setConfiguration({
                ...configuration,
                payment: { ...configuration.payment, mode: mode as EnvironmentConfig['payment']['mode'] },
              })
            }
            value={configuration.payment.mode}
          >
            <option>MOCK</option>
            <option>SANDBOX</option>
            <option>DISABLED</option>
          </SelectField>
          <NumberField
            label="Delay (ms)"
            max={120000}
            min={0}
            onChange={(delayMs) =>
              setConfiguration({
                ...configuration,
                payment: { ...configuration.payment, delayMs },
              })
            }
            value={configuration.payment.delayMs}
          />
          <SelectField
            label="Result"
            onChange={(result) =>
              setConfiguration({
                ...configuration,
                payment: {
                  ...configuration.payment,
                  result: result as EnvironmentConfig['payment']['result'],
                },
              })
            }
            value={configuration.payment.result}
          >
            <option>SUCCESS</option>
            <option>DECLINE</option>
            <option>TIMEOUT</option>
            <option>INTERMITTENT</option>
          </SelectField>
          <NumberField
            disabled={!configuration.payment.retryEnabled}
            label="Maximum retries"
            max={20}
            min={0}
            onChange={(maxRetries) =>
              setConfiguration({
                ...configuration,
                payment: { ...configuration.payment, maxRetries },
              })
            }
            value={configuration.payment.maxRetries}
          />
          <CheckboxRow
            checked={configuration.payment.retryEnabled}
            label="Retry enabled"
            onChange={(retryEnabled) =>
              setConfiguration({
                ...configuration,
                payment: { ...configuration.payment, retryEnabled },
              })
            }
          />
        </div>
      </FormSection>

      <FormSection
        description="Describe how TaskOS restores state around each world."
        number="05"
        title="Reset procedure"
      >
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <SelectField
            label="Reset mode"
            onChange={(mode) =>
              setConfiguration({
                ...configuration,
                reset: {
                  ...configuration.reset,
                  mode: mode as EnvironmentConfig['reset']['mode'],
                },
              })
            }
            value={configuration.reset.mode}
          >
            <option>HTTP_ENDPOINT</option>
            <option>SCRIPT_REFERENCE</option>
            <option>MANUAL</option>
            <option>NONE</option>
          </SelectField>
          {configuration.reset.mode === 'HTTP_ENDPOINT' ? (
            <>
              <TextField
                label="Endpoint"
                onChange={(endpoint) => updateReset({ endpoint: nullable(endpoint) })}
                required
                type="url"
                value={configuration.reset.endpoint ?? ''}
              />
              <SelectField
                label="Method"
                onChange={(method) => updateReset({ method: method as HttpMethod })}
                value={configuration.reset.method}
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </SelectField>
              <TextField
                label="Credential reference"
                onChange={(credentialReference) =>
                  updateReset({ credentialReference: nullable(credentialReference) })
                }
                placeholder="vault://taskos/reset-token"
                value={configuration.reset.credentialReference ?? ''}
              />
              <NumberField
                label="Timeout (ms)"
                max={120000}
                min={1}
                onChange={(timeoutMs) => updateReset({ timeoutMs })}
                value={configuration.reset.timeoutMs}
              />
              <NumberField
                label="Expected status"
                max={599}
                min={100}
                onChange={(expectedStatus) => updateReset({ expectedStatus })}
                value={configuration.reset.expectedStatus}
              />
            </>
          ) : null}
          {configuration.reset.mode === 'SCRIPT_REFERENCE' ? (
            <TextField
              label="Script reference"
              onChange={(scriptReference) => updateReset({ scriptReference: nullable(scriptReference) })}
              placeholder="env://RESET_SCRIPT"
              required
              value={configuration.reset.scriptReference ?? ''}
            />
          ) : null}
          {configuration.reset.mode === 'MANUAL' ? (
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-200" htmlFor="manual-procedure">
                Manual procedure
              </label>
              <textarea
                className="mt-2 block min-h-32 w-full resize-y"
                id="manual-procedure"
                maxLength={2000}
                onChange={(event) => updateReset({ procedure: nullable(event.target.value) })}
                required
                rows={5}
                value={configuration.reset.procedure ?? ''}
              />
            </div>
          ) : null}
          <div className="space-y-3 md:col-span-2">
            <CheckboxRow
              checked={configuration.reset.beforeEachWorld}
              label="Run before each world"
              onChange={(beforeEachWorld) => updateReset({ beforeEachWorld })}
            />
            <CheckboxRow
              checked={configuration.reset.afterEachWorld}
              label="Run after each world"
              onChange={(afterEachWorld) => updateReset({ afterEachWorld })}
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        description="Identify safe seed data and how each world must isolate it."
        number="06"
        title="Test data"
      >
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <TextField
            label="Customer credential reference"
            onChange={(customerCredentialReference) =>
              updateTestData({ customerCredentialReference: nullable(customerCredentialReference) })
            }
            placeholder="secret-manager://taskos/test-customer"
            value={configuration.testData.customerCredentialReference ?? ''}
          />
          <TextField
            label="Product identifier"
            maxLength={200}
            onChange={(productIdentifier) =>
              updateTestData({ productIdentifier: nullable(productIdentifier) })
            }
            value={configuration.testData.productIdentifier ?? ''}
          />
          <NumberField
            label="Initial inventory"
            max={1000000}
            min={0}
            onChange={(initialInventory) => updateTestData({ initialInventory })}
            value={configuration.testData.initialInventory}
          />
          <TextField
            label="Seed profile"
            maxLength={200}
            onChange={(seedProfile) => updateTestData({ seedProfile: nullable(seedProfile) })}
            value={configuration.testData.seedProfile ?? ''}
          />
          <TextField
            label="Order cleanup"
            maxLength={200}
            onChange={(orderCleanup) => updateTestData({ orderCleanup: nullable(orderCleanup) })}
            value={configuration.testData.orderCleanup ?? ''}
          />
          <SelectField
            label="Isolation strategy"
            onChange={(isolation) =>
              updateTestData({ isolation: isolation as EnvironmentConfig['testData']['isolation'] })
            }
            value={configuration.testData.isolation}
          >
            <option>RESET_BEFORE_WORLD</option>
            <option>UNIQUE_TEST_DATA_PER_WORLD</option>
            <option>SHARED_READ_ONLY</option>
          </SelectField>
        </div>
      </FormSection>

      <FormSection
        description="Store references to secrets only. Never enter credential values."
        number="07"
        title="Credential references"
      >
        <div className="space-y-4">
          {configuration.credentialReferences.length === 0 ? (
            <EmptyState>No credential references configured.</EmptyState>
          ) : null}
          {configuration.credentialReferences.map((credential, index) => (
            <div className="min-w-0 rounded-xl border border-slate-800 p-4" key={index}>
              <div className="grid min-w-0 gap-4 md:grid-cols-3">
                <TextField
                  label="Label"
                  maxLength={100}
                  onChange={(label) => updateCredential(index, { ...credential, label })}
                  required
                  value={credential.label}
                />
                <TextField
                  label="Reference"
                  onChange={(reference) => updateCredential(index, { ...credential, reference })}
                  placeholder="1password://TaskOS/test-user"
                  required
                  value={credential.reference}
                />
                <TextField
                  label="Purpose"
                  maxLength={500}
                  onChange={(purpose) =>
                    updateCredential(index, { ...credential, purpose: nullable(purpose) })
                  }
                  value={credential.purpose ?? ''}
                />
              </div>
              <button
                className={`${secondaryButton} mt-4 w-full sm:w-auto`}
                onClick={() =>
                  setConfiguration({
                    ...configuration,
                    credentialReferences: configuration.credentialReferences.filter(
                      (_, item) => item !== index,
                    ),
                  })
                }
                type="button"
              >
                <Trash2 aria-hidden="true" className="mr-2" size={16} /> Remove
              </button>
            </div>
          ))}
          <button
            className={`${secondaryButton} w-full sm:w-auto`}
            onClick={() =>
              setConfiguration({
                ...configuration,
                credentialReferences: [
                  ...configuration.credentialReferences,
                  { label: '', reference: '', purpose: null },
                ],
              })
            }
            type="button"
          >
            <Plus aria-hidden="true" className="mr-2" size={17} /> Add credential reference
          </button>
        </div>
      </FormSection>

      <FormSection
        description="Choose the exact capabilities TaskOS may exercise in this environment."
        number="08"
        title="Allowed actions"
      >
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {ACTIONS.map((action) => {
            const reason = getActionBlockingReason(action, safetyQuery.data);
            return (
              <label
                className="min-w-0 rounded-xl border border-slate-800 p-4 text-sm"
                key={action}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <input
                    checked={configuration.allowedActions.includes(action)}
                    className="mt-0.5 shrink-0"
                    onChange={(event) =>
                      setConfiguration({
                        ...configuration,
                        allowedActions: event.target.checked
                          ? [...configuration.allowedActions, action]
                          : configuration.allowedActions.filter((item) => item !== action),
                      })
                    }
                    type="checkbox"
                  />
                  <span className="min-w-0 break-words font-bold text-slate-200">
                    {action}
                  </span>
                </span>
                {reason ? <span className="mt-2 block text-xs text-amber-300">{reason}</span> : null}
              </label>
            );
          })}
        </div>
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h3 className="font-bold">Project Safety blocking reasons</h3>
          {safetyQuery.isPending ? (
            <p className="mt-2 text-sm text-slate-400">Loading Project Safety…</p>
          ) : safetyQuery.isError ? (
            <p className="mt-2 text-sm text-red-300">
              Project Safety could not be loaded. Saving is blocked until it is available.
            </p>
          ) : blockingReasons.length ? (
            <ul className="mt-3 space-y-2 text-sm text-amber-200">
              {blockingReasons.map((reason) => (
                <li className="flex gap-2" key={reason}>
                  <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
                  <span className="min-w-0 break-words">{reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-emerald-300">
              This configuration is within the current Project Safety boundary.
            </p>
          )}
          {safetyQuery.data?.prohibitedActions.length ? (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <p className="text-sm font-bold text-slate-300">Project-wide prohibited actions</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">
                {safetyQuery.data.prohibitedActions.map((action) => (
                  <li className="break-words" key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        description="Review the live configuration and confirm this target is authorised for testing."
        number="09"
        title="Review and authorisation"
      >
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Environment" value={value.name || 'Not named'} />
          <SummaryItem label="Type" value={value.type} />
          <SummaryItem label="Base URL" value={value.baseUrl || 'Not set'} />
          <SummaryItem label="Feature flags" value={String(configuration.featureFlags.length)} />
          <SummaryItem label="Payment" value={`${configuration.payment.mode} · ${configuration.payment.result}`} />
          <SummaryItem label="Reset" value={configuration.reset.mode} />
          <SummaryItem label="Data isolation" value={configuration.testData.isolation} />
          <SummaryItem
            label="Credential references"
            value={String(configuration.credentialReferences.length)}
          />
          <SummaryItem label="Allowed actions" value={String(configuration.allowedActions.length)} />
        </dl>
        <div className="mt-5 border-t border-slate-800 pt-5">
          <CheckboxRow
            checked={authorised}
            label="I confirm this environment is authorised for automated testing and contains no real customer or payment data."
            onChange={setAuthorised}
          />
        </div>
      </FormSection>

      <div className="flex justify-end border-t border-slate-800 pt-6">
        <button
          className={`${primaryButton} w-full sm:w-auto`}
          disabled={
            pending ||
            !authorised ||
            safetyQuery.isPending ||
            safetyQuery.isError ||
            blockingReasons.length > 0
          }
          type="submit"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );

  function updateReset(next: Partial<EnvironmentConfig['reset']>) {
    setConfiguration({
      ...configuration,
      reset: { ...configuration.reset, ...next },
    });
  }

  function updateTestData(next: Partial<EnvironmentConfig['testData']>) {
    setConfiguration({
      ...configuration,
      testData: { ...configuration.testData, ...next },
    });
  }

  function updateCredential(
    index: number,
    credential: EnvironmentConfig['credentialReferences'][number],
  ) {
    const credentialReferences = [...configuration.credentialReferences];
    credentialReferences[index] = credential;
    setConfiguration({ ...configuration, credentialReferences });
  }
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="mb-5">
        <p className="eyebrow">{number}</p>
        <h2 className="mt-1 text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'url' | 'number';
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block min-w-0 text-sm font-bold text-slate-200">
      {label}
      <input
        className="mt-2 block w-full min-w-0"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0 text-sm font-bold text-slate-200">
      {label}
      <input
        className="mt-2 block w-full min-w-0 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        required
        type="number"
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm font-bold text-slate-200">
      {label}
      <select
        className="mt-2 block w-full min-w-0"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 items-start gap-3 text-sm text-slate-200">
      <input
        checked={checked}
        className="mt-0.5 shrink-0"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="min-w-0 break-words font-medium">{label}</span>
    </label>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">{children}</p>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function updateFeatureFlag(
  index: number,
  flag: EnvironmentConfig['featureFlags'][number],
  configuration: EnvironmentConfig,
  setConfiguration: (configuration: EnvironmentConfig) => void,
) {
  const featureFlags = [...configuration.featureFlags];
  featureFlags[index] = flag;
  setConfiguration({ ...configuration, featureFlags });
}

function nullable(value: string) {
  return value.trim() ? value : null;
}

function getActionBlockingReason(
  action: EnvironmentAction,
  safety: Awaited<ReturnType<typeof projectApi.getSafety>> | undefined,
) {
  if (!safety) return null;
  if (action === 'PERFORM_CHECKOUT' && !safety.permitCheckoutSubmission)
    return 'Blocked: Project Safety does not permit checkout submission.';
  if (action === 'SUBMIT_MOCK_PAYMENT' && !safety.permitMockPayment)
    return 'Blocked: Project Safety does not permit mock payment.';
  if (action === 'CREATE_TEST_ORDER' && !safety.permitTestOrderCreation)
    return 'Blocked: Project Safety does not permit test-order creation.';
  return null;
}

function getSafetyBlockingReasons(
  value: EnvironmentInput,
  safety: Awaited<ReturnType<typeof projectApi.getSafety>> | undefined,
) {
  if (!safety) return [];
  const reasons = new Set<string>();
  const urls = [
    ['Base URL', value.baseUrl],
    ['API URL', value.apiBaseUrl],
    ['Health-check URL', value.healthCheckUrl],
    ['Feature-flag endpoint', value.configuration.featureFlagEndpoint],
    ['Reset endpoint', value.configuration.reset.endpoint],
  ] as const;
  for (const [label, url] of urls) {
    if (!url) continue;
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (!safety.domainAllowlist.includes(host))
        reasons.add(`${label} host “${host}” is not in the Project Safety allowlist.`);
    } catch {
      // Native URL field validation reports malformed URLs.
    }
  }
  const methods = [
    ['Feature-flag method', value.configuration.featureFlagMethod],
    ['Reset method', value.configuration.reset.method],
  ] as const;
  for (const [label, method] of methods) {
    if (!safety.allowedHttpMethods.includes(method))
      reasons.add(`${label} ${method} is not allowed by Project Safety.`);
  }
  for (const action of value.configuration.allowedActions) {
    const reason = getActionBlockingReason(action, safety);
    if (reason) reasons.add(reason.replace(/^Blocked: /, ''));
  }
  if (value.configuration.payment.mode === 'MOCK' && !safety.permitMockPayment)
    reasons.add('MOCK payment mode is not permitted by Project Safety.');
  return [...reasons];
}
