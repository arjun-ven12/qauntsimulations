import { Copy, Download, RotateCcw, Save, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { z } from 'zod';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';
import type { RiftTemplate, TemplateCategory } from './template-model.js';
import {
  exportTemplateJson,
  parseImportedTemplate,
  parseTemplatePayload,
} from './template-json.js';
import { useTemplateLibrary } from './use-template-library.js';

type Imported<TPayload> = Omit<RiftTemplate<TPayload>, 'id' | 'source' | 'createdAt' | 'updatedAt'>;

type DialogState<TPayload> =
  | { kind: 'RENAME'; template: RiftTemplate<TPayload>; name: string }
  | { kind: 'DELETE'; template: RiftTemplate<TPayload> }
  | { kind: 'UPDATE'; template: RiftTemplate<TPayload>; payload: TPayload }
  | { kind: 'IMPORT'; imported: Imported<TPayload>; name: string }
  | null;

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
  const [dialog, setDialog] = useState<DialogState<TPayload>>(null);
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
  const selected = filtered.find((template) => template.id === selectedId) ?? filtered[0] ?? null;
  const currentPayload = payloadSchema.safeParse(value);
  const saveReason = library.mutating
    ? 'A template request is already in progress.'
    : !name.trim()
      ? 'Enter a template name.'
      : name.trim().length > 120
        ? 'Use 120 characters or fewer.'
        : !currentPayload.success
          ? 'Complete the supported configuration before saving it.'
          : '';
  const customised =
    Boolean(applied) && normalisedSignature(value) !== normalisedSignature(applied?.payload);

  function showMessage(text: string, isError = false) {
    setMessage(text);
    setMessageIsError(isError);
  }

  function nameExists(nextName: string, exceptId?: string) {
    const normalised = normaliseName(nextName);
    return templates.some(
      (template) => template.id !== exceptId && normaliseName(template.name) === normalised,
    );
  }

  function apply(template: RiftTemplate<TPayload>) {
    const snapshot = { ...template, payload: structuredClone(template.payload) };
    onApply(structuredClone(snapshot.payload), snapshot);
    setApplied(snapshot);
    setSelectedId(template.id);
    showMessage(`${template.name} applied.`);
  }

  async function saveCurrent() {
    if (saveReason || !currentPayload.success) return;
    if (nameExists(name)) {
      showMessage('A template with this name already exists in this category.', true);
      return;
    }
    try {
      const payload = parseTemplatePayload<TPayload>(currentPayload.data, payloadSchema);
      const description = descriptionFromPayload(payload);
      const template = await library.create({
        name: name.trim(),
        ...(description ? { description } : {}),
        payload,
      });
      setName('');
      setSelectedId(template.id);
      setApplied({ ...template, payload: structuredClone(template.payload) });
      showMessage('Custom template saved to Rift.');
    } catch (error) {
      showMessage(templateError(error, 'Template could not be saved.'), true);
    }
  }

  async function chooseImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = parseImportedTemplate<TPayload>(await file.text(), category, payloadSchema);
      showMessage('');
      setDialog({ kind: 'IMPORT', imported: parsed, name: parsed.name });
    } catch (error) {
      showMessage(templateError(error, 'Template import failed.'), true);
    }
  }

  async function confirmDialog() {
    if (!dialog || library.mutating) return;
    try {
      if (dialog.kind === 'RENAME') {
        const next = dialog.name.trim();
        if (!next || next.length > 120) throw new Error('Enter a name of 120 characters or fewer.');
        if (nameExists(next, dialog.template.id)) throw duplicateNameError();
        const updated = await library.update(dialog.template.id, { name: next });
        if (applied?.id === updated.id) setApplied({ ...applied, name: updated.name });
        setQuery('');
        setSelectedId(updated.id);
        showMessage('Template renamed.');
      } else if (dialog.kind === 'DELETE') {
        await library.remove(dialog.template.id);
        setSelectedId(builtIns[0]?.id ?? '');
        if (applied?.id === dialog.template.id) setApplied(null);
        showMessage('Template deleted. Current form values were kept.');
      } else if (dialog.kind === 'UPDATE') {
        const description = descriptionFromPayload(dialog.payload);
        const updated = await library.update(dialog.template.id, {
          payload: dialog.payload,
          ...(description ? { description } : {}),
        });
        setApplied({ ...updated, payload: structuredClone(updated.payload) });
        setSelectedId(updated.id);
        showMessage('Template updated from the current configuration.');
      } else {
        const next = dialog.name.trim();
        if (!next || next.length > 120) throw new Error('Enter a name of 120 characters or fewer.');
        if (nameExists(next)) throw duplicateNameError();
        const created = await library.create({
          name: next,
          ...(dialog.imported.description ? { description: dialog.imported.description } : {}),
          payload: dialog.imported.payload,
        });
        setSelectedId(created.id);
        showMessage('Template imported and saved to Rift.');
      }
      setDialog(null);
    } catch (error) {
      showMessage(templateError(error, 'Template action failed.'), true);
    }
  }

  async function duplicate(template: RiftTemplate<TPayload>) {
    try {
      const copy = await library.create({
        name: availableCopyName(template.name, templates),
        ...(template.description ? { description: template.description } : {}),
        payload: parseTemplatePayload<TPayload>(template.payload, payloadSchema),
      });
      setSelectedId(copy.id);
      showMessage('Template duplicated as a custom template.');
    } catch (error) {
      showMessage(templateError(error, 'Template duplication failed.'), true);
    }
  }

  function updateFromCurrent(template: RiftTemplate<TPayload>) {
    try {
      const payload = parseTemplatePayload<TPayload>(value, payloadSchema);
      if (normalisedSignature(payload) === normalisedSignature(template.payload)) {
        showMessage('The current configuration already matches this template.');
        return;
      }
      showMessage('');
      setDialog({ kind: 'UPDATE', template, payload });
    } catch (error) {
      showMessage(templateError(error, 'Current configuration cannot update this template.'), true);
    }
  }

  function exportTemplate(template: RiftTemplate<TPayload>) {
    const blob = new Blob([exportTemplateJson(template)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(template.name)}.rift-template.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showMessage('Template exported.');
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
            Preview and apply built-in configurations or private templates saved to your workspace
            account.
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
              key={`${template.source}:${template.id}`}
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
          {!filtered.length && !library.loading ? (
            <p className="rounded-lg border border-dashed border-[var(--rift-border)] p-4 text-sm text-[var(--rift-text-muted)]">
              {source === 'CUSTOM'
                ? 'No custom templates saved in this category.'
                : 'No templates match this search.'}
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
              <button
                className={secondaryButton}
                disabled={library.mutating}
                onClick={() => void duplicate(selected)}
                type="button"
              >
                <Copy aria-hidden="true" className="mr-2" size={15} /> Duplicate
              </button>
              {selected.source === 'CUSTOM' ? (
                <>
                  <button
                    className={secondaryButton}
                    disabled={library.mutating}
                    onClick={() => {
                      showMessage('');
                      setDialog({ kind: 'RENAME', template: selected, name: selected.name });
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    className={secondaryButton}
                    disabled={library.mutating}
                    onClick={() => updateFromCurrent(selected)}
                    type="button"
                  >
                    Update from current
                  </button>
                  <button
                    className={secondaryButton}
                    disabled={library.mutating}
                    onClick={() => {
                      showMessage('');
                      setDialog({ kind: 'DELETE', template: selected });
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
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="Custom template name"
          value={name}
        />
        <button
          className={secondaryButton}
          disabled={Boolean(saveReason)}
          onClick={() => void saveCurrent()}
          title={saveReason || undefined}
          type="button"
        >
          <Save aria-hidden="true" className="mr-2" size={15} />{' '}
          {library.mutating ? 'Saving…' : 'Save current'}
        </button>
        <button
          className={secondaryButton}
          disabled={library.mutating}
          onClick={() => importInput.current?.click()}
          type="button"
        >
          <Upload aria-hidden="true" className="mr-2" size={15} /> Import JSON
        </button>
        <input
          accept="application/json,.json"
          aria-label="Import template JSON file"
          className="sr-only"
          onChange={(event) => void chooseImport(event)}
          ref={importInput}
          type="file"
        />
      </div>
      {saveReason && !library.mutating ? (
        <p className="text-xs text-[var(--rift-text-muted)]">Save current: {saveReason}</p>
      ) : null}
      {applied && customised ? (
        <button className={secondaryButton} onClick={() => apply(applied)} type="button">
          <RotateCcw aria-hidden="true" className="mr-2" size={15} /> Reset to applied template
        </button>
      ) : null}
      {message && !dialog ? (
        <p
          className={`text-sm ${messageIsError ? 'text-[var(--status-fail)]' : 'text-[var(--rift-text-secondary)]'}`}
          role={messageIsError ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
      {library.error ? (
        <p className="text-sm text-[var(--status-fail)]" role="alert">
          {templateError(
            library.error,
            'Saved templates could not be loaded. Built-in templates remain available.',
          )}
        </p>
      ) : null}
      {dialog ? (
        <TemplateDialog
          dialog={dialog}
          error={messageIsError ? message : undefined}
          mutating={library.mutating}
          onCancel={() => setDialog(null)}
          onChangeName={(next) =>
            setDialog((current) =>
              current?.kind === 'RENAME'
                ? { ...current, name: next }
                : current?.kind === 'IMPORT'
                  ? { ...current, name: next }
                  : current,
            )
          }
          onConfirm={() => void confirmDialog()}
          preview={preview}
        />
      ) : null}
    </section>
  );
}

function TemplateDialog<TPayload>({
  dialog,
  error,
  mutating,
  onCancel,
  onChangeName,
  onConfirm,
  preview,
}: {
  dialog: Exclude<DialogState<TPayload>, null>;
  error?: string | undefined;
  mutating: boolean;
  onCancel(): void;
  onChangeName(value: string): void;
  onConfirm(): void;
  preview(payload: TPayload): ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input, button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel.current();
      if (event.key !== 'Tab' || !panel.current) return;
      const controls = [
        ...panel.current.querySelectorAll<HTMLElement>('input, button:not(:disabled)'),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previous?.focus();
    };
  }, []);
  const name = dialog.kind === 'IMPORT' || dialog.kind === 'RENAME' ? dialog.name : undefined;
  const title =
    dialog.kind === 'RENAME'
      ? 'Rename template'
      : dialog.kind === 'DELETE'
        ? 'Delete template'
        : dialog.kind === 'UPDATE'
          ? 'Update template from current configuration'
          : 'Preview imported template';
  const payload =
    dialog.kind === 'IMPORT'
      ? dialog.imported.payload
      : dialog.kind === 'UPDATE'
        ? dialog.payload
        : null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        aria-labelledby="template-dialog-title"
        aria-modal="true"
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto"
        ref={panel}
        role="dialog"
      >
        <h3 className="text-lg font-semibold" id="template-dialog-title">
          {title}
        </h3>
        {dialog.kind === 'DELETE' ? (
          <p className="mt-3 text-sm">
            Delete “{dialog.template.name}”? The current form values will not change.
          </p>
        ) : null}
        {dialog.kind === 'UPDATE' ? (
          <p className="mt-3 text-sm">
            Replace the saved payload for “{dialog.template.name}” with the current reusable
            configuration?
          </p>
        ) : null}
        {name !== undefined ? (
          <label className="mt-4 block text-sm">
            <span className="mb-2 block">Template name</span>
            <input
              autoFocus
              className="w-full"
              maxLength={120}
              onChange={(event) => onChangeName(event.target.value)}
              value={name}
            />
          </label>
        ) : null}
        {payload ? (
          <div className="mt-4 rounded-lg border border-[var(--rift-border)] p-4">
            {preview(payload)}
          </div>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-[var(--status-fail)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className={secondaryButton} disabled={mutating} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={dialog.kind === 'DELETE' ? secondaryButton : primaryButton}
            disabled={mutating || (name !== undefined && !name.trim())}
            onClick={onConfirm}
            type="button"
          >
            {mutating
              ? 'Working…'
              : dialog.kind === 'DELETE'
                ? 'Delete template'
                : dialog.kind === 'IMPORT'
                  ? 'Import template'
                  : dialog.kind === 'UPDATE'
                    ? 'Update template'
                    : 'Save name'}
          </button>
        </div>
      </div>
    </div>
  );
}

function normalisedSignature(value: unknown) {
  return JSON.stringify(normaliseReusable(value));
}
function normaliseReusable(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/method/i.test(key)) return trimmed.toUpperCase();
    if (/(?:host|domain)/i.test(key)) return trimmed.toLowerCase();
    return trimmed;
  }
  if (Array.isArray(value)) {
    const next = value.map((entry) => normaliseReusable(entry, key));
    return next.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))
      ? [...next].sort((left, right) => String(left).localeCompare(String(right)))
      : next;
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entryKey, entry]) => [entryKey, normaliseReusable(entry, entryKey)]),
    );
  return value;
}
function normaliseName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
function duplicateNameError() {
  return new Error('A template with this name already exists in this category.');
}
function templateError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
function descriptionFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('description' in payload)) return undefined;
  const description = (payload as { description?: unknown }).description;
  return typeof description === 'string' && description.trim()
    ? description.trim().slice(0, 500)
    : undefined;
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
  const names = new Set(templates.map((template) => normaliseName(template.name)));
  let candidate = `${original} copy`;
  let suffix = 2;
  while (names.has(normaliseName(candidate))) candidate = `${original} copy ${suffix++}`;
  return candidate;
}
