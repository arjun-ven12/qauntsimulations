import { Check } from 'lucide-react';
import { secondaryButton } from '../projects/project-ui.js';
import {
  invariantTemplates,
  type InvariantTemplate,
} from './invariant-form.model.js';

export function InvariantTemplatePicker({
  selectedType,
  disabled = false,
  onSelect,
}: {
  selectedType: string;
  disabled?: boolean;
  onSelect(template: InvariantTemplate): void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="invariant-template-grid">
      {invariantTemplates.map((template) => {
        const selected = template.type === selectedType;
        return (
          <article
            className={`min-w-0 rounded-xl border p-5 ${
              selected
                ? 'border-cyan bg-cyan/5'
                : 'border-slate-700 bg-slate-950/40'
            }`}
            key={template.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-black">{template.displayName}</h3>
                <p className="mt-2 break-words text-sm text-slate-400">{template.description}</p>
              </div>
              {selected ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan/40 px-2 py-1 text-xs font-bold text-cyan">
                  <Check aria-hidden="true" size={13} /> Selected
                </span>
              ) : null}
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <TemplateDetail label="Evaluator" value={template.type} />
              <TemplateDetail label="Suggested severity" value={template.suggestedSeverity} />
            </dl>
            {!disabled ? (
              <button
                className={`${secondaryButton} mt-4 w-full sm:w-auto`}
                onClick={() => onSelect(template)}
                type="button"
              >
                Use template
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function TemplateDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all font-bold text-slate-200">{value}</dd>
    </div>
  );
}
