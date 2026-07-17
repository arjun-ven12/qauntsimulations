import {
  createInvestigationInputSchema,
  investigationProgressSchema,
  type CreateInvestigationInput,
  type Finding,
  type InvestigationProgress,
  type Project,
} from '@taskos/shared-types';
import type {
  EvidenceArtifactResponse,
  EvidenceTextContentResponse,
  ExperimentPlanResponse,
  FindingDetail,
  InvestigationApi,
  InvestigationExperiment,
  InvestigationWorker,
  InvestigationWorld,
} from './investigation-api.js';

const FIXED_TIME = '2026-07-17T07:01:03.585Z';
export const MOCK_INVESTIGATION_ID = 'cmrol9cxh0001rurb8godxnh6';
export const MOCK_FINDING_ID = 'cmrol9ijr004drurbren30ov6';

function world(index: number, origin: 'INITIAL' | 'ADAPTIVE_REPRODUCTION' | 'MINIMISATION', status: string, configuration: Record<string, unknown>): InvestigationWorld {
  const id = `world_${origin.toLowerCase()}_${index}`;
  return {
    id,
    investigationId: MOCK_INVESTIGATION_ID,
    name: `${origin.replaceAll('_', ' ')} ${index}`,
    status,
    reason: origin === 'MINIMISATION' ? 'Minimisation candidate' : 'Runtime comparison world',
    configuration: { ...configuration, ...(origin === 'INITIAL' ? {} : { origin }) },
    experimentId: `experiment_${index}`,
    workerId: `worker_${index}`,
    createdAt: FIXED_TIME,
    startedAt: FIXED_TIME,
    completedAt: FIXED_TIME,
  };
}

export class MockInvestigationApi implements InvestigationApi {
  private readonly projects: Project[] = [
    {
      id: 'project_demo_checkout',
      organisationId: 'organisation_demo_taskos',
      name: 'TaskOS Demo Commerce',
      description: 'A controlled commerce reliability target.',
      repositoryUrl: null,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    },
  ];

  private readonly worlds: InvestigationWorld[] = [
    world(1, 'INITIAL', 'PASSED', { browser: 'chromium', viewport: 'desktop', networkProfile: 'normal', paymentDelayMs: 0, doubleSubmit: false, duplicateSubmissionBug: false }),
    world(2, 'INITIAL', 'PASSED', { browser: 'chromium', viewport: 'desktop', networkProfile: 'delayed-payment', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: false }),
    world(3, 'INITIAL', 'FAILED', { browser: 'chromium', viewport: 'mobile', networkProfile: 'delayed-payment', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: true }),
    world(4, 'INITIAL', 'FAILED', { browser: 'webkit', viewport: 'mobile', networkProfile: 'delayed-payment', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: true }),
    world(5, 'ADAPTIVE_REPRODUCTION', 'FAILED', { adaptive: { purpose: 'EXACT_REPRODUCTION' }, browser: 'chromium', viewport: 'mobile', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: true }),
    world(6, 'ADAPTIVE_REPRODUCTION', 'PASSED', { adaptive: { purpose: 'CONTROL_DOUBLE_SUBMIT_DISABLED' }, browser: 'chromium', viewport: 'mobile', paymentDelayMs: 1200, doubleSubmit: false, duplicateSubmissionBug: true }),
    world(7, 'ADAPTIVE_REPRODUCTION', 'PASSED', { adaptive: { purpose: 'CONTROL_BUG_DISABLED' }, browser: 'chromium', viewport: 'mobile', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: false }),
    world(8, 'MINIMISATION', 'PASSED', { minimisation: { purpose: 'REMOVE_VIEWPORT', variable: 'viewport', conditionDecision: 'REMOVED' }, browser: 'chromium', viewport: 'desktop', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: true }),
    world(9, 'MINIMISATION', 'PASSED', { minimisation: { purpose: 'REMOVE_NETWORK_PROFILE', variable: 'networkProfile', conditionDecision: 'REMOVED' }, browser: 'chromium', viewport: 'desktop', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: true }),
    world(10, 'MINIMISATION', 'PASSED', { minimisation: { purpose: 'OTHER_CONTROL', variable: 'networkProfile', conditionDecision: 'INCONCLUSIVE' }, browser: 'chromium', viewport: 'desktop', paymentDelayMs: 600, doubleSubmit: true, duplicateSubmissionBug: true }),
    world(11, 'MINIMISATION', 'PASSED', { minimisation: { purpose: 'OTHER_CONTROL', variable: 'networkProfile', conditionDecision: 'INCONCLUSIVE' }, browser: 'chromium', viewport: 'desktop', paymentDelayMs: 900, doubleSubmit: true, duplicateSubmissionBug: true }),
    world(12, 'MINIMISATION', 'FAILED', { minimisation: { purpose: 'TEST_PAYMENT_DELAY', variable: 'paymentDelayMs', conditionDecision: 'RETAINED' }, browser: 'chromium', viewport: 'desktop', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: true }),
    world(13, 'MINIMISATION', 'FAILED', { minimisation: { purpose: 'CONFIRM_MINIMAL_SET', variable: 'paymentDelayMs', conditionDecision: 'RETAINED' }, browser: 'chromium', viewport: 'desktop', paymentDelayMs: 1200, doubleSubmit: true, duplicateSubmissionBug: true }),
  ];

