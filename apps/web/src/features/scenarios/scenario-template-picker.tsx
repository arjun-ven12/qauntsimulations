import { commerceScenarioPrompt } from './scenario-form.model.js';
import { secondaryButton } from '../projects/project-ui.js';

export function ScenarioTemplatePicker({ disabled = false, onSelect }: { disabled?: boolean; onSelect(prompt: string): void }) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-700 bg-slate-950/40 p-5">
      <h3 className="font-black">Delayed checkout and repeated interaction</h3>
      <p className="mt-2 break-words text-sm text-slate-400">{commerceScenarioPrompt}</p>
      {!disabled ? (
        <button className={`${secondaryButton} mt-4 w-full sm:w-auto`} onClick={() => onSelect(commerceScenarioPrompt)} type="button">
          Use prepared prompt
        </button>
      ) : null}
    </article>
  );
}
