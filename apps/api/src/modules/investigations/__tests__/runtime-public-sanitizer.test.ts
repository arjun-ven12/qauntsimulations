import { describe, expect, it } from 'vitest';
import { mapExperimentList, mapWorkerList } from '../investigations.mapper.js';
import { sanitizeRuntimePublicMetadata } from '../runtime-public-sanitizer.js';

describe('sanitizeRuntimePublicMetadata', () => {
  it('removes host and sandbox path fields recursively without mutating input', () => {
    const input = {
      id: 'safe',
      resultPath: '/redacted/host/result.json',
      nested: {
        workspacePath: '/workspace/taskos',
        filename: 'worker-result.json',
        storageKey: 'reports/investigation/final-report.md',
        markdown: 'Use /api/investigations/:id for details.',
      },
      array: [{ tracePath: 'C:\\Users\\example\\trace.zip', status: 'PASSED' }],
    };
    const original = structuredClone(input);
    const output = sanitizeRuntimePublicMetadata(input);

    expect(output).toEqual({
      id: 'safe',
      nested: {
        filename: 'worker-result.json',
        storageKey: 'reports/investigation/final-report.md',
        markdown: 'Use /api/investigations/:id for details.',
      },
      array: [{ status: 'PASSED' }],
    });
    expect(input).toEqual(original);
  });

  it('preserves safe URLs and unknown metadata while ignoring unsafe constructor keys', () => {
    const output = sanitizeRuntimePublicMetadata({
      website: 'https://example.test/a/b',
      note: 'ordinary / text remains',
      unknown: { count: 2 },
      constructor: { unsafe: true },
    });
    expect(output).toEqual({
      website: 'https://example.test/a/b',
      note: 'ordinary / text remains',
      unknown: { count: 2 },
    });
  });

  it('rejects prototype-polluted objects safely', () => {
    const output = sanitizeRuntimePublicMetadata({
      __proto__: { polluted: true },
      website: 'https://example.test/a/b',
    });
    expect(output).toEqual({});
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('keeps public experiment and worker responses backwards compatible while dropping internal paths', () => {
    const createdAt = new Date('2026-07-17T00:00:00.000Z');
    const experiments = mapExperimentList([
      {
        id: 'experiment',
        investigationId: 'investigation',
        worldId: 'world',
        status: 'PASSED',
        kind: 'INITIAL',
        world: { status: 'COMPLETED' },
        evaluations: [{ passed: true, executionAttemptId: 'attempt' }],
        createdAt,
        updatedAt: createdAt,
        _count: { attempts: 1 },
        attempts: [{
          id: 'attempt',
          status: 'PASSED',
          result: { status: 'PASSED' },
          startedAt: createdAt,
          completedAt: createdAt,
          exitCode: 0,
          durationMs: 12,
          resultPath: '/redacted/worker-result.json',
        } as never],
      },
    ]);
    const workers = mapWorkerList([
      {
        id: 'worker',
        status: 'COMPLETED',
        providerId: 'LOCAL',
        createdAt,
        updatedAt: createdAt,
        attempts: [{
          id: 'attempt',
          status: 'PASSED',
          startedAt: createdAt,
          completedAt: createdAt,
          exitCode: 0,
          durationMs: 12,
          resultPath: '/redacted/worker-result.json',
          experiment: { worldId: 'world', investigationId: 'investigation' },
        } as never],
      },
    ]);

    expect(JSON.stringify(experiments)).not.toContain('/redacted/');
    expect(JSON.stringify(workers)).not.toContain('/redacted/');
    expect(experiments[0]?.latestAttempt).toMatchObject({ id: 'attempt', exitCode: 0 });
    expect(workers[0]?.attempts[0]).toMatchObject({
      id: 'attempt',
      experiment: { worldId: 'world', investigationId: 'investigation' },
    });
  });
});
