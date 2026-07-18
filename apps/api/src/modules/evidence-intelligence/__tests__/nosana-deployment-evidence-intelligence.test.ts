import { describe, expect, it } from 'vitest';
import { evidenceAnalysisRequestSchema, evidenceAnalysisResultSchema, type EvidenceAnalysisImage } from '../evidence-intelligence.types.js';
import { NosanaDeploymentEvidenceIntelligenceProvider, nosanaDeploymentEvidenceIntelligenceConfigSchema } from '../nosana-deployment-evidence-intelligence.provider.js';

const config = {
  enabled: true,
  required: false,
  deploymentId: 'deployment_123',
  endpoint: 'https://taskos-nosana.example.com',
  timeoutMs: 60_000,
  maxScreenshots: 3,
  maxImageBytes: 5 * 1024 * 1024,
};

const request = {
  investigationId: 'investigation',
  worldId: 'world',
  findingId: 'finding',
  invariantType: 'NO_DUPLICATE_PAYMENT',
  expectedBehavior: 'One checkout creates one payment.',
  observedOutcome: 'FAIL' as const,
  screenshots: [
    { evidenceId: 'evidence_1', role: 'BEFORE' as const, safeInputReference: 'evidence_1' },
    { evidenceId: 'evidence_2', role: 'FAILURE' as const, safeInputReference: 'evidence_2' },
  ],
  worldDimensions: { paymentDelayMs: 1200, doubleSubmit: true },
};

const images: EvidenceAnalysisImage[] = [
  { evidenceId: 'evidence_1', role: 'BEFORE', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
  { evidenceId: 'evidence_2', role: 'FAILURE', mimeType: 'image/png', bytes: new Uint8Array([4, 5, 6]) },
];

describe('Nosana deployment evidence intelligence', () => {
  it('validates disabled defaults and required deployment configuration', () => {
    expect(nosanaDeploymentEvidenceIntelligenceConfigSchema.parse({}).enabled).toBe(false);
    expect(nosanaDeploymentEvidenceIntelligenceConfigSchema.safeParse({ enabled: true }).success).toBe(false);
    expect(nosanaDeploymentEvidenceIntelligenceConfigSchema.safeParse(config).success).toBe(true);
  });

  it('rejects unsafe request references and bounds screenshots', () => {
    expect(evidenceAnalysisRequestSchema.safeParse(request).success).toBe(true);
    expect(evidenceAnalysisRequestSchema.safeParse({ ...request, screenshots: [...request.screenshots, ...request.screenshots] }).success).toBe(false);
    expect(evidenceAnalysisRequestSchema.safeParse({ ...request, screenshots: [{ evidenceId: 'evidence', role: 'FAILURE', safeInputReference: '/Users/alice/private.png' }] }).success).toBe(false);
  });

  it('posts multipart analysis without paths or credentials', async () => {
    let body: FormData | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      body = init?.body as FormData;
      return response({
        provider: 'NOSANA',
        providerJobId: 'deployment_123',
        status: 'COMPLETED',
        summary: 'Supplemental visual comparison completed.',
        visualChanges: [{ region: 'checkout', observation: 'Payment state changed.', confidence: 0.8 }],
        likelyFailureMechanism: 'Delayed repeated submit.',
        sourceEvidenceIds: ['evidence_1', 'evidence_2'],
        confidence: 0.8,
        model: 'taskos-compact-visual-diff',
        durationMs: 10,
        errorCategory: null,
      });
    };
    const result = await new NosanaDeploymentEvidenceIntelligenceProvider(config, fetcher).analyze(request, images);
    expect(result.status).toBe('COMPLETED');
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.stringify(result)).not.toContain('/Users/');
    expect(JSON.stringify(result)).not.toMatch(/authorization|cookie|secret/i);
  });

  it('normalizes deployment errors, invalid JSON and timeouts safely', async () => {
    await expect(new NosanaDeploymentEvidenceIntelligenceProvider(config, async () => response({}, 503)).analyze(request, images))
      .resolves.toMatchObject({ status: 'FAILED', errorCategory: 'DEPLOYMENT_UNAVAILABLE' });
    await expect(new NosanaDeploymentEvidenceIntelligenceProvider(config, async () => new Response('bad', { status: 200 })).analyze(request, images))
      .resolves.toMatchObject({ status: 'FAILED', errorCategory: 'INVALID_RESPONSE' });
    await expect(new NosanaDeploymentEvidenceIntelligenceProvider(config, async () => { throw new DOMException('timeout', 'AbortError'); }).analyze(request, images))
      .resolves.toMatchObject({ status: 'TIMED_OUT', errorCategory: 'REQUEST_TIMEOUT' });
  });

  it('rejects invalid or oversized image inputs before sending', async () => {
    const provider = new NosanaDeploymentEvidenceIntelligenceProvider(config, async () => { throw new Error('should not fetch'); });
    await expect(provider.analyze(request, [{ ...images[0]!, mimeType: 'image/gif' as 'image/png' }]))
      .resolves.toMatchObject({ status: 'FAILED', errorCategory: 'INVALID_IMAGE' });
    await expect(provider.analyze(request, [{ ...images[0]!, bytes: new Uint8Array(config.maxImageBytes + 1) }]))
      .resolves.toMatchObject({ status: 'FAILED', errorCategory: 'IMAGE_TOO_LARGE' });
  });

  it('validates provider output strictly', () => {
    expect(evidenceAnalysisResultSchema.safeParse({
      provider: 'NOSANA',
      providerJobId: 'deployment',
      status: 'COMPLETED',
      summary: 'ok',
      visualChanges: [{ region: 'checkout', observation: 'changed', confidence: 1 }],
      likelyFailureMechanism: null,
      sourceEvidenceIds: ['evidence'],
      confidence: 0.5,
      model: 'model',
      durationMs: 1,
      errorCategory: null,
    }).success).toBe(true);
    expect(evidenceAnalysisResultSchema.safeParse({
      provider: 'NOSANA',
      providerJobId: 'deployment',
      status: 'COMPLETED',
      summary: 'ok',
      visualChanges: [{ region: 'checkout', observation: 'changed', confidence: 1.5 }],
      likelyFailureMechanism: null,
      sourceEvidenceIds: ['evidence'],
      confidence: 0.5,
      model: 'model',
      durationMs: 1,
      errorCategory: null,
    }).success).toBe(false);
  });
});

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}