  async listProjects() {
    return this.projects;
  }

  async createProject(input: {
    name: string;
    description: string | null;
    repositoryUrl: string | null;
  }) {
    const item = {
      id: `project_mock_${this.projects.length + 1}`,
      organisationId: 'organisation_demo_taskos',
      ...input,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    };
    this.projects.push(item);
    return item;
  }

  async createInvestigation(input: CreateInvestigationInput): Promise<InvestigationProgress> {
    createInvestigationInputSchema.parse(input);
    return this.progress(MOCK_INVESTIGATION_ID);
  }

  async getInvestigation(investigationId: string): Promise<InvestigationProgress> {
    return this.progress(investigationId);
  }

  async getExperimentPlan(_investigationId: string): Promise<ExperimentPlanResponse> {
    return {
      objective: 'Determine whether delayed payment responses and repeated checkout actions can create duplicate payments or orders.',
      journeyId: 'journey_checkout',
      scenarioId: 'scenario_duplicate_submission',
      worldPack: 'commerce-checkout',
      selectedVariables: ['duplicateSubmissionBug', 'doubleSubmit', 'paymentDelayMs', 'viewport'],
      initialWorldCount: 4,
      maximumWorldCount: 13,
      maximumConcurrentWorkers: 2,
      timeoutSeconds: 120,
      retryCount: 0,
      safetyConstraints: [{ type: 'target', value: 'demo-store', description: 'Use the deterministic demo store only.' }],
      invariants: [
        { id: 'invariant_payment', type: 'NO_DUPLICATE_PAYMENT', severity: 'CRITICAL' },
        { id: 'invariant_order', type: 'NO_DUPLICATE_ORDER', severity: 'CRITICAL' },
      ],
      worlds: this.worlds.slice(0, 4).map((item, index) => {
        const configuration = item.configuration && typeof item.configuration === 'object' && !Array.isArray(item.configuration) ? item.configuration as Record<string, unknown> : {};
        return {
        ...configuration,
        id: `planned_world_${index + 1}`,
        reason: item.reason,
        userProfile: configuration.doubleSubmit ? 'impatient' : 'normal',
        networkProfile: typeof configuration.networkProfile === 'string' ? configuration.networkProfile : 'normal',
        latencyMs: 0,
        bandwidthKbps: 10_000,
        paymentDelayMs: typeof configuration.paymentDelayMs === 'number' ? configuration.paymentDelayMs : 0,
        retryIntervalMs: 100,
        doubleSubmit: Boolean(configuration.doubleSubmit),
        webhookOrder: [],
        injectedFaults: [],
        randomSeed: 100 + index,
        };
      }),
      planningExplanation: 'A validated deterministic fallback plan compares healthy, delayed, and defective checkout worlds.',
      aiProvider: 'FALLBACK',
      estimatedComputeUnits: 4,
      plannerStatus: 'FALLBACK_USED',
      plannerMetadata: {
        requestedProvider: 'OPENAI',
        effectiveProvider: 'DETERMINISTIC',
        assumptions: ['The demo store implements the runtime checkout contract.'],
        warnings: ['OpenAI planning unavailable in mock mode.'],
        rejectedPlanItems: [],
        fallbackReason: 'OpenAI planning was unavailable or invalid. A validated deterministic plan was used instead.',
      },
    };
  }

  async getWorlds(_investigationId: string): Promise<InvestigationWorld[]> {
    return this.worlds;
  }

