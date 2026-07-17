import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ScenarioApiError, type ScenarioPreflightResult } from './scenario-api.js';

export function ScenarioPreflightResults({
  result,
  error,
}: {
  result: ScenarioPreflightResult | null;
  error: Error | null;
}) {
  if (error) {
    const apiError = error instanceof ScenarioApiError ? error : null;
    return (
      <section className="card min-w-0 border-red-900" role="alert">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-red-300" size={20} />
          <div className="min-w-0">
            <h2 className="font-black text-red-300">Preflight blocked</h2>
            <p className="mt-2 break-all font-mono text-xs font-bold text-red-200">
              {apiError?.code ?? 'PREFLIGHT_FAILED'}
            </p>
            <p className="mt-2 break-words text-sm text-slate-300">{error.message}</p>
          </div>
        </div>
      </section>
    );
  }
  if (!result) return null;
  return (
    <section className="card min-w-0" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <CheckCircle2 aria-hidden="true" className="text-emerald-300" size={20} />
        <h2 className="text-xl font-black">Preflight {result.status}</h2>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="font-bold">Passed checks</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li className="break-all">Project scope: {result.projectId}</li>
            <li className="break-all">Environment: {result.environmentId}</li>
            <li className="break-all">Journey: {result.journeyId}</li>
            <li className="break-all">Invariants: {result.invariantIds.join(', ')}</li>
            <li>Configuration compatibility: {result.validation.status}</li>
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="font-bold">Warnings</h3>
          {result.validation.warnings.length ? (
            <div className="mt-3 space-y-3">
              {result.validation.warnings.map((warning) => (
                <article className="min-w-0 rounded-lg border border-amber-800 bg-amber-950/30 p-3" key={`${warning.code}-${warning.field}`}>
                  <p className="break-all font-mono text-xs font-bold text-amber-300">{warning.code}</p>
                  <p className="mt-1 break-words text-sm text-slate-300">{warning.message}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">Field: {warning.field}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No warnings returned.</p>
          )}
        </div>
      </div>
    </section>
  );
}
