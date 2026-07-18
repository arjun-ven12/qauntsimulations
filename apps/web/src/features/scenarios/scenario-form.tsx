import { useRef, useState } from 'react';
import type { Environment } from '../../services/environment-api.js';
import type { Invariant, InvariantType } from '../invariants/invariant-api.js';
import type { Journey } from '../journeys/journey-api.js';
import { Field, primaryButton, secondaryButton } from '../projects/project-ui.js';
import {
  TemplateManager,
  builtInTemplate,
  scenarioTemplatePayloadSchema,
} from '../templates/index.js';
import type { ScenarioLaunchInput, ScenarioPreflightResult } from './scenario-api.js';
import { ScenarioConfigurationReview } from './scenario-configuration-review.js';
import { ScenarioControlsEditor } from './scenario-controls.js';
import {
  isInvariantSelectable,
  isJourneySelectable,
  createRequestLock,
  preflightMatchesPayload,
  runRequestOnce,
  scenarioFormErrors,
  toScenarioLaunchInput,
  type ScenarioFormValue,
} from './scenario-form.model.js';
import { applyScenarioPreset, scenarioPresets } from './scenario-presets.js';
import { ScenarioPreflightResults } from './scenario-preflight-results.js';

interface ReadyPreflight {
  payload: ScenarioLaunchInput;
  result: ScenarioPreflightResult;
}

