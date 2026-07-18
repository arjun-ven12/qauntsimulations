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
            : 'Rift could not load the Product Dashboard.'
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
          className="rift-surface mx-auto mb-6 flex max-w-[1240px] items-start gap-3 rounded-xl p-4 text-sm text-[var(--rift-text-secondary)]"
          role="status"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--rift-warning)]" size={18} />
          <div>
            <p className="font-semibold text-[var(--rift-text)]">Some configuration readiness is unavailable</p>
            <p className="mt-1 text-[var(--rift-text-secondary)]">{result.configurationWarnings.join(' ')}</p>
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
      className="mx-auto max-w-[1240px] space-y-4"
      data-testid="dashboard-loading"
    >
      <p className="eyebrow">Dashboard</p>
      <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--rift-text)]">Loading dashboard…</h1>
      <div className="h-40 animate-pulse rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]" />
        <div className="h-64 animate-pulse rounded-xl border border-[var(--rift-border)] bg-[var(--rift-surface)]" />
      </div>
    </section>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <section
      className="rift-surface mx-auto max-w-2xl rounded-xl p-8 text-center"
      role="alert"
    >
      <AlertTriangle aria-hidden="true" className="mx-auto text-[var(--rift-fail)]" size={28} />
      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-[var(--rift-text)]">Dashboard unavailable</h1>
      <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">{message}</p>
      <button
        className="rift-button-primary mt-6 gap-2"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={16} /> Retry
      </button>
    </section>
  );
}
