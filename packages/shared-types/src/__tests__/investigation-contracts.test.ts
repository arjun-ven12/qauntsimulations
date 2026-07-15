import { describe, expect, it } from 'vitest';
import {
  createInvestigationInputSchema,
  demoCreateInvestigationInput,
  investigationProgressSchema,
  investigationStatuses,
  investigationStatusSchema,
} from '../index.js';

const validProgress = {
  id: 'investigation_demo_checkout',
  status: 'RUNNING',
  progress: { totalWorlds: 4, queued: 1, running: 1, passed: 1, failed: 1, flaky: 0 },
  recentEvents: [
    {
      id: 'event_001',
      investigationId: 'investigation_demo_checkout',
      type: 'world_completed',
      message: 'A world completed.',
      createdAt: '2026-01-01T00:00:00.000Z',
      worldId: 'world_001',
      metadata: { passed: true, attempts: [1, 2] },
    },
  ],
  findingsCount: 1,
} as const;

describe('investigation progress contract', () => {
  it('accepts every frozen status and rejects unknown statuses', () => {
    expect(investigationStatuses).toHaveLength(10);
    for (const status of investigationStatuses) {
      expect(investigationStatusSchema.parse(status)).toBe(status);
    }
    expect(() => investigationStatusSchema.parse('DRAFT')).toThrow();
    expect(() => investigationStatusSchema.parse('CANCELLED')).toThrow();
  });

  it('accepts valid progress with JSON-safe events', () => {
    expect(investigationProgressSchema.parse(validProgress)).toEqual(validProgress);
  });

  it('rejects negative and inconsistent counters', () => {
    expect(() =>
      investigationProgressSchema.parse({
        ...validProgress,
        progress: { ...validProgress.progress, running: -1 },
      }),
    ).toThrow();
    expect(() =>
      investigationProgressSchema.parse({
        ...validProgress,
        progress: { ...validProgress.progress, totalWorlds: 2 },
      }),
    ).toThrow();
  });
});

describe('create investigation contract', () => {
  it('accepts the deterministic fixture and normalizes duplicate controls', () => {
    expect(createInvestigationInputSchema.parse(demoCreateInvestigationInput)).toEqual(
      demoCreateInvestigationInput,
    );
    expect(
      createInvestigationInputSchema.parse({
        ...demoCreateInvestigationInput,
        invariantIds: ['invariant_a', 'invariant_a'],
      }).invariantIds,
    ).toEqual(['invariant_a']);
  });

  it('rejects empty IDs and empty controls', () => {
    expect(() =>
      createInvestigationInputSchema.parse({ ...demoCreateInvestigationInput, projectId: ' ' }),
    ).toThrow();
    expect(() =>
      createInvestigationInputSchema.parse({
        ...demoCreateInvestigationInput,
        scenario: {
          ...demoCreateInvestigationInput.scenario,
          controls: { ...demoCreateInvestigationInput.scenario.controls, browsers: [] },
        },
      }),
    ).toThrow();
  });

  it('rejects concurrency above the world limit', () => {
    expect(() =>
      createInvestigationInputSchema.parse({
        ...demoCreateInvestigationInput,
        scenario: {
          ...demoCreateInvestigationInput.scenario,
          controls: {
            ...demoCreateInvestigationInput.scenario.controls,
            maximumWorlds: 2,
            maximumConcurrentWorkers: 3,
          },
        },
      }),
    ).toThrow();
  });
});
