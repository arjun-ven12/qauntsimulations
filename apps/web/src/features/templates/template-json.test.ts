import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  exportTemplateJson,
  parseImportedTemplate,
  parseTemplatePayload,
} from './template-json.js';

describe('Template JSON validation', () => {
  it('validates category, version, strict fields, and payload', () => {
    const payloadSchema = z.object({ name: z.string().min(1) }).strict();
    const valid = JSON.stringify({
      version: 1,
      category: 'PROJECT',
      name: 'Imported project',
      payload: { name: 'Checkout' },
    });
    expect(parseImportedTemplate(valid, 'PROJECT', payloadSchema).payload).toEqual({
      name: 'Checkout',
    });
    expect(() => parseImportedTemplate(valid, 'ENVIRONMENT', payloadSchema)).toThrow(
      'Import must be a ENVIRONMENT template.',
    );
    expect(() =>
      parseImportedTemplate(valid.replace('"version":1', '"version":2'), 'PROJECT', payloadSchema),
    ).toThrow();
    expect(() =>
      parseImportedTemplate(
        JSON.stringify({ ...JSON.parse(valid), id: 'database-id' }),
        'PROJECT',
        payloadSchema,
      ),
    ).toThrow(/Unrecognized key/);
    expect(() =>
      parseImportedTemplate(
        JSON.stringify({ ...JSON.parse(valid), payload: { name: 'Checkout', secret: 'x' } }),
        'PROJECT',
        payloadSchema,
      ),
    ).toThrow(/Unrecognized key/);
  });

  it('exports a portable document that round-trips without internal metadata', () => {
    const payloadSchema = z.object({ name: z.string() }).strict();
    const raw = exportTemplateJson({
      id: 'database-id',
      category: 'PROJECT',
      source: 'CUSTOM',
      name: 'Portable project',
      schemaVersion: 1,
      payload: { name: 'Checkout' },
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
    expect(raw).not.toMatch(/database-id|createdAt|updatedAt|source|schemaVersion/);
    expect(parseImportedTemplate(raw, 'PROJECT', payloadSchema)).toMatchObject({
      name: 'Portable project',
      payload: { name: 'Checkout' },
    });
  });

  it('rejects oversized imports', () => {
    expect(() => parseImportedTemplate(' '.repeat(64 * 1024 + 1), 'PROJECT', z.unknown())).toThrow(
      '64 KB or smaller',
    );
  });

  it('rejects sensitive fill values before upload', () => {
    const schema = z.object({ action: z.string(), selector: z.string(), value: z.string() });
    expect(() =>
      parseTemplatePayload(
        { action: 'FILL', selector: 'input[type=password]', value: 'not-safe' },
        schema,
      ),
    ).toThrow('cannot be saved');
  });
});