  async getExperiments(_investigationId: string): Promise<InvestigationExperiment[]> {
    return this.worlds.map((item, index) => ({
      id: item.experimentId ?? `experiment_${index + 1}`,
      investigationId: item.investigationId,
      worldId: item.id,
      status: index < 7 || index === 7 || index === 8 || index === 9 || index === 10 ? 'PASSED' : 'FAILED',
      kind: item.configuration && typeof item.configuration === 'object' && !Array.isArray(item.configuration) && (item.configuration as Record<string, unknown>).origin === 'MINIMISATION' ? 'MINIMISATION' : 'INITIAL',
      attemptCount: 1,
      latestAttempt: { id: `attempt_${index + 1}`, startedAt: item.startedAt, completedAt: item.completedAt, exitCode: index < 2 ? 0 : 2, durationMs: 2100 + index },
      createdAt: item.createdAt,
      updatedAt: FIXED_TIME,
    }));
  }

  async getWorkers(_investigationId: string): Promise<InvestigationWorker[]> {
    return this.worlds.map((item, index) => ({
      id: item.workerId ?? `worker_${index + 1}`,
      provider: 'LOCAL',
      status: 'COMPLETED',
      attempts: [{
        id: `attempt_${index + 1}`,
        status: index < 7 ? 'PASSED' : index < 11 ? 'PASSED' : 'FAILED',
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        exitCode: index < 7 ? 0 : 2,
        durationMs: 2100 + index,
        experiment: { investigationId: item.investigationId, worldId: item.id },
      }],
      createdAt: item.createdAt,
      updatedAt: FIXED_TIME,
    }));
  }

  async getEvidence(_investigationId: string): Promise<EvidenceArtifactResponse[]> {
    const types = ['SCREENSHOT', 'TRACE', 'CONSOLE_LOG', 'NETWORK_LOG', 'WORKER_RESULT', 'ENVIRONMENT_MANIFEST', 'DOM_SNAPSHOT'] as const;
    const artifacts: EvidenceArtifactResponse[] = this.worlds.flatMap((item, index) =>
      types.map((type, offset) => ({
        id: `evidence_${index + 1}_${type.toLowerCase()}`,
        experimentId: item.experimentId ?? `experiment_${index + 1}`,
        type,
        path: `${item.id}/${type.toLowerCase()}.${type === 'TRACE' ? 'zip' : 'json'}`,
        mimeType: type === 'TRACE' ? 'application/zip' : 'application/json',
        sizeBytes: 1000 + offset,
        checksum: `checksum-${index}-${offset}`,
        redacted: true,
        metadata: { filename: `${type.toLowerCase()}.${type === 'TRACE' ? 'zip' : 'json'}`, worldId: item.id },
        createdAt: FIXED_TIME,
      })),
    );
    artifacts.push(
      {
        id: 'cmrola2p000fgrurbry3xvnhj',
        experimentId: 'experiment_3',
        type: 'FINAL_REPORT',
        path: `reports/${MOCK_INVESTIGATION_ID}/${MOCK_FINDING_ID}/final-report.json`,
        mimeType: 'application/json',
        sizeBytes: 9219,
        checksum: 'safe-json-checksum',
        redacted: true,
        metadata: { filename: 'final-report.json', findingId: MOCK_FINDING_ID, reportVersion: '2026-07-17.prompt8.v1' },
        createdAt: FIXED_TIME,
      },
      {
        id: 'cmrola2pf00firurb7yjm6kt6',
        experimentId: 'experiment_3',
        type: 'FINAL_REPORT',
        path: `reports/${MOCK_INVESTIGATION_ID}/${MOCK_FINDING_ID}/final-report.md`,
        mimeType: 'text/markdown',
        sizeBytes: 6234,
        checksum: 'safe-md-checksum',
        redacted: true,
        metadata: { filename: 'final-report.md', findingId: MOCK_FINDING_ID, reportVersion: '2026-07-17.prompt8.v1' },
        createdAt: FIXED_TIME,
      },
    );
    return artifacts;
  }

