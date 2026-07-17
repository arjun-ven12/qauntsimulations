import { describe, expect, it } from 'vitest';
import {
  createInvestigationInputSchema,
  demoCreateInvestigationInput,
  experimentPlanSchema,
  findingSchema,
  investigationSchema,
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

  it('accepts adaptive reproduction events and increasing world totals', () => {
    const adaptiveProgress = {
      ...validProgress,
      progress: { totalWorlds: 7, queued: 2, running: 1, passed: 2, failed: 2, flaky: 0 },
      recentEvents: [
        'adaptive_plan_created',
        'adaptive_world_generated',
        'reproduction_attempt_started',
        'reproduction_attempt_completed',
        'confidence_updated',
        'failure_region_updated',
        'reproduction_completed',
        'unknown_future_event',
      ].map((type, index) => ({
        id: `event_adaptive_${index}`,
        investigationId: validProgress.id,
        type,
        message: type.replaceAll('_', ' '),
        createdAt: '2026-01-01T00:00:00.000Z',
        metadata: { reproductionCount: index, confidence: index / 10 },
      })),
    };
    expect(investigationProgressSchema.parse(adaptiveProgress)).toEqual(adaptiveProgress);
  });

  it('accepts planner events and investigations that remain in planning or adapting', () => {
    const plannerEvents = [
      'planner_started',
      'planner_completed',
      'planner_output_received',
      'planner_validation_started',
      'planner_validation_failed',
      'planner_plan_accepted',
      'planner_plan_partially_accepted',
      'planner_fallback_used',
      'planner_failed',
      'unknown_future_planner_event',
    ].map((type, index) => ({
      id: `event_planner_${index}`,
      investigationId: validProgress.id,
      type,
      message: type.replaceAll('_', ' '),
      createdAt: '2026-01-01T00:00:00.000Z',
      metadata: {
        plannerProvenance: index % 2 === 0 ? 'OPENAI' : 'FALLBACK',
        plannerStatus: index % 2 === 0 ? 'VALIDATING' : 'FALLBACK_USED',
      },
    }));

    expect(
      investigationProgressSchema.parse({
        ...validProgress,
        status: 'PLANNING',
        recentEvents: plannerEvents,
      }).status,
    ).toBe('PLANNING');
    expect(
      investigationProgressSchema.parse({
        ...validProgress,
        status: 'ADAPTING',
        recentEvents: plannerEvents,
      }).status,
    ).toBe('ADAPTING');
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

describe('experiment planning contract', () => {
  const basePlan = {
    objective: 'Validate checkout reliability.',
    journeyId: 'journey_checkout',
    scenarioId: 'scenario_duplicate_submission',
    worldPack: 'commerce-pack',
    selectedVariables: ['paymentDelayMs'],
    initialWorldCount: 1,
    maximumWorldCount: 4,
    maximumConcurrentWorkers: 1,
    timeoutSeconds: 120,
    retryCount: 0,
    safetyConstraints: [],
    invariants: [],
    worlds: [
      {
        worldId: 'world_baseline',
        browser: 'CHROMIUM',
        viewport: 'DESKTOP',
        networkProfile: 'NORMAL',
        userProfile: 'NORMAL',
        concurrency: 1,
        latencyMs: 0,
        bandwidthKbps: null,
        packetLossPercent: 0,
        offlineDurationMs: 0,
        inventoryState: {},
        sessionState: {},
        paymentDelayMs: 0,
        retryIntervalMs: 100,
        doubleSubmit: false,
        webhookOrder: [],
        injectedFaults: [],
        randomSeed: 1,
        reason: 'Baseline deterministic control.',
      },
    ],
    planningExplanation: 'Generated by the deterministic fallback planner.',
    aiProvider: 'DETERMINISTIC',
    estimatedComputeUnits: 0,
  } as const;

  it('accepts deterministic, OpenAI, and fallback planner provenance/status metadata', () => {
    for (const aiProvider of ['DETERMINISTIC', 'OPENAI', 'FALLBACK'] as const) {
      expect(
        experimentPlanSchema.parse({
          ...basePlan,
          aiProvider,
          plannerStatus: aiProvider === 'FALLBACK' ? 'FALLBACK_USED' : 'ACCEPTED',
          plannerMetadata: {
            assumptions: ['Checkout selectors are stable.'],
            rejectedPlanItems: aiProvider === 'OPENAI' ? ['unsafe-arbitrary-script'] : [],
            validationWarnings: ['Reduced to bounded world count.'],
          },
        }),
      ).toMatchObject({ aiProvider });
    }
  });

  it('accepts legacy investigation detail records with unknown extensible event types', () => {
    expect(
      investigationSchema.parse({
        id: 'investigation_planner',
        projectId: 'project_demo_checkout',
        environmentId: 'environment_demo_local',
        journeyId: 'journey_checkout',
        scenarioId: 'scenario_duplicate_submission',
        name: 'Planner investigation',
        status: 'PLANNING',
        plan: null,
        aggregateProgress: 0,
        workerCounts: { queued: 0, running: 0, completed: 0, failed: 0 },
        recentEvents: [
          {
            id: 'event_unknown_planner',
            type: 'future_planner_event',
            occurredAt: '2026-01-01T00:00:00.000Z',
            data: { plannerStatus: 'GENERATING' },
          },
        ],
        findingsCount: 0,
        elapsedTimeSeconds: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }).recentEvents[0]?.type,
    ).toBe('future_planner_event');
  });
});

describe('finding contract', () => {
  it('accepts evolving confidence, reproduction counts, and sparse causal metadata', () => {
    expect(
      findingSchema.parse({
        id: 'finding_adaptive',
        investigationId: 'investigation_demo_checkout',
        title: 'Duplicate checkout submission',
        summary: 'Adaptive reproduction is still evaluating the failure region.',
        severity: 'HIGH',
        confidence: 'POSSIBLE',
        reproductionCount: 0,
        causalConditions: {
          causalStatus: 'UNCONFIRMED',
          experimentIds: ['experiment_initial', 'experiment_reproduction'],
          evidenceArtifactIds: ['artifact_network', 'artifact_trace'],
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      confidence: 'POSSIBLE',
      reproductionCount: 0,
    });
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
