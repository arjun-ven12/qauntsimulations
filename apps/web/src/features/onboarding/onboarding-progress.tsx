import { Check, Circle, CircleDot } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OnboardingProgress } from './onboarding.types.js';

export function OnboardingProgressCard({ progress }: { progress: OnboardingProgress }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 sm:p-6" data-testid="onboarding-progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Onboarding</p>
          <h2 className="mt-2 text-xl font-black">
            {progress.complete ? 'Project ready for investigation' : 'Complete project setup'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {progress.completedCount} of {progress.totalCount} readiness steps complete
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-sm font-black text-slate-200">
          {progress.percentage}%
        </span>
      </div>
      <div
        aria-label={`${progress.percentage}% of onboarding complete`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percentage}
        className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${progress.percentage}%` }} />
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {progress.steps.map((step) => (
          <li
            className={`min-w-0 rounded-xl border p-3 ${
              step.status === 'COMPLETED'
                ? 'border-emerald-900/80 bg-emerald-950/20'
                : step.status === 'CURRENT'
                  ? 'border-cyan-800 bg-cyan-950/20'
                  : 'border-slate-800 bg-slate-950/30'
            }`}
            key={step.id}
          >
            <div className="flex items-start gap-3">
              <StepIcon status={step.status} />
              <div className="min-w-0">
                <p className="font-bold text-slate-200">{step.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
                {step.status === 'CURRENT' ? (
                  <Link className="mt-2 inline-block text-sm font-bold text-cyan" to={step.href}>
                    Continue this step
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepIcon({ status }: { status: OnboardingProgress['steps'][number]['status'] }) {
  if (status === 'COMPLETED')
    return <Check aria-label="Completed" className="mt-0.5 shrink-0 text-emerald-300" size={18} />;
  if (status === 'CURRENT')
    return <CircleDot aria-label="Current" className="mt-0.5 shrink-0 text-cyan" size={18} />;
  return <Circle aria-label="Upcoming" className="mt-0.5 shrink-0 text-slate-600" size={18} />;
}