  async getEvidenceTextContent(investigationId: string, evidenceId: string): Promise<EvidenceTextContentResponse> {
    if (evidenceId === 'cmrola2p000fgrurbry3xvnhj') {
      return {
        evidenceId,
        investigationId,
        type: 'FINAL_REPORT',
        format: 'JSON',
        filename: 'final-report.json',
        contentType: 'application/json',
        sizeBytes: 180,
        checksum: 'safe-json-checksum',
        content: JSON.stringify({
          reportVersion: '2026-07-17.prompt8.v1',
          summary: 'Duplicate checkout submission reproduced under delayed payment.',
          businessImpact: 'Duplicate payment and order activity can occur for one checkout intent.',
          retainedConditions: { duplicateSubmissionBug: true, doubleSubmit: true },
          removedConditions: { viewport: 'mobile-390x844' },
          boundedRange: { knownFailingDelayMs: 1200, targetPrecisionMs: 100 },
          reproductionSteps: ['Open product', 'Submit payment twice'],
          limitations: ['Applies to the deterministic checkout fixture.'],
        }, null, 2),
      };
    }
    return {
      evidenceId,
      investigationId,
      type: 'FINAL_REPORT',
      format: 'MARKDOWN',
      filename: 'final-report.md',
      contentType: 'text/markdown',
      sizeBytes: 120,
      checksum: 'safe-md-checksum',
      content: '# Final report\n\nDuplicate checkout submission reproduced under delayed payment.\n\n<script>alert("blocked")</script>',
    };
  }

  async listFindings(investigationId: string): Promise<Finding[]> {
    return [this.finding(investigationId)];
  }

  async getFindingDetail(investigationId: string, findingId: string): Promise<FindingDetail> {
    return {
      ...this.finding(investigationId, findingId),
      evidence: (await this.getEvidence(investigationId)).filter((item) => item.type === 'FINAL_REPORT' || item.experimentId === 'experiment_3'),
      reproductions: [
        { id: 'repro_run_348dffba4cb420d2ef49', findingId, experimentId: 'experiment_5', reproduced: true, createdAt: FIXED_TIME },
        { id: 'repro_run_control_1', findingId, experimentId: 'experiment_6', reproduced: false, createdAt: FIXED_TIME },
      ],
      minimalReproduction: null,
    };
  }

  private finding(investigationId: string, id = MOCK_FINDING_ID): Finding {
    return {
      id,
      investigationId,
      title: 'Duplicate checkout submission under delayed payment response',
      summary: 'A repeated submit while the first delayed payment was pending emitted duplicate payment and order requests.',
      severity: 'CRITICAL',
      confidence: 'CONFIRMED',
      reproductionCount: 7,
      causalConditions: {
        causalStatus: 'SUPPORTED',
        businessImpact: 'A customer can create duplicate payment and order activity for one checkout attempt.',
        sourceWorldId: 'world_initial_3',
        sourceExperimentId: 'experiment_3',
        failedInvariantIds: ['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER'],
        retainedConditions: { duplicateSubmissionBug: true, doubleSubmit: true, userProfile: 'impatient' },
        removedConditions: { viewport: 'mobile-390x844', networkProfile: 'delayed-payment' },
        inconclusiveConditions: {},
        boundedRange: { knownFailingDelayMs: 1200, targetPrecisionMs: 100, testedPointsMs: [1200] },
        reproductionSteps: ['Open the test product.', 'Add it to cart.', 'Open checkout.', 'Enter email.', 'Click Pay twice quickly.', 'Observe duplicate payment and order requests.'],
        confidenceExplanation: 'Seven deterministic reproductions and controls support the finding within the tested fixture.',
        causalSequence: ['Delayed payment response', 'Repeated checkout submission', 'Duplicate payment request', 'Duplicate order'],
        limitations: ['Greedy minimisation was used.', 'The boundary is bounded rather than an exact threshold.', 'The result is fixture-specific.'],
        finalReportEvidenceId: 'cmrola2p000fgrurbry3xvnhj',
        finalReportMarkdownEvidenceId: 'cmrola2pf00firurb7yjm6kt6',
        minimisationRunId: 'min_run_179623b1052669254ba2',
      },
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    };
  }

  private progress(id: string): InvestigationProgress {
    return investigationProgressSchema.parse({
      id,
      status: 'COMPLETED',
      progress: { totalWorlds: 13, queued: 0, running: 0, passed: 7, failed: 6, flaky: 0 },
      recentEvents: [
        { id: 'event_final_report_completed', investigationId: id, type: 'final_report_completed', message: 'Final evidence report completed.', createdAt: FIXED_TIME, metadata: { finalReportEvidenceId: 'cmrola2p000fgrurbry3xvnhj' } },
        { id: 'event_minimisation_completed', investigationId: id, type: 'minimisation_completed', message: 'Minimisation completed.', createdAt: FIXED_TIME, metadata: { minimisationRunId: 'min_run_179623b1052669254ba2' } },
        { id: 'event_reproduction_completed', investigationId: id, type: 'reproduction_completed', message: 'Adaptive reproduction completed.', createdAt: FIXED_TIME, metadata: { reproduced: true } },
      ],
      findingsCount: 1,
    });
  }
}
