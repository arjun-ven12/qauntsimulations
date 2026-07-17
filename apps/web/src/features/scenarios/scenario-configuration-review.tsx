import type { Environment } from '../../services/environment-api.js';
import type { Invariant } from '../invariants/invariant-api.js';
import type { Journey } from '../journeys/journey-api.js';
import type { ScenarioPreflightResult } from './scenario-api.js';
import type { ScenarioFormValue } from './scenario-form.model.js';

export function ScenarioConfigurationReview({
  value,
  environments,
  journeys,
  invariants,
  preflight,
}: {
  value: ScenarioFormValue;
  environments: Environment[];
  journeys: Journey[];
  invariants: Invariant[];
  preflight: ScenarioPreflightResult | null;
}) {
  const environment = environments.find((item) => item.id === value.environmentId);
  const journey = journeys.find((item) => item.id === value.journeyId);
  const selectedInvariants = value.invariantIds
    .map((id) => invariants.find((item) => item.id === id))
    .filter((item): item is Invariant => Boolean(item));
  const controls = value.scenario.controls;
  return (
    <section className="card min-w-0 space-y-5" data-testid="scenario-review">
      <div>
        <h2 className="text-xl font-black">Configuration review</h2>
        <p className="mt-1 text-sm text-slate-400">
          Review the persisted selections and bounded controls before preflight.
        </p>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <ReviewItem label="Environment" value={environment?.name ?? 'Not selected'} />
        <ReviewItem label="Journey" value={journey?.name ?? 'Not selected'} />
        <ReviewItem
          label="Selected Invariants"
          value={selectedInvariants.map((item) => item.name).join(', ') || 'None selected'}
        />
        <ReviewItem
          label="Exact invariantIds"
          value={value.invariantIds.length ? `[${value.invariantIds.join(', ')}]` : '[]'}
          mono
        />
        <ReviewItem label="Scenario prompt" value={value.scenario.prompt || 'Not provided'} />
        <ReviewItem label="Browsers" value={controls.browsers.join(', ') || 'None'} />
        <ReviewItem label="Viewports" value={controls.viewports.join(', ') || 'None'} />
        <ReviewItem
          label="Network profiles"
          value={controls.networkProfiles.join(', ') || 'None'}
        />
        <ReviewItem label="Maximum initial worlds" value={String(controls.maximumWorlds)} />
        <ReviewItem
          label="Maximum concurrent workers"
          value={String(controls.maximumConcurrentWorkers)}
        />
        <ReviewItem
          label="Readiness"
          value={preflight?.status === 'READY' ? 'READY' : 'Preflight required'}
        />
        <ReviewItem
          label="Project Safety"
          value={
            preflight
              ? 'Backend validation passed; see warnings below.'
              : 'Checked authoritatively by the backend during preflight.'
          }
        />
      </dl>
    </section>
  );
}

function ReviewItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words font-bold ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
