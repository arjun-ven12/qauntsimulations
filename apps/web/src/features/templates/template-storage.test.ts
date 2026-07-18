import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { builtInTemplate } from './template-model.js';
import {
  parseImportedTemplate,
  readStoredTemplates,
  templateStorageKey,
  writeStoredTemplates,
  type TemplateStorage,
} from './template-storage.js';

class MemoryStorage implements TemplateStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const custom = {
  id: 'custom-1',
  category: 'PROJECT' as const,
  source: 'CUSTOM' as const,
  name: 'Checkout project',
  schemaVersion: 1 as const,
  payload: { name: 'Checkout' },
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

describe('Rift custom template storage', () => {
  it('scopes records by organisation and authenticated user', () => {
    expect(templateStorageKey('org-a', 'user-a')).toBe('rift.templates.v1:org-a:user-a');
    expect(templateStorageKey('org-a', 'user-a')).not.toBe(templateStorageKey('org-b', 'user-a'));
    expect(templateStorageKey('org-a', 'user-a')).not.toBe(templateStorageKey('org-a', 'user-b'));
  });

  it('round-trips custom templates and never persists built-ins', () => {
    const storage = new MemoryStorage();
    const key = templateStorageKey('org-a', 'user-a');
    expect(
      writeStoredTemplates(storage, key, [
        builtInTemplate('PROJECT', 'built-in', 'Built in', 'Immutable', { name: '' }),
        custom,
      ]),
    ).toBe(true);
    expect(readStoredTemplates(storage, key)).toEqual([custom]);
    expect(storage.getItem(key)).not.toContain('built-in');
  });

  it('recovers safely from invalid JSON and unsupported envelope versions', () => {
    const storage = new MemoryStorage();
    storage.setItem('invalid', '{broken');
    storage.setItem('future', JSON.stringify({ schemaVersion: 2, templates: [custom] }));
    expect(readStoredTemplates(storage, 'invalid')).toEqual([]);
    expect(readStoredTemplates(storage, 'future')).toEqual([]);
  });

  it('validates imported category, schema version, and payload', () => {
    const payloadSchema = z.object({ name: z.string().min(1) });
    const valid = JSON.stringify({
      category: 'PROJECT',
      name: 'Imported project',
      schemaVersion: 1,
      payload: { name: 'Checkout' },
    });
    expect(parseImportedTemplate(valid, 'PROJECT', payloadSchema).payload).toEqual({
      name: 'Checkout',
    });
    expect(() => parseImportedTemplate(valid, 'ENVIRONMENT', payloadSchema)).toThrow(
      'Import must be a ENVIRONMENT template.',
    );
    expect(() =>
      parseImportedTemplate(
        valid.replace('"schemaVersion":1', '"schemaVersion":2'),
        'PROJECT',
        payloadSchema,
      ),
    ).toThrow();
    expect(() =>
      parseImportedTemplate(valid.replace('"Checkout"', '""'), 'PROJECT', payloadSchema),
    ).toThrow();
  });
});
