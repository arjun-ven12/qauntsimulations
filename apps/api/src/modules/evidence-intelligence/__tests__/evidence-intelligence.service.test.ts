import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvidenceIntelligenceService } from '../evidence-intelligence.service.js';
import type { EvidenceIntelligenceProvider } from '../evidence-intelligence.types.js';
import type { EvidenceIntelligenceCandidate } from '../evidence-intelligence.repository.js';

const candidate: EvidenceIntelligenceCandidate = {
  investigationId: 'investigation',
  findingId: 'finding',
  worldId: 'world',
  experimentId: 'experiment',
  invariantType: 'NO_DUPLICATE_PAYMENT',
  expectedBehavior: 'One payment per checkout.',
  observedOutcome: 'FAIL',
  worldDimensions: { paymentDelayMs: 1200, doubleSubmit: true },
  screenshots: [{ evidenceId: 'evidence_screen', role: 'FAILURE', storageKey: 'screenshots/world/failure.png', mimeType: 'image/png', sizeBytes: 8n }],
};

describe('EvidenceIntelligenceService', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'taskos-nosana-service-'));
    await mkdir(join(root, 'screenshots/world'), { recursive: true });
    await writeFile(join(root, 'screenshots/world/failure.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('persists validated supplemental evidence without changing authoritative truth', async () => {
    const persisted: unknown[] = [];
    const service = new EvidenceIntelligenceService(
      {
        candidates: async () => [candidate],
        persistSupplementalEvidence: async (input) => {
          persisted.push(input);
          return 'evidence_nosana';
        },
      },
      provider('COMPLETED'),
      root,
      { enabled: true, required: false, maxScreenshots: 3, maxImageBytes: 5 * 1024 * 1024 },
    );
    await service.synchronizeSafely('investigation');
    expect(persisted).toHaveLength(1);
    const input = persisted[0] as { storageKey: string; result: { provider: string; status: string } };
    expect(input.result).toMatchObject({ provider: 'NOSANA', status: 'COMPLETED' });
    expect(input.storageKey).toContain('supplemental/nosana/investigation/finding/job_123/evidence-analysis.json');
    const content = await readFile(join(root, input.storageKey), 'utf8');
    expect(JSON.parse(content)).toMatchObject({ provider: 'NOSANA', status: 'COMPLETED' });
  });

  it('does not persist provider failures and stays non-blocking', async () => {
    const persisted: unknown[] = [];
    const service = new EvidenceIntelligenceService(
      {
        candidates: async () => [candidate],
        persistSupplementalEvidence: async (input) => {
          persisted.push(input);
          return 'evidence_nosana';
        },
      },
      provider('FAILED'),
      root,
      { enabled: true, required: false, maxScreenshots: 3, maxImageBytes: 5 * 1024 * 1024 },
    );
    await expect(service.synchronizeSafely('investigation')).resolves.toBeUndefined();
    expect(persisted).toHaveLength(0);
  });

  it('does nothing when disabled or when there is no eligible candidate', async () => {
    const service = new EvidenceIntelligenceService(
      { candidates: async () => { throw new Error('should not run'); }, persistSupplementalEvidence: async () => 'unused' },
      provider('COMPLETED'),
      root,
      { enabled: false, required: false, maxScreenshots: 3, maxImageBytes: 5 * 1024 * 1024 },
    );
    await expect(service.synchronizeSafely('investigation')).resolves.toBeUndefined();
  });
});

function provider(status: 'COMPLETED' | 'FAILED'): EvidenceIntelligenceProvider {
  return {
    async analyze(request, images) {
      if (status === 'COMPLETED') expect(images[0]).toMatchObject({ evidenceId: 'evidence_screen', mimeType: 'image/png' });
      return {
        provider: 'NOSANA',
        providerJobId: 'job_123',
        status,
        summary: status === 'COMPLETED' ? 'Supplemental analysis completed.' : null,
        visualChanges: status === 'COMPLETED' ? [{ region: 'checkout', observation: 'Payment state changed.', confidence: 0.8 }] : [],
        likelyFailureMechanism: status === 'COMPLETED' ? 'Delayed repeated submit.' : null,
        sourceEvidenceIds: request.screenshots.map((screenshot) => screenshot.evidenceId),
        confidence: status === 'COMPLETED' ? 0.8 : null,
        model: status === 'COMPLETED' ? 'taskos-compact-visual-diff' : null,
        durationMs: 12,
        errorCategory: status === 'COMPLETED' ? null : 'DEPLOYMENT_UNAVAILABLE',
      };
    },
  };
}
