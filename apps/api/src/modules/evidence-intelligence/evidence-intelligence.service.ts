import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { logger } from '../../core/logging/logger.js';
import type { EvidenceAnalysisImage, EvidenceIntelligenceProvider } from './evidence-intelligence.types.js';
import { evidenceAnalysisRequestSchema } from './evidence-intelligence.types.js';
import { checksum, type EvidenceIntelligenceCandidate, type EvidenceIntelligenceRepository } from './evidence-intelligence.repository.js';

export interface EvidenceIntelligenceServiceOptions {
  enabled: boolean;
  required: boolean;
  maxScreenshots: number;
  maxImageBytes: number;
}

export class EvidenceIntelligenceService {
  constructor(
    private readonly repository: Pick<EvidenceIntelligenceRepository, 'candidates' | 'persistSupplementalEvidence'>,
    private readonly provider: EvidenceIntelligenceProvider,
    private readonly evidenceRoot: string,
    private readonly options: EvidenceIntelligenceServiceOptions,
  ) {}

  async synchronizeSafely(investigationId: string): Promise<void> {
    if (!this.options.enabled) return;
    try {
      const [candidate] = await this.repository.candidates(investigationId, this.options.maxScreenshots);
      if (!candidate) return;
      const request = this.request(candidate);
      const images = await this.readImages(candidate);
      const result = await this.provider.analyze(request, images);
      if (result.status !== 'COMPLETED') {
        logger.warn({ investigationId, findingId: candidate.findingId, provider: 'NOSANA', errorCategory: result.errorCategory }, 'Nosana supplemental evidence unavailable');
        return;
      }
      const content = JSON.stringify(result, null, 2);
      const storageKey = `supplemental/nosana/${candidate.investigationId}/${candidate.findingId}/${result.providerJobId}/evidence-analysis.json`;
      const resolved = this.resolveStorageKey(storageKey);
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content);
      const evidenceId = await this.repository.persistSupplementalEvidence({
        investigationId: candidate.investigationId,
        findingId: candidate.findingId,
        experimentId: candidate.experimentId,
        sourceWorldId: candidate.worldId,
        storageKey,
        sizeBytes: BigInt(Buffer.byteLength(content, 'utf8')),
        checksum: checksum(content),
        result,
      });
      logger.info({ investigationId, findingId: candidate.findingId, evidenceId, provider: 'NOSANA', authoritative: false }, 'Nosana supplemental evidence attached');
    } catch (error) {
      logger.warn({ investigationId, err: error }, 'Nosana evidence intelligence failed non-fatally');
      if (this.options.required) {
        logger.warn({ investigationId }, 'NOSANA_REQUIRED is configured, but TaskOS keeps deterministic investigation truth authoritative and non-blocking');
      }
    }
  }

  private request(candidate: EvidenceIntelligenceCandidate) {
    return evidenceAnalysisRequestSchema.parse({
      investigationId: candidate.investigationId,
      worldId: candidate.worldId,
      findingId: candidate.findingId,
      invariantType: candidate.invariantType,
      expectedBehavior: candidate.expectedBehavior,
      observedOutcome: candidate.observedOutcome,
      screenshots: candidate.screenshots.map((screenshot) => ({
        evidenceId: screenshot.evidenceId,
        role: screenshot.role,
        safeInputReference: screenshot.evidenceId,
      })),
      worldDimensions: candidate.worldDimensions,
    });
  }

  private async readImages(candidate: EvidenceIntelligenceCandidate): Promise<EvidenceAnalysisImage[]> {
    const images: EvidenceAnalysisImage[] = [];
    for (const screenshot of candidate.screenshots.slice(0, this.options.maxScreenshots)) {
      const mimeType = supportedMimeType(screenshot.mimeType);
      if (!mimeType) throw new Error('INVALID_IMAGE');
      if (screenshot.sizeBytes > BigInt(this.options.maxImageBytes)) throw new Error('IMAGE_TOO_LARGE');
      const resolved = this.resolveStorageKey(screenshot.storageKey);
      const details = await stat(resolved);
      if (!details.isFile() || details.size > this.options.maxImageBytes) throw new Error('IMAGE_TOO_LARGE');
      const bytes = await readFile(resolved);
      if (bytes.byteLength > this.options.maxImageBytes) throw new Error('IMAGE_TOO_LARGE');
      images.push({ evidenceId: screenshot.evidenceId, role: screenshot.role, mimeType, bytes });
    }
    return images;
  }

  private resolveStorageKey(storageKey: string): string {
    if (storageKey.includes('\0') || isAbsolute(storageKey)) throw new Error('Invalid supplemental evidence storage key');
    const root = resolve(this.evidenceRoot);
    const candidate = resolve(root, storageKey);
    const path = relative(root, candidate);
    if (path.startsWith('..') || isAbsolute(path)) throw new Error('Invalid supplemental evidence storage key');
    return candidate;
  }
}

function supportedMimeType(value: string): EvidenceAnalysisImage['mimeType'] | null {
  const normalized = value.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/png' || normalized === 'image/jpeg' || normalized === 'image/webp') return normalized;
  return null;
}
