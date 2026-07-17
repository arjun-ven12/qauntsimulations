import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { FinalEvidenceReportService, type FinalFindingReport } from '../final-evidence-report.service.js';

let directory: string | undefined;

const report = (): FinalFindingReport => ({
  reportVersion: '2026-07-17.prompt8.v1',
  investigationId: 'investigation_report',
  findingId: 'finding_duplicate',
  title: 'Duplicate checkout submission under delayed payment response',
  generatedAt: '2026-01-01T00:00:00.000Z',
  summary: 'A deterministic minimisation run identified a minimal tested condition set.',
  businessImpact: 'A customer may create duplicate test payment and order activity.',
  environment: {
    projectId: 'project_demo',
    environmentId: 'environment_demo',
    journeyId: 'journey_checkout',
  },
  originalObservation: {
    worldId: 'world_source',
    experimentId: 'experiment_source',
    configuration: { duplicateSubmissionBug: true, doubleSubmit: true, paymentDelayMs: 1200 },
    invariantIds: ['invariant_payment', 'invariant_order'],
  },
  reproduction: {
    reproductionRunId: 'repro_run',
    exactReproductionWorldId: 'world_exact',
    reproductionCount: 3,
    outcome: 'SUPPORTED',
  },
  minimisation: {
    minimisationRunId: 'min_run',
    retainedConditions: { duplicateSubmissionBug: true, doubleSubmit: true },
    removedConditions: { userProfile: 'impatient', viewport: 'mobile-390x844' },
    inconclusiveConditions: {},
    boundedRange: { lowerPassingBoundMs: 750, upperFailingBoundMs: 825, targetPrecisionMs: 100 },
    confirmationWorldId: 'world_confirm',
    confirmed: true,
    claimLevel: 'MINIMAL_TESTED_SET',
  },
  confidence: {
    initial: 0.95,
    final: 0.97,
    explanation: ['Final minimal-set confirmation reproduced the invariant violation.'],
  },
  reproductionSteps: ['Open checkout.', 'Click Pay twice.', 'Observe duplicate payment/order requests.'],
  evidence: [{ id: 'artifact_network', type: 'NETWORK_LOG', description: 'Network evidence.' }],
  limitations: ['Greedy single-variable removal.', 'Bounded delay range, not exact threshold.'],
  provenance: {
    plannerProvider: 'DETERMINISTIC',
    workerProvider: 'LOCAL',
    reportGenerator: 'DETERMINISTIC',
  },
});

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('final evidence report generation', () => {
  it('writes JSON and Markdown final report artifacts under the trusted storage root', async () => {
    directory = await mkdtemp(join(tmpdir(), 'taskos-report-'));
    const service = new FinalEvidenceReportService(directory);
    const result = await service.write(report());
    expect(result.jsonPath.startsWith(directory)).toBe(true);
    expect(result.markdownPath.startsWith(directory)).toBe(true);
    expect(result.jsonArtifact).toMatchObject({ type: 'FINAL_REPORT', mimeType: 'application/json' });
    expect(result.markdownArtifact).toMatchObject({ type: 'FINAL_REPORT', mimeType: 'text/markdown' });
    expect(result.jsonChecksum).toHaveLength(64);
    expect(result.markdownChecksum).toHaveLength(64);
  });

  it('includes required Markdown sections and avoids absolute evidence embedding', () => {
    const markdown = new FinalEvidenceReportService('/tmp/taskos-report-test').markdown(report());
    for (const heading of [
      '# Duplicate checkout submission under delayed payment response',
      '## Executive summary',
      '## Minimal tested triggering conditions',
      '## Bounded failure range',
      '## Reproduction steps',
      '## Evidence index',
      '## Limitations',
      '## Runtime provenance',
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).not.toContain('postgresql://');
    expect(markdown).not.toContain('authorization');
  });
});
