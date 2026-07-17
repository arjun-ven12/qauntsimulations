import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import type { WorkerResult } from '@taskos/execution-contracts';
import type { PersistedArtifactInput } from '../investigations/investigations.types.js';

export class LocalEvidenceMetadataService {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }

  async collect(result: WorkerResult): Promise<PersistedArtifactInput[]> {
    const candidates: Array<{ type: PersistedArtifactInput['type']; path: string | undefined; mimeType: string }> = [
      { type: 'ENVIRONMENT_MANIFEST', path: result.evidence.manifestPath, mimeType: 'application/json' },
      { type: 'WORKER_RESULT', path: resolve(result.evidence.manifestPath, '..', 'worker-result.json'), mimeType: 'application/json' },
      { type: 'TRACE', path: result.evidence.tracePath, mimeType: 'application/zip' },
      { type: 'VIDEO', path: result.evidence.videoPath, mimeType: 'video/webm' },
      { type: 'CONSOLE_LOG', path: result.evidence.consoleLogPath, mimeType: 'application/json' },
      { type: 'NETWORK_LOG', path: result.evidence.networkLogPath, mimeType: 'application/json' },
      ...result.evidence.screenshotPaths.map((path) => ({ type: 'SCREENSHOT' as const, path, mimeType: 'image/png' })),
    ];
    const artifacts: PersistedArtifactInput[] = [];
    for (const candidate of candidates) {
      if (!candidate.path) continue;
      const path = resolve(candidate.path);
      const storageKey = relative(this.root, path);
      if (storageKey.startsWith('..') || isAbsolute(storageKey)) throw new Error('Worker result referenced evidence outside the configured storage root');
      const [details, bytes] = await Promise.all([stat(path), readFile(path)]);
      artifacts.push({ type: candidate.type, storageKey, mimeType: candidate.mimeType, sizeBytes: BigInt(details.size), checksum: createHash('sha256').update(bytes).digest('hex'), metadata: { filename: basename(path) } });
    }
    return artifacts;
  }
}
