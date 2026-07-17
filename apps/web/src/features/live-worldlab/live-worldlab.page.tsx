import { useQuery } from '@tanstack/react-query';
import type { InvestigationEvent } from '@taskos/shared-types';
import { useParams } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { PageHeading } from '../../components/page-heading.js';
import { investigationApi } from '../../services/api/index.js';

function metadataString(event: InvestigationEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function metadataNumber(event: InvestigationEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function providerLabel(event: InvestigationEvent) {
  const provider = metadataString(event, 'provider');
  if (!provider) return null;
  if (provider === 'LOCAL') return 'Local worker';
  if (provider === 'DAYTONA') return 'Daytona sandbox';
  return `Provider: ${provider}`;
}

export function timingLabels(event: InvestigationEvent) {
  return [
    ['Setup', metadataNumber(event, 'sandboxSetupDurationMs')],
    ['Worker', metadataNumber(event, 'workerExecutionDurationMs')],
    ['Artifacts', metadataNumber(event, 'artifactDownloadDurationMs')],
  ]
    .filter((item): item is [string, number] => item[1] !== null)
    .map(([label, value]) => `${label}: ${Math.round(value).toLocaleString()} ms`);
}

export function cleanupWarning(event: InvestigationEvent) {
  const phase = metadataString(event, 'phase');
  const outcome = metadataString(event, 'cleanupOutcome');
  const error = metadataString(event, 'error') ?? metadataString(event, 'cleanupError');
  if (phase !== 'sandbox_cleanup_failed' && outcome !== 'FAILED' && !error) return null;
  return error ? `Cleanup failed: ${error}` : 'Cleanup failed. Manual sandbox cleanup may be required.';
}

export function plannerLabels(event: InvestigationEvent) {
  return [
    ['Planner', metadataString(event, 'plannerProvenance')],
    ['Plan status', metadataString(event, 'plannerStatus')],
  ]
    .filter((item): item is [string, string] => item[1] !== null)
    .map(([label, value]) => `${label}: ${value.replaceAll('_', ' ')}`);
}

export function LiveWorldLabPage() {
  const { investigationId = 'investigation_demo_checkout' } = useParams();
  const { data } = useQuery({
    queryKey: ['investigation', investigationId],
    queryFn: () => investigationApi.getInvestigation(investigationId),
    refetchInterval: 2000,
  });
  if (!data) return <div>Connecting to the lab…</div>;

  const { totalWorlds, ...classified } = data.progress;
  const counts = Object.entries(classified).map(([name, value]) => ({ name, value }));
  const completed = data.progress.passed + data.progress.failed + data.progress.flaky;
  const percentage = totalWorlds === 0 ? 0 : Math.round((completed / totalWorlds) * 100);

  return (
    <>
      <PageHeading
        eyebrow={data.status}
        title="Live WorldLab"
        description="Polling the frozen InvestigationProgress contract."
      />
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-cyan" style={{ width: `${percentage}%` }} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-bold">World activity</h2>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={counts}>
                <XAxis dataKey="name" stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="value" fill="#41d9e8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card">
          <h2 className="font-bold">Recent events</h2>
          <ol className="mt-4 space-y-4">
            {data.recentEvents.map((event) => {
              const provider = providerLabel(event);
              const timings = timingLabels(event);
              const warning = cleanupWarning(event);
              const planner = plannerLabels(event);
              return (
                <li
                  key={event.id}
                  className={`border-l-2 pl-4 ${warning ? 'border-amber-300/70' : 'border-cyan/40'}`}
                >
                  <div className="font-medium">{event.message}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
                    <span>{event.type.replaceAll('_', ' ')}</span>
                    {provider ? <span>{provider}</span> : null}
                    {timings.map((timing) => (
                      <span key={timing}>{timing}</span>
                    ))}
                    {planner.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  {warning ? (
                    <p className="mt-2 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                      {warning}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}
