import { Field } from '../projects/project-ui.js';
import {
  browserOptions,
  networkProfileOptions,
  viewportOptions,
  type ScenarioFormValue,
} from './scenario-form.model.js';

export function ScenarioControlsEditor({
  value,
  errors,
  disabled = false,
  onChange,
}: {
  value: ScenarioFormValue['scenario']['controls'];
  errors: Record<string, string>;
  disabled?: boolean;
  onChange(value: ScenarioFormValue['scenario']['controls']): void;
}) {
  return (
    <div className="space-y-5" data-testid="scenario-controls">
      <ControlOptions
        error={errors.browsers}
        label="Browsers"
        onChange={(browsers) => onChange({ ...value, browsers })}
        options={browserOptions}
        selected={value.browsers}
      />
      <ControlOptions
        error={errors.viewports}
        label="Viewports"
        onChange={(viewports) => onChange({ ...value, viewports })}
        options={viewportOptions}
        selected={value.viewports}
      />
      <ControlOptions
        error={errors.networkProfiles}
        label="Network profiles"
        onChange={(networkProfiles) => onChange({ ...value, networkProfiles })}
        options={networkProfileOptions}
        selected={value.networkProfiles}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <Field error={errors.maximumWorlds} label="Maximum worlds">
          <input
            className="w-full"
            disabled={disabled}
            max={100}
            min={1}
            onChange={(event) =>
              onChange({ ...value, maximumWorlds: Number(event.target.value) })
            }
            type="number"
            value={value.maximumWorlds}
          />
        </Field>
        <Field error={errors.maximumConcurrentWorkers} label="Maximum concurrent workers">
          <input
            className="w-full"
            disabled={disabled}
            max={20}
            min={1}
            onChange={(event) =>
              onChange({ ...value, maximumConcurrentWorkers: Number(event.target.value) })
            }
            type="number"
            value={value.maximumConcurrentWorkers}
          />
        </Field>
      </div>
    </div>
  );
}

function ControlOptions({
  label,
  options,
  selected,
  error,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
  error?: string | undefined;
  onChange(value: string[]): void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-slate-200">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-3">
        {options.map((option) => (
          <label
            className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-4"
            key={option.value}
          >
            <input
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((candidate) => candidate !== option.value),
                )
              }
              type="checkbox"
            />
            <span className="text-sm font-bold">{option.label}</span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm text-red-300" role="alert">{error}</p> : null}
    </fieldset>
  );
}
