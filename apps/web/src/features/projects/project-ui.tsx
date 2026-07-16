import { AlertTriangle, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export const primaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-cyan px-4 py-2 font-bold text-ink transition hover:bg-cyan/90 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-700 px-4 py-2 font-bold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50';

export function ProjectLoading({ label = 'Loading project…' }: { label?: string }) {
  return (
    <div aria-live="polite" className="card flex items-center gap-3 text-sm text-slate-400">
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
        <AlertTriangle aria-hidden="true" className="mt-0.5 text-amber-300" size={20} />
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
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
