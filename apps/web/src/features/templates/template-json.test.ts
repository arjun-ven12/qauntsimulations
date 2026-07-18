import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseImportedTemplate, parseTemplatePayload } from './template-json.js';

describe('Template JSON validation', () => {
  it('validates category, schema version, and payload', () => {
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
