import { constants } from 'node:fs';
import { access, lstat, readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { ApplicationError } from '../../core/errors/application-error.js';

const allowedContentTypes = new Set(['application/json', 'text/json', 'text/markdown', 'text/plain']);

export interface EvidenceTextContentRecord {
  id: string;
  experimentId: string;
  type: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: bigint;
  checksum: string | null;
  redacted: boolean;
  createdAt: Date;
  metadata: unknown;
}

export type EvidenceTextContentFormat = 'MARKDOWN' | 'JSON' | 'TEXT';

export interface EvidenceTextContentResponse {
  evidenceId: string;
  investigationId: string;
  type: 'FINAL_REPORT';
  format: EvidenceTextContentFormat;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksum?: string;
  content: string;
}

export class EvidenceContentService {
  constructor(
    private readonly root: string,
    private readonly maxBytes = 1_048_576,
  ) {}

  async readFinalReport(
    investigationId: string,
    artifact: EvidenceTextContentRecord,
  ): Promise<EvidenceTextContentResponse> {
    if (artifact.type !== 'FINAL_REPORT') {
      throw new ApplicationError(
        'EVIDENCE_CONTENT_UNSUPPORTED',
        'This evidence artifact cannot be previewed safely.',
        400,
      );
    }
    const contentType = artifact.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!allowedContentTypes.has(contentType)) {
      throw new ApplicationError(
        'EVIDENCE_CONTENT_UNSUPPORTED',
        'This final report content type cannot be previewed safely.',
        400,
      );
    }
    if (artifact.sizeBytes > BigInt(this.maxBytes)) {
      throw new ApplicationError('EVIDENCE_CONTENT_TOO_LARGE', 'Final report is too large to preview.', 413);
    }

    const resolved = await this.resolveStorageKey(artifact.storageKey);
    const details = await stat(resolved);
    if (!details.isFile()) {
      throw new ApplicationError(
        'EVIDENCE_CONTENT_INCONSISTENT',
        'Final report artifact is not a readable file.',
        409,
      );
    }
    if (details.size > this.maxBytes) {
      throw new ApplicationError('EVIDENCE_CONTENT_TOO_LARGE', 'Final report is too large to preview.', 413);
    }

    const content = await readFile(resolved, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > this.maxBytes) {
      throw new ApplicationError('EVIDENCE_CONTENT_TOO_LARGE', 'Final report is too large to preview.', 413);
    }
    const format = contentFormat(contentType);
    if (format === 'JSON') {
      try {
        JSON.parse(content);
      } catch {
        throw new ApplicationError(
          'EVIDENCE_CONTENT_MALFORMED_JSON',
          'Final report JSON is malformed.',
          422,
        );
      }
    }

    return {
      evidenceId: artifact.id,
      investigationId,
      type: 'FINAL_REPORT',
      format,
      filename: filenameFromMetadata(artifact.metadata) ?? basename(artifact.storageKey),
      contentType,
      sizeBytes: details.size,
      ...(artifact.checksum ? { checksum: artifact.checksum } : {}),
      content,
    };
  }

  private async resolveStorageKey(storageKey: string): Promise<string> {
    if (storageKey.includes('\0') || isAbsolute(storageKey)) {
      throw new ApplicationError('EVIDENCE_STORAGE_KEY_INVALID', 'Evidence storage key is invalid.', 400);
    }
    const candidate = resolve(this.root, storageKey);
    const rootRealPath = await realpath(this.root);
    const parentRealPath = await realpath(resolve(candidate, '..')).catch(() => null);
    if (!parentRealPath || !isInside(rootRealPath, parentRealPath)) {
      throw new ApplicationError('EVIDENCE_STORAGE_KEY_INVALID', 'Evidence storage key is invalid.', 400);
    }
    const info = await lstat(candidate).catch(() => {
      throw new ApplicationError(
        'EVIDENCE_CONTENT_MISSING',
        'Final report artifact could not be found.',
        409,
      );
    });
    if (info.isSymbolicLink()) {
      const fileRealPath = await realpath(candidate);
      if (!isInside(rootRealPath, fileRealPath)) {
        throw new ApplicationError('EVIDENCE_STORAGE_KEY_INVALID', 'Evidence storage key is invalid.', 400);
      }
    }
    await access(candidate, constants.R_OK);
    const finalRealPath = await realpath(candidate);
    if (!isInside(rootRealPath, finalRealPath)) {
      throw new ApplicationError('EVIDENCE_STORAGE_KEY_INVALID', 'Evidence storage key is invalid.', 400);
    }
    return finalRealPath;
  }
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function contentFormat(contentType: string): EvidenceTextContentFormat {
  if (contentType === 'application/json' || contentType === 'text/json') return 'JSON';
  if (contentType === 'text/markdown') return 'MARKDOWN';
  return 'TEXT';
}

function filenameFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const filename = (metadata as Record<string, unknown>).filename;
  return typeof filename === 'string' && filename.length ? basename(filename) : undefined;
}
