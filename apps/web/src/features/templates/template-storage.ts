import type { z } from 'zod';
import {
  importedTemplateSchema,
  templateEnvelopeSchema,
  type RiftTemplate,
  type TemplateCategory,
} from './template-model.js';

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
    return parsed.success ? (parsed.data.templates as RiftTemplate<unknown>[]) : [];
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
    payload: payloadSchema.parse(template.payload) as TPayload,
  };
}

export function newTemplateId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `template-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
