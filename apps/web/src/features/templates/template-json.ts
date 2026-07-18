import type { z } from 'zod';
import {
  importedTemplateSchema,
  type RiftTemplate,
  type TemplateCategory,
} from './template-model.js';

export const maximumTemplateJsonBytes = 64 * 1024;

export function parseImportedTemplate<TPayload>(
  raw: string,
  category: TemplateCategory,
  payloadSchema: z.ZodTypeAny,
): Omit<RiftTemplate<TPayload>, 'id' | 'source' | 'createdAt' | 'updatedAt'> {
  if (new TextEncoder().encode(raw).byteLength > maximumTemplateJsonBytes) {
    throw new Error('Template JSON must be 64 KB or smaller.');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Choose a valid JSON template file.');
  }
  const template = importedTemplateSchema.parse(json);
  if (template.category !== category) throw new Error(`Import must be a ${category} template.`);
  return {
    category,
    name: template.name,
    ...(template.description ? { description: template.description } : {}),
    schemaVersion: 1,
    payload: parseTemplatePayload(template.payload, payloadSchema),
  };
}

export function exportTemplateJson<TPayload>(template: RiftTemplate<TPayload>) {
  return JSON.stringify(
    {
      version: 1,
      category: template.category,
      name: template.name,
      ...(template.description ? { description: template.description } : {}),
      payload: template.payload,
    },
    null,
    2,
  );
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
