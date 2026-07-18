import type { z } from 'zod';
import {
  importedTemplateSchema,
  templateEnvelopeSchema,
  type RiftTemplate,
  type TemplateCategory,
} from './template-model.js';
import { templatePayloadSchemas } from './template-schemas.js';

export interface TemplateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function templateStorageKey(organisationId: string, userId: string) {
  return `rift.templates.v1:${organisationId}:${userId}`;
}

export function readStoredTemplates(storage: TemplateStorage | null, key: string) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = templateEnvelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    const names = new Set<string>();
    const templates = parsed.data.templates.flatMap((template) => {
      try {
        const normalisedName = `${template.category}:${template.name.trim().toLocaleLowerCase()}`;
        if (names.has(normalisedName)) return [];
        const payload = parseTemplatePayload(
          template.payload,
          templatePayloadSchemas[template.category],
        );
        names.add(normalisedName);
        return [{ ...template, payload } as RiftTemplate<unknown>];
      } catch {
        return [];
      }
    });
    const normalised = JSON.stringify({ schemaVersion: 1, templates });
    if (normalised !== raw) {
      try {
        storage.setItem(key, normalised);
      } catch {
        // The sanitised in-memory view remains usable when browser storage is read-only.
      }
    }
    return templates;
  } catch {
    return [];
  }
}

export function writeStoredTemplates(
  storage: TemplateStorage | null,
  key: string,
  templates: RiftTemplate<unknown>[],
) {
  if (!storage) return false;
  try {
    storage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        templates: templates.filter((template) => template.source === 'CUSTOM'),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function parseImportedTemplate<TPayload>(
  raw: string,
  category: TemplateCategory,
  payloadSchema: z.ZodTypeAny,
): Omit<RiftTemplate<TPayload>, 'id' | 'source' | 'createdAt' | 'updatedAt'> {
  const template = importedTemplateSchema.parse(JSON.parse(raw));
  if (template.category !== category) throw new Error(`Import must be a ${category} template.`);
  return {
    category,
    name: template.name,
    ...(template.description ? { description: template.description } : {}),
    schemaVersion: 1,
    payload: parseTemplatePayload(template.payload, payloadSchema),
  };
}

export function parseTemplatePayload<TPayload>(
  payload: unknown,
  payloadSchema: z.ZodTypeAny,
): TPayload {
  const parsed = payloadSchema.parse(payload) as TPayload;
  if (containsSensitiveValue(parsed)) {
    throw new Error('Passwords, tokens, cookies, credentials, and secrets cannot be saved.');
  }
  return parsed;
}

function containsSensitiveValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSensitiveValue);
  const record = value as Record<string, unknown>;
  if (
    record.action === 'FILL' &&
    typeof record.value === 'string' &&
    record.value.length > 0 &&
    sensitiveText(`${String(record.selector ?? '')} ${String(record.name ?? '')}`)
  ) {
    return true;
  }
  return Object.entries(record).some(
    ([key, entry]) =>
      (sensitiveText(key) && entry !== null && entry !== '' && entry !== false) ||
      containsSensitiveValue(entry),
  );
}

function sensitiveText(value: string) {
  return /(?:password|passwd|token|cookie|credential|secret|api[-_]?key)/i.test(value);
}

export function newTemplateId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `template-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
