import type { InvestigationEvent } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import { cleanupWarning, plannerLabels, providerLabel, timingLabels } from './live-worldlab.page.js';

const event = (metadata?: InvestigationEvent['metadata']): InvestigationEvent => ({
  id: 'event-1',
  investigationId: 'investigation-1',
  type: 'sandbox_provisioning',
  message: 'Sandbox lifecycle event.',
  createdAt: '2026-01-01T00:00:00.000Z',
  metadata,
});

describe('LiveWorldLabPage runtime metadata helpers', () => {
  it('labels known providers and falls back safely for unknown providers', () => {
    expect(providerLabel(event({ provider: 'LOCAL' }))).toBe('Local worker');
    expect(providerLabel(event({ provider: 'DAYTONA' }))).toBe('Daytona sandbox');
    expect(providerLabel(event({ provider: 'EXPERIMENTAL_PROVIDER' }))).toBe(
      'Provider: EXPERIMENTAL_PROVIDER',
    );
    expect(providerLabel(event())).toBeNull();
  });

  it('formats optional timings only when finite values exist', () => {
    expect(
      timingLabels(
        event({
          sandboxSetupDurationMs: 1200.4,
          workerExecutionDurationMs: 333,
          artifactDownloadDurationMs: null,
          ignoredDurationMs: '200',
        }),
      ),
    ).toEqual(['Setup: 1,200 ms', 'Worker: 333 ms']);
    expect(timingLabels(event())).toEqual([]);
  });

  it('shows cleanup warnings only for cleanup failure metadata', () => {
    expect(cleanupWarning(event({ cleanupOutcome: 'DELETED' }))).toBeNull();
    expect(cleanupWarning(event({ phase: 'sandbox_cleanup_failed' }))).toBe(
      'Cleanup failed. Manual sandbox cleanup may be required.',
    );
    expect(cleanupWarning(event({ cleanupOutcome: 'FAILED', cleanupError: 'delete failed' }))).toBe(
      'Cleanup failed: delete failed',
    );
  });

  it('labels optional planner provenance and status metadata without requiring AI fields', () => {
    expect(
      plannerLabels(
        event({
          plannerProvenance: 'FALLBACK',
          plannerStatus: 'PARTIALLY_ACCEPTED',
          rejectedPlanItems: ['unsafe-world'],
        }),
      ),
    ).toEqual(['Planner: FALLBACK', 'Plan status: PARTIALLY ACCEPTED']);
    expect(plannerLabels(event())).toEqual([]);
  });
});