export function ScenarioForm({
  initial,
  environments,
  journeys,
  invariants,
  launchError,
  launchPending = false,
  onPreflight,
  onLaunch,
}: {
  initial: ScenarioFormValue;
  environments: Environment[];
  journeys: Journey[];
  invariants: Invariant[];
  launchError?: Error | null;
  launchPending?: boolean;
  onPreflight(input: ScenarioLaunchInput): Promise<ScenarioPreflightResult>;
  onLaunch(input: ScenarioLaunchInput): Promise<void>;
}) {
  const [value, setValue] = useState<ScenarioFormValue>(() => structuredClone(initial));
  const [submitted, setSubmitted] = useState(false);
  const [preflightPending, setPreflightPending] = useState(false);
  const [preflightError, setPreflightError] = useState<Error | null>(null);
  const [readyPreflight, setReadyPreflight] = useState<ReadyPreflight | null>(null);
  const [localLaunchPending, setLocalLaunchPending] = useState(false);
  const [unavailableInvariantTypes, setUnavailableInvariantTypes] = useState<InvariantType[]>([]);
  const preflightInFlight = useRef(createRequestLock());
  const launchInFlight = useRef(createRequestLock());
  const errors = scenarioFormErrors(value, journeys, invariants);
  const currentPayload = toScenarioLaunchInput(value);
  const readyForCurrentPayload = preflightMatchesPayload(
    readyPreflight?.payload ?? null,
    currentPayload,
  );

  const change = (next: ScenarioFormValue) => {
    setValue(next);
    setReadyPreflight(null);
    setPreflightError(null);
  };

  const runPreflight = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length || !preflightInFlight.current.enter()) return;
    const payload = toScenarioLaunchInput(value);
    setPreflightPending(true);
    setPreflightError(null);
    setReadyPreflight(null);
    try {
      const result = await onPreflight(payload);
      setReadyPreflight({ payload: structuredClone(payload), result });
    } catch (error) {
      setPreflightError(error instanceof Error ? error : new Error('Preflight failed.'));
    } finally {
      preflightInFlight.current.leave();
      setPreflightPending(false);
    }
  };

  const launch = async () => {
    if (!readyPreflight || !readyForCurrentPayload || launchPending) return;
    await runRequestOnce(launchInFlight.current, async () => {
      setLocalLaunchPending(true);
      try {
        await onLaunch(structuredClone(readyPreflight.payload));
      } finally {
        setLocalLaunchPending(false);
      }
    });
  };

  return (
    <div className="mt-6 space-y-6">
      <TemplateManager
        builtIns={scenarioPresets.map((preset) =>
          builtInTemplate(
            'SCENARIO',
            `scenario-built-in-${preset.id}`,
            preset.name,
            preset.description,
            applyScenarioPreset(value, preset, invariants).value,
          ),
        )}
        category="SCENARIO"
        onApply={(payload, template) => {
          const preset = scenarioPresets.find(
            (candidate) => `scenario-built-in-${candidate.id}` === template.id,
          );
          if (preset) {
            const applied = applyScenarioPreset(value, preset, invariants);
            change(applied.value);
            setUnavailableInvariantTypes(applied.unavailableInvariantTypes);
          } else {
            change(payload);
            setUnavailableInvariantTypes([]);
          }
        }}
        payloadSchema={scenarioTemplatePayloadSchema}
        preview={(payload) => (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <TemplatePreview
              label="Worlds"
              value={String(payload.scenario.controls.maximumWorlds)}
            />
            <TemplatePreview
              label="Viewports"
              value={String(payload.scenario.controls.viewports.length)}
            />
            <TemplatePreview label="Invariants" value={String(payload.invariantIds.length)} />
          </dl>
        )}
        value={value}
      />
      {unavailableInvariantTypes.length ? (
        <p
          className="rounded-lg border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] px-4 py-3 text-sm text-[var(--status-pending)]"
          role="status"
        >
          Template applied. Unavailable recommended Invariants were left unselected:{' '}
          {unavailableInvariantTypes.join(', ')}.
        </p>
      ) : null}

      <FormSection
        description="Choose one persisted Environment. Non-READY Environments remain visible but unavailable."
        title="1. Environment"
      >
        <div className="grid gap-4 lg:grid-cols-2" data-testid="environment-selector">
          {environments.map((environment) => {
            const ready = environment.validationStatus === 'READY';
            return (
              <label
                className={`rift-choice-control min-w-0 p-4 ${ready ? '' : 'border-amber-900 bg-amber-950/20'}`}
                key={environment.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    checked={value.environmentId === environment.id}
                    disabled={!ready}
                    name="environment"
                    onChange={() =>
                      change({ ...value, environmentId: environment.id, journeyId: '' })
                    }
                    type="radio"
                  />
                  <div className="min-w-0">
                    <p className="break-words font-black">{environment.name}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {environment.type} · {environment.validationStatus}
                      {environment.isDefault ? ' · Default' : ''}
                    </p>
                    {!ready ? (
                      <p className="mt-2 break-words text-sm text-amber-300">
                        Runtime readiness requires backend validation status READY.
                      </p>
                    ) : null}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {submitted && errors.environmentId ? <InlineError message={errors.environmentId} /> : null}
      </FormSection>

      <FormSection
        description="Choose one READY, enabled Journey configured for the selected Environment."
        title="2. Journey"
      >
        <div className="grid gap-4 lg:grid-cols-2" data-testid="journey-selector">
          {journeys.map((journey) => {
            const selectable = isJourneySelectable(journey, value.environmentId);
            const compatibility = !value.environmentId
              ? 'Select an Environment first'
              : journey.environmentId === value.environmentId
                ? 'Environment compatible'
                : 'Different Environment';
            return (
              <label
                className={`rift-choice-control min-w-0 p-4 ${selectable ? '' : 'opacity-70'}`}
                key={journey.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    checked={value.journeyId === journey.id}
                    disabled={!selectable}
                    name="journey"
                    onChange={() => change({ ...value, journeyId: journey.id })}
                    type="radio"
                  />
                  <div className="min-w-0">
                    <p className="break-words font-black">{journey.name}</p>
                    <p className="mt-1 break-words text-sm text-slate-400">
                      {journey.validationStatus} · {journey.state} · {journey.steps.length}{' '}
                      executable steps
                    </p>
                    <p
                      className={`mt-2 text-sm ${selectable ? 'text-emerald-300' : 'text-amber-300'}`}
                    >
                      {compatibility}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {submitted && errors.journeyId ? <InlineError message={errors.journeyId} /> : null}
      </FormSection>

      <FormSection
        description="Select one or more persisted READY, enabled Invariants. Unavailable records cannot be selected."
        title="3. Invariants"
      >
        <div className="grid gap-4 lg:grid-cols-2" data-testid="invariant-selector">
          {invariants.map((invariant) => {
            const selectable = isInvariantSelectable(invariant);
            return (
              <label
                className={`rift-choice-control min-w-0 p-4 ${selectable ? '' : 'opacity-70'}`}
                key={invariant.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    checked={value.invariantIds.includes(invariant.id)}
                    disabled={!selectable}
                    onChange={(event) =>
                      change({
                        ...value,
                        invariantIds: event.target.checked
                          ? [...value.invariantIds, invariant.id]
                          : value.invariantIds.filter((id) => id !== invariant.id),
                      })
                    }
                    type="checkbox"
                  />
                  <div className="min-w-0">
                    <p className="break-words font-black">{invariant.name}</p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-300">
                      {invariant.type ?? 'UNSUPPORTED'}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      {invariant.severity ?? 'No severity'} · {invariant.validationStatus} ·{' '}
                      {invariant.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                    {!selectable ? (
                      <p className="mt-2 text-sm text-amber-300">Not selectable for launch</p>
                    ) : null}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {submitted && errors.invariantIds ? <InlineError message={errors.invariantIds} /> : null}
      </FormSection>

      <FormSection
        description="Describe the behaviour to challenge in natural language. This text is treated as data, never executable input."
        title="4. Scenario prompt"
      >
        <Field error={submitted ? errors.prompt : undefined} label="Investigation objective">
          <textarea
            className="min-h-40 w-full resize-y"
            maxLength={5_000}
            onChange={(event) =>
              change({ ...value, scenario: { ...value.scenario, prompt: event.target.value } })
            }
            placeholder="Describe the checkout behaviour and conditions to investigate."
            value={value.scenario.prompt}
          />
        </Field>
      </FormSection>

      <FormSection
        description="Only controls accepted by the persisted launch schema are exposed."
        title="5. Supported controls"
      >
        <ScenarioControlsEditor
          errors={submitted ? errors : {}}
          onChange={(controls) => change({ ...value, scenario: { ...value.scenario, controls } })}
          value={value.scenario.controls}
        />
      </FormSection>

      <ScenarioConfigurationReview
        environments={environments}
        invariants={invariants}
        journeys={journeys}
        preflight={readyPreflight?.result ?? null}
        value={value}
      />

      <ScenarioPreflightResults error={preflightError} result={readyPreflight?.result ?? null} />

      {launchError ? (
        <section className="card min-w-0 border-red-900" role="alert">
          <h2 className="font-black text-red-300">Launch failed</h2>
          <p className="mt-2 break-all font-mono text-xs font-bold text-red-200">
            {'code' in launchError && typeof launchError.code === 'string'
              ? launchError.code
              : 'LAUNCH_FAILED'}
          </p>
          <p className="mt-2 break-words text-sm text-slate-300">{launchError.message}</p>
          <p className="mt-2 text-sm text-slate-500">
            Your Scenario selections and prompt are preserved.
          </p>
        </section>
      ) : null}

      <section className="card min-w-0">
        <div className="flex flex-wrap gap-3">
          <button
            className={secondaryButton}
            disabled={preflightPending || launchPending || localLaunchPending}
            onClick={() => void runPreflight()}
            type="button"
          >
            {preflightPending ? 'Running preflight…' : 'Run preflight'}
          </button>
          <button
            className={primaryButton}
            disabled={
              !readyForCurrentPayload || preflightPending || launchPending || localLaunchPending
            }
            onClick={() => void launch()}
            type="button"
          >
            {launchPending || localLaunchPending ? 'Launching Rift…' : 'Launch Investigation'}
          </button>
        </div>
        {!readyForCurrentPayload ? (
          <p className="mt-3 text-sm text-slate-400">
            Launch requires a READY preflight for the current payload.
          </p>
        ) : null}
      </section>
    </div>
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

function InlineError({ message }: { message: string }) {
  return (
    <p className="text-sm text-red-300" role="alert">
      {message}
    </p>
  );
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
