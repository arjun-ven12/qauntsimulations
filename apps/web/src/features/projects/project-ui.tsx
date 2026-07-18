import { AlertTriangle, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export const primaryButton =
  'rift-button-primary';
export const secondaryButton =
  'rift-button-secondary';

export function ProjectLoading({ label = 'Loading project…' }: { label?: string }) {
  return (
    <div aria-live="polite" className="card flex items-center gap-3 text-sm text-[var(--rift-text-secondary)]">
      <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
      {label}
    </div>
  );
}

export function ProjectMessage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 text-[var(--rift-warning)]" size={20} />
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--rift-text-secondary)]">{description}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-200">{label}</span>
      {description ? (
        <span className="mt-1 block text-xs text-slate-500">{description}</span>
      ) : null}
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span className="mt-1 block text-sm text-red-300" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
