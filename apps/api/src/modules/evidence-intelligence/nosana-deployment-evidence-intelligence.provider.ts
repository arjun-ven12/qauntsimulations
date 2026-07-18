import { z } from 'zod';
import {
  evidenceAnalysisRequestSchema,
  evidenceAnalysisResultSchema,
  type EvidenceAnalysisImage,
  type EvidenceAnalysisRequest,
  type EvidenceAnalysisResult,
  type EvidenceIntelligenceProvider,
} from './evidence-intelligence.types.js';

export const nosanaDeploymentEvidenceIntelligenceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  required: z.boolean().default(false),
  deploymentId: z.string().trim().min(1).max(200).optional(),
  endpoint: z.string().url().optional(),
  timeoutMs: z.number().int().min(1_000).max(300_000).default(60_000),
  maxScreenshots: z.number().int().min(1).max(3).default(3),
  maxImageBytes: z.number().int().min(1).max(5 * 1024 * 1024).default(5 * 1024 * 1024),
}).strict().superRefine((value, context) => {
  if (!value.enabled) return;
  if (!value.deploymentId) context.addIssue({ code: 'custom', path: ['deploymentId'], message: 'NOSANA_DEPLOYMENT_ID is required when evidence intelligence is enabled' });
  if (!value.endpoint) context.addIssue({ code: 'custom', path: ['endpoint'], message: 'NOSANA_DEPLOYMENT_ENDPOINT is required when evidence intelligence is enabled' });
});

export type NosanaDeploymentEvidenceIntelligenceConfig = z.infer<typeof nosanaDeploymentEvidenceIntelligenceConfigSchema>;

export class NosanaDeploymentEvidenceIntelligenceProvider implements EvidenceIntelligenceProvider {
  readonly config: NosanaDeploymentEvidenceIntelligenceConfig;

  constructor(config: NosanaDeploymentEvidenceIntelligenceConfig, private readonly fetcher: typeof fetch = fetch) {
    this.config = nosanaDeploymentEvidenceIntelligenceConfigSchema.parse(config);
  }

  async analyze(rawRequest: EvidenceAnalysisRequest, rawImages: EvidenceAnalysisImage[]): Promise<EvidenceAnalysisResult> {
    const started = Date.now();
    const request = evidenceAnalysisRequestSchema.parse({
      ...rawRequest,
      screenshots: rawRequest.screenshots.slice(0, this.config.maxScreenshots),
    });
    const images = rawImages.slice(0, this.config.maxScreenshots);
    if (!this.config.enabled || !this.config.endpoint || !this.config.deploymentId) return failure(this.config.deploymentId ?? 'nosana-deployment', 'CONFIGURATION_ERROR', Date.now() - started);
    const invalidImage = images.find((image) => !isSupportedImage(image) || image.bytes.byteLength <= 0);
    if (invalidImage) return failure(this.config.deploymentId, 'INVALID_IMAGE', Date.now() - started);
    if (images.some((image) => image.bytes.byteLength > this.config.maxImageBytes)) return failure(this.config.deploymentId, 'IMAGE_TOO_LARGE', Date.now() - started);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(new URL('/analyze', this.config.endpoint).toString(), {
        method: 'POST',
        body: multipartBody(request, images),
        signal: controller.signal,
      });
      if (!response.ok) return failure(this.config.deploymentId, response.status === 413 ? 'IMAGE_TOO_LARGE' : 'DEPLOYMENT_UNAVAILABLE', Date.now() - started);
      const payload = await response.json().catch(() => null) as unknown;
      const parsed = evidenceAnalysisResultSchema.safeParse({
        ...(payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}),
        provider: 'NOSANA',
        providerJobId: providerJobId(payload, this.config.deploymentId),
        sourceEvidenceIds: request.screenshots.map((screenshot) => screenshot.evidenceId),
        durationMs: duration(payload) ?? Date.now() - started,
      });
      if (!parsed.success) return failure(this.config.deploymentId, 'INVALID_RESPONSE', Date.now() - started);
      return parsed.data;
    } catch (error) {
      return failure(this.config.deploymentId, isAbortError(error) ? 'REQUEST_TIMEOUT' : 'UNKNOWN_PROVIDER_ERROR', Date.now() - started);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function multipartBody(request: EvidenceAnalysisRequest, images: EvidenceAnalysisImage[]): FormData {
  const form = new FormData();
  form.append('manifest', JSON.stringify({
    provider: 'NOSANA',
    invariantType: request.invariantType,
    expectedBehavior: request.expectedBehavior,
    observedOutcome: request.observedOutcome,
    worldDimensions: request.worldDimensions,
    screenshots: request.screenshots.map(({ evidenceId, role }) => ({ evidenceId, role })),
  }));
  for (const image of images) {
    form.append('images', new Blob([arrayBuffer(image.bytes)], { type: image.mimeType }), `${image.role.toLowerCase()}-${image.evidenceId}.${extension(image.mimeType)}`);
  }
  return form;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function isSupportedImage(image: EvidenceAnalysisImage): boolean {
  return image.mimeType === 'image/png' || image.mimeType === 'image/jpeg' || image.mimeType === 'image/webp';
}

function extension(mimeType: EvidenceAnalysisImage['mimeType']): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function providerJobId(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>).providerJobId;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

function duration(payload: unknown): number | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>).durationMs;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function failure(providerJobId: string, errorCategory: NonNullable<EvidenceAnalysisResult['errorCategory']>, durationMs: number): EvidenceAnalysisResult {
  return evidenceAnalysisResultSchema.parse({
    provider: 'NOSANA',
    providerJobId,
    status: errorCategory === 'REQUEST_TIMEOUT' ? 'TIMED_OUT' : 'FAILED',
    summary: null,
    visualChanges: [],
    likelyFailureMechanism: null,
    sourceEvidenceIds: ['unavailable'],
    confidence: null,
    model: null,
    durationMs,
    errorCategory,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
