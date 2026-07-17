import { primaryButton } from '../projects/project-ui.js';
import type { InvariantType } from '../invariants/invariant-api.js';
import { scenarioPresets, type ScenarioPreset } from './scenario-presets.js';

export function ScenarioPresetSelector({
  selectedPresetId,
  appliedPresetId,
  customised,
  unavailableInvariantTypes,
  onSelect,
  onApply,
}: {
  selectedPresetId: string;
  appliedPresetId: string | null;
  customised: boolean;
  unavailableInvariantTypes: InvariantType[];
  onSelect(preset: ScenarioPreset): void;
  onApply(): void;
}) {
  const selectedPreset = scenarioPresets.find((preset) => preset.id === selectedPresetId)!;
  return (
    <div className="space-y-4" data-testid="scenario-presets">
      <div className="grid gap-3 md:grid-cols-2">
        {scenarioPresets.map((preset) => {
          const selected = preset.id === selectedPresetId;
          const applied = preset.id === appliedPresetId;
          return (
            <button
              aria-pressed={selected}
              className={`min-w-0 rounded-xl border p-4 text-left transition ${
                selected
                  ? 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                  : 'border-slate-700 bg-slate-950/30 hover:border-slate-500'
              }`}
              data-preset-id={preset.id}
              key={preset.id}
              onClick={() => onSelect(preset)}
              type="button"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black text-slate-100">{preset.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {preset.recommended ? <StatusBadge label="Recommended" tone="cyan" /> : null}
                  {applied ? (
                    <StatusBadge label={customised ? 'Customised' : 'Applied'} tone={customised ? 'amber' : 'emerald'} />
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-400">{preset.description}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <Summary label="Browser" value={summary(preset.controls.browsers)} />
                <Summary label="Viewport" value={summary(preset.controls.viewports)} />
                <Summary label="Network" value={summary(preset.controls.networkProfiles)} />
                <Summary
                  label="Invariants"
                  value={`${preset.recommendedInvariantTypes.length} recommended`}
                />
              </dl>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="min-w-0">
          <p className="font-bold text-slate-200">{selectedPreset.name}</p>
          <p className="mt-1 text-sm text-slate-400">
            Apply this preset, then adjust any prompt, control, or Invariant selection below.
          </p>
        </div>
        <button className={primaryButton} onClick={onApply} type="button">
          Use preset
        </button>
      </div>

      {unavailableInvariantTypes.length ? (
        <p className="rounded-lg border border-amber-900/70 bg-amber-950/20 px-4 py-3 text-sm text-amber-200" role="status">
          Preset applied. Unavailable recommended Invariants were left unselected:{' '}
          {unavailableInvariantTypes.join(', ')}.
        </p>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-300">{value}</dd>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'cyan' | 'emerald' | 'amber' }) {
  const classes = {
    cyan: 'border-cyan-700 bg-cyan-950/50 text-cyan-200',
    emerald: 'border-emerald-800 bg-emerald-950/50 text-emerald-200',
    amber: 'border-amber-800 bg-amber-950/50 text-amber-200',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${classes[tone]}`}>
      {label}
    </span>
  );
}

function summary(values: string[]) {
  return values
    .map((value) =>
      value
        .replace('desktop-1440x900', 'Desktop 1440×900')
        .replace('mobile-390x844', 'Mobile 390×844')
        .replace('delayed-payment', 'Delayed payment')
        .replace('chromium', 'Chromium')
        .replace('normal', 'Normal'),
    )
    .join(', ');
}
