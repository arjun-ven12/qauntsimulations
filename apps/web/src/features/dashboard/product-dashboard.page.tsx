import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store.js';
import {
  dashboardQueryKey,
  loadDashboardData,
  type DashboardDataResult,
} from './dashboard.data.js';
import { ProductDashboard } from './product-dashboard.js';

export function ProductDashboardPage() {
  const organisation = useAuthStore((state) => state.organisation);
  const canCreateProject = useAuthStore((state) => state.permissions.includes('CREATE_PROJECTS'));
  const query = useQuery({
    queryKey: dashboardQueryKey(organisation?.id ?? 'loading'),
    queryFn: () => {
      if (!organisation) throw new Error('The active organisation is unavailable.');
      return loadDashboardData(organisation);
    },
    enabled: Boolean(organisation),
  });

  if (!organisation || query.isPending) return <DashboardLoading />;
  if (query.isError || !query.data) {
    return (
      <DashboardError
        message={
          query.error instanceof Error
            ? query.error.message
            : 'TaskOS could not load the Product Dashboard.'
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  return <DashboardResult canCreateProject={canCreateProject} result={query.data} />;
}

export function DashboardResult({
  canCreateProject,
  result,
}: {
  canCreateProject: boolean;
  result: DashboardDataResult;
}) {
  return (
    <>
      {result.configurationWarnings.length ? (
        <div
          className="mx-auto mb-6 flex max-w-[1200px] items-start gap-3 rounded-xl border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200"
          role="status"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-bold">Some configuration readiness is unavailable</p>
            <p className="mt-1 text-amber-300/80">{result.configurationWarnings.join(' ')}</p>
          </div>
        </div>
      ) : null}
      <ProductDashboard
        activityAvailability={{
          findings: result.findingsAvailable ? 'available' : 'unavailable',
          investigations: result.investigationsAvailable ? 'available' : 'unavailable',
        }}
        canCreateProject={canCreateProject}
        data={result.data}
      />
    </>
  );
}

function DashboardLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-[1200px] space-y-4"
      data-testid="dashboard-loading"
    >
      <p className="eyebrow">Product workspace</p>
      <h1 className="text-3xl font-black">Loading Dashboard…</h1>
      <div className="h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40" />
        <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40" />
      </div>
    </section>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <section
      className="mx-auto max-w-2xl rounded-2xl border border-red-900 bg-red-950/20 p-8 text-center"
      role="alert"
    >
      <AlertTriangle aria-hidden="true" className="mx-auto text-red-300" size={28} />
      <h1 className="mt-4 text-2xl font-black">Dashboard unavailable</h1>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
      <button
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-cyan px-4 py-2 font-bold text-ink"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={16} /> Retry
      </button>
    </section>
  );
}
