import { Copy, Download, RotateCcw, Save, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { z } from 'zod';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';
import type { RiftTemplate, TemplateCategory } from './template-model.js';
import { parseImportedTemplate, parseTemplatePayload } from './template-json.js';
import { useTemplateLibrary } from './use-template-library.js';

export function TemplateManager<TPayload>({
  category,
  value,
  builtIns,
  payloadSchema,
  onApply,
  preview,
}: {
  category: TemplateCategory;
  value: TPayload;
  builtIns: RiftTemplate<TPayload>[];
  payloadSchema: z.ZodTypeAny;
  onApply(payload: TPayload, template: RiftTemplate<TPayload>): void;
  preview(payload: TPayload): ReactNode;
}) {
  const library = useTemplateLibrary<TPayload>(category);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'ALL' | 'BUILT_IN' | 'CUSTOM'>('ALL');
  const [selectedId, setSelectedId] = useState(builtIns[0]?.id ?? '');
  const [applied, setApplied] = useState<RiftTemplate<TPayload> | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const templates = useMemo(
    () => [...builtIns, ...library.templates],
    [builtIns, library.templates],
  );
  const filtered = templates.filter((template) => {
    const matchesSource = source === 'ALL' || template.source === source;
    const text = `${template.name} ${template.description ?? ''}`.toLowerCase();
    return matchesSource && text.includes(query.trim().toLowerCase());
  });
  const selected = templates.find((template) => template.id === selectedId) ?? filtered[0] ?? null;
  const customised = Boolean(applied) && signature(value) !== signature(applied?.payload);

  function showMessage(text: string, isError = false) {
    setMessage(text);
    setMessageIsError(isError);
  }

  function nameExists(nextName: string, exceptId?: string) {
    const normalised = nextName.trim().toLocaleLowerCase();
    return templates.some(
      (template) =>
        template.id !== exceptId && template.name.trim().toLocaleLowerCase() === normalised,
    );
  }

  function apply(template: RiftTemplate<TPayload>) {
    onApply(structuredClone(template.payload), template);
    setApplied(template);
    setSelectedId(template.id);
    showMessage(`${template.name} applied.`);
  }

  async function saveCurrent() {
    if (!name.trim()) {
      showMessage('Enter a name for the custom template.', true);
      return;
    }
    if (nameExists(name)) {
      showMessage('Template names must be unique.', true);
      return;
    }
    try {
      const payload = parseTemplatePayload<TPayload>(value, payloadSchema);
      const template = await library.create({ name, payload });
      setName('');
      setSelectedId(template.id);
      setApplied(template);
      showMessage('Custom template saved to Rift.');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Template could not be saved.', true);
    }
  }

  async function importTemplate(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = parseImportedTemplate<TPayload>(await file.text(), category, payloadSchema);
      if (nameExists(parsed.name)) throw new Error('Template names must be unique.');
      const template = await library.create({
        name: parsed.name,
        ...(parsed.description ? { description: parsed.description } : {}),
        payload: parsed.payload,
      });
      setSelectedId(template.id);
      showMessage('Template imported and saved to Rift.');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Template import failed.', true);
    }
  }

  function exportTemplate(template: RiftTemplate<TPayload>) {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(template.name)}.rift-template.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card min-w-0 space-y-5" aria-labelledby={`templates-${category}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Reusable configuration</p>
          <h2 className="mt-1 text-xl font-semibold" id={`templates-${category}`}>
            Templates
          </h2>
          <p className="mt-1 text-sm text-[var(--rift-text-secondary)]">
            Preview and apply built-in or account-saved configurations.
          </p>
        </div>
        {applied ? (
          <span
            className={`rift-semantic-status ${customised ? 'rift-semantic-status--pending' : 'rift-semantic-status--pass'}`}
          >
            {customised ? 'Customised' : 'Applied'}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <label className="relative block">
          <span className="sr-only">Search templates</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3.5 text-[var(--rift-text-muted)]"
            size={15}
          />
          <input
            className="w-full pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates"
            value={query}
          />
        </label>
        <select
          aria-label="Filter templates"
          onChange={(event) => setSource(event.target.value as typeof source)}
          value={source}
        >
          <option value="ALL">All templates</option>
          <option value="BUILT_IN">Built-in</option>
          <option value="CUSTOM">Custom</option>
        </select>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)]">
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1" aria-label="Available templates">
          {filtered.map((template) => (
            <button
              aria-pressed={selected?.id === template.id}
              className={`w-full rounded-lg border p-3 text-left transition ${selected?.id === template.id ? 'border-[var(--rift-border-strong)] bg-[var(--rift-surface-hover)]' : 'border-[var(--rift-border)] bg-[var(--rift-surface-raised)] hover:border-[var(--rift-border-strong)]'}`}
              key={template.id}
              onClick={() => setSelectedId(template.id)}
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <strong className="text-sm">{template.name}</strong>
                <span className="text-[10px] uppercase tracking-wide text-[var(--rift-text-muted)]">
                  {template.source === 'BUILT_IN' ? 'Built-in' : 'Custom'}
                </span>
              </span>
              {template.description ? (
                <span className="mt-1 block line-clamp-2 text-xs text-[var(--rift-text-secondary)]">
                  {template.description}
                </span>
              ) : null}
              {template.source === 'CUSTOM' ? (
                <span className="mt-2 block text-[10px] text-[var(--rift-text-muted)]">
                  Saved to Rift
                </span>
              ) : null}
            </button>
          ))}
          {!filtered.length ? (
            <p className="rounded-lg border border-dashed border-[var(--rift-border)] p-4 text-sm text-[var(--rift-text-muted)]">
              No templates match this search.
            </p>
          ) : null}
          {library.loading ? (
            <p className="text-sm text-[var(--rift-text-muted)]">Loading saved templates…</p>
          ) : null}
        </div>

        {selected ? (
          <div className="min-w-0 rounded-lg border border-[var(--rift-border)] bg-[var(--rift-surface-raised)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">{selected.name}</h3>
                <p className="mt-1 text-xs text-[var(--rift-text-secondary)]">
                  {selected.description || 'No description provided.'}
                </p>
              </div>
              <button className={primaryButton} onClick={() => apply(selected)} type="button">
                Apply template
              </button>
            </div>
            <div className="mt-4 border-t border-[var(--rift-border)] pt-4">
              {preview(selected.payload)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--rift-border)] pt-4">
              <button
                className={secondaryButton}
                onClick={() => exportTemplate(selected)}
                type="button"
              >
                <Download aria-hidden="true" className="mr-2" size={15} /> Export JSON
              </button>
              {selected.source === 'CUSTOM' ? (
                <>
                  <button
                    className={secondaryButton}
                    disabled={library.mutating}
                    onClick={async () => {
                      const next = window.prompt('Rename template', selected.name)?.trim();
                      if (!next) return;
                      if (nameExists(next, selected.id)) {
                        showMessage('Template names must be unique.', true);
                        return;
                      }
                      try {
                        await library.update(selected.id, { name: next });
                        showMessage('Template renamed.');
                      } catch (error) {
                        showMessage(
                          error instanceof Error ? error.message : 'Template rename failed.',
                          true,
                        );
                      }
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    className={secondaryButton}
                    disabled={library.mutating}
                    onClick={async () => {
                      try {
                        const copy = await library.create({
                          name: availableCopyName(selected.name, templates),
                          ...(selected.description ? { description: selected.description } : {}),
                          payload: selected.payload,
                        });
                        setSelectedId(copy.id);
                        showMessage('Template duplicated.');
                      } catch (error) {
                        showMessage(
                          error instanceof Error ? error.message : 'Template duplication failed.',
                          true,
                        );
                      }
                    }}
                    type="button"
                  >
                    <Copy aria-hidden="true" className="mr-2" size={15} /> Duplicate
                  </button>
                  <button
                    className={secondaryButton}
                    disabled={library.mutating}
                    onClick={async () => {
                      if (window.confirm(`Delete “${selected.name}”?`)) {
                        try {
                          await library.remove(selected.id);
                          setSelectedId(builtIns[0]?.id ?? '');
                          if (applied?.id === selected.id) setApplied(null);
                          showMessage('Template deleted.');
                        } catch (error) {
                          showMessage(
                            error instanceof Error ? error.message : 'Template deletion failed.',
                            true,
                          );
                        }
                      }
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="mr-2" size={15} /> Delete
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-[var(--rift-border)] pt-5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          aria-label="Custom template name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Custom template name"
          value={name}
        />
        <button
          className={secondaryButton}
          disabled={library.mutating}
          onClick={() => void saveCurrent()}
          type="button"
        >
          <Save aria-hidden="true" className="mr-2" size={15} /> Save current
        </button>
        <button
          className={secondaryButton}
          onClick={() => importInput.current?.click()}
          type="button"
        >
          <Upload aria-hidden="true" className="mr-2" size={15} /> Import JSON
        </button>
        <input
          accept="application/json,.json"
          aria-label="Import template JSON file"
          className="sr-only"
          onChange={(event) => void importTemplate(event)}
          ref={importInput}
          type="file"
        />
      </div>
      {applied && customised ? (
        <button className={secondaryButton} onClick={() => apply(applied)} type="button">
          <RotateCcw aria-hidden="true" className="mr-2" size={15} /> Reset to applied template
        </button>
      ) : null}
      {message ? (
        <p
          className={`text-sm ${messageIsError ? 'text-[var(--status-fail)]' : 'text-[var(--rift-text-secondary)]'}`}
          role={messageIsError ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
      {library.error && !message ? (
        <p className="text-sm text-[var(--status-fail)]" role="alert">
          {library.error instanceof Error
            ? library.error.message
            : 'Saved templates could not be loaded.'}
        </p>
      ) : null}
    </section>
  );
}

function signature(value: unknown) {
  return JSON.stringify(value);
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'rift-template'
  );
}

function availableCopyName<TPayload>(original: string, templates: RiftTemplate<TPayload>[]) {
  const names = new Set(templates.map((template) => template.name.trim().toLocaleLowerCase()));
  let candidate = `${original} copy`;
  let suffix = 2;
  while (names.has(candidate.toLocaleLowerCase())) candidate = `${original} copy ${suffix++}`;
  return candidate;
}
