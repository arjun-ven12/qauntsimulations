import type { z } from 'zod';
import {
  importedTemplateSchema,
  type RiftTemplate,
  type TemplateCategory,
} from './template-model.js';

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
