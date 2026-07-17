import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationError } from '../../../core/errors/application-error.js';
import {
  EvidenceContentService,
  type EvidenceTextContentRecord,
} from '../evidence-content.service.js';

const createdAt = new Date('2026-07-17T00:00:00.000Z');

function artifact(overrides: Partial<EvidenceTextContentRecord> = {}): EvidenceTextContentRecord {
  return {
    id: 'evidence_report',
    experimentId: 'experiment',
    type: 'FINAL_REPORT',
    storageKey: 'reports/investigation/finding/final-report.md',
    mimeType: 'text/markdown',
    sizeBytes: 12n,
    checksum: 'sha256:test',
    redacted: true,
    createdAt,
    metadata: { filename: 'final-report.md', path: '/redacted/final-report.md' },
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string, statusCode: number) {
  await expect(promise).rejects.toMatchObject({ code, statusCode });
}

describe('EvidenceContentService', () => {
  let root: string;
  let outside: string;
  let service: EvidenceContentService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'taskos-evidence-root-'));
    outside = await mkdtemp(join(tmpdir(), 'taskos-evidence-outside-'));
    await mkdir(join(root, 'reports/investigation/finding'), { recursive: true });
    service = new EvidenceContentService(root, 128);
  });

  afterEach(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  it('returns Markdown final report content without exposing filesystem paths', async () => {
    await writeFile(join(root, 'reports/investigation/finding/final-report.md'), '# Final report');
    const response = await service.readFinalReport('investigation', artifact());

    expect(response).toMatchObject({
      evidenceId: 'evidence_report',
      investigationId: 'investigation',
      type: 'FINAL_REPORT',
      format: 'MARKDOWN',
      filename: 'final-report.md',
      contentType: 'text/markdown',
      checksum: 'sha256:test',
      content: '# Final report',
    });
    expect(JSON.stringify(response)).not.toContain(root);
  });

  it('returns valid JSON final report content and rejects malformed JSON', async () => {
    const storageKey = 'reports/investigation/finding/final-report.json';
    await writeFile(join(root, storageKey), '{"version":1}');
    await expect(service.readFinalReport('investigation', artifact({ storageKey, mimeType: 'application/json', metadata: { filename: 'final-report.json' } }))).resolves.toMatchObject({ format: 'JSON' });

    await writeFile(join(root, storageKey), '{bad');
    await expectCode(
      service.readFinalReport('investigation', artifact({ storageKey, mimeType: 'application/json' })),
      'EVIDENCE_CONTENT_MALFORMED_JSON',
      422,
    );
  });

  it('rejects unsupported evidence types and content types', async () => {
    await writeFile(join(root, 'reports/investigation/finding/final-report.md'), '# Final report');
    await expectCode(service.readFinalReport('investigation', artifact({ type: 'TRACE' })), 'EVIDENCE_CONTENT_UNSUPPORTED', 400);
    await expectCode(service.readFinalReport('investigation', artifact({ mimeType: 'application/zip' })), 'EVIDENCE_CONTENT_UNSUPPORTED', 400);
  });

  it('rejects missing, oversized, traversal, absolute, null-byte, directory, and symlink-escape paths safely', async () => {
    await expectCode(service.readFinalReport('investigation', artifact({ storageKey: 'reports/investigation/finding/missing.md' })), 'EVIDENCE_CONTENT_MISSING', 409);

    await writeFile(join(root, 'reports/investigation/finding/final-report.md'), 'x'.repeat(129));
    await expectCode(service.readFinalReport('investigation', artifact({ sizeBytes: 129n })), 'EVIDENCE_CONTENT_TOO_LARGE', 413);
    await expectCode(service.readFinalReport('investigation', artifact({ sizeBytes: 1n })), 'EVIDENCE_CONTENT_TOO_LARGE', 413);

    await expectCode(service.readFinalReport('investigation', artifact({ storageKey: '../outside.md' })), 'EVIDENCE_STORAGE_KEY_INVALID', 400);
    await expectCode(service.readFinalReport('investigation', artifact({ storageKey: join(root, 'reports/investigation/finding/final-report.md') })), 'EVIDENCE_STORAGE_KEY_INVALID', 400);
    await expectCode(service.readFinalReport('investigation', artifact({ storageKey: 'reports/investigation/finding/final-report.md\0x' })), 'EVIDENCE_STORAGE_KEY_INVALID', 400);
    await expectCode(service.readFinalReport('investigation', artifact({ storageKey: 'reports/investigation/finding' })), 'EVIDENCE_CONTENT_INCONSISTENT', 409);

    await writeFile(join(outside, 'escape.md'), '# outside');
    await symlink(join(outside, 'escape.md'), join(root, 'reports/investigation/finding/link.md'));
    await expectCode(service.readFinalReport('investigation', artifact({ storageKey: 'reports/investigation/finding/link.md', sizeBytes: 9n })), 'EVIDENCE_STORAGE_KEY_INVALID', 400);
  });

  it('uses ApplicationError for safe HTTP mapping', async () => {
    await expect(service.readFinalReport('investigation', artifact({ type: 'SCREENSHOT' }))).rejects.toBeInstanceOf(ApplicationError);
  });
});

