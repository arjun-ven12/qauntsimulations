import type { WorkerResult } from '@taskos/execution-contracts';
import { logger } from '../../core/logging/logger.js';
import type { LocalEvidenceMetadataService } from '../evidence/local-evidence-metadata.service.js';
import { AdaptiveConfidenceService } from '../experiments/services/adaptive-confidence.service.js';
import { AdaptiveReproductionPlanService } from '../experiments/services/adaptive-reproduction-plan.service.js';
import type { FinalEvidenceReportService, FinalFindingReport } from '../experiments/services/final-evidence-report.service.js';
import { DeterministicMinimisationPlanService, type CandidateResult, type MinimisationCandidateDefinition, type MinimisationState } from '../experiments/services/minimisation.service.js';
import { ReproductionComparisonService, type ComparisonOutcome } from '../experiments/services/reproduction-comparison.service.js';
import type { InvestigationRepository } from '../investigations/investigations.repository.js';
import type { CreatedWorldRecord, InvestigationOrchestrationContext, MinimisationFindingCandidate, PersistedWorldExecution } from '../investigations/investigations.types.js';
import { ExecutionConcurrencyService } from './execution-concurrency.service.js';
import type { DaytonaWorkerFleet } from './daytona-worker-fleet.service.js';
import { classifyFleetError } from './daytona-retry-classifier.js';
import type { FleetEvent, FleetJob } from './daytona-fleet.types.js';
import type { WorkerExecutionEvent, WorkerExecutor } from './worker-executor.types.js';
import type { WorkerJobFactoryService } from './worker-job-factory.service.js';

type OrchestrationRepository = Pick<InvestigationRepository, 'orchestrationContext' | 'queueInitialWorlds' | 'eligibleAdaptiveFindings' | 'createAdaptiveWorlds' | 'adaptiveWorldResults' | 'updateFindingAfterAdaptive' | 'eligibleMinimisationFindings' | 'transitionToMinimising' | 'completeMinimisationStage' | 'createMinimisationRun' | 'createMinimisationCandidateWorld' | 'minimisationWorldResult' | 'updateMinimisationCandidate' | 'completeMinimisation' | 'recordMinimisationEvent' | 'transitionToRunning' | 'transitionToObserving' | 'transitionToAdapting' | 'transitionToReproducing' | 'completeAdaptiveStage' | 'beginWorld' | 'completeExecution' | 'failExecution' | 'finishInvestigation' | 'failInvestigation' | 'isCancelled' | 'recordExecutionEvent' | 'recordFleetEvent'>;

export interface DaytonaFleetOrchestratorOptions {
  perInvestigationLimit: number;
  serverWideLimit: number;
  maximumAttempts: number;
  retryBaseDelayMs: number;
  retryMaximumDelayMs: number;
  maximumTotalSandboxCreations: number;
  maximumInvestigationDurationSeconds: number;
}

export interface AdaptiveReproductionOptions {
  enabled: boolean;
  maximumFindingsPerInvestigation: number;
  maximumFollowupWorlds: number;
  maximumTotalWorlds: number;
  exactReproductionAttempts: number;
  confidenceInitial: number;
  confidenceMaximum: number;
  minimumEvidenceWorlds: number;
  timeoutSeconds: number;
}

export interface MinimisationOptions {
  enabled: boolean;
  maximumFindingsPerInvestigation: number;
  maximumTrials: number;
  maximumTotalWorlds: number;
  maximumDurationSeconds: number;
  maximumDelayTrials: number;
  delayTargetPrecisionMs: number;
  confirmFinalSet: boolean;
  confidenceMaximum: number;
  finalReportEnabled: boolean;
}

const defaultAdaptiveOptions: AdaptiveReproductionOptions = {
  enabled: false,
  maximumFindingsPerInvestigation: 1,
  maximumFollowupWorlds: 5,
  maximumTotalWorlds: 12,
  exactReproductionAttempts: 1,
  confidenceInitial: 0.75,
  confidenceMaximum: 0.95,
  minimumEvidenceWorlds: 2,
  timeoutSeconds: 900,
};

const defaultDaytonaFleetOptions: DaytonaFleetOrchestratorOptions = {
  perInvestigationLimit: 1,
  serverWideLimit: 1,
  maximumAttempts: 1,
  retryBaseDelayMs: 1_000,
  retryMaximumDelayMs: 10_000,
  maximumTotalSandboxCreations: 4,
  maximumInvestigationDurationSeconds: 1_200,
};

const defaultMinimisationOptions: MinimisationOptions = {
  enabled: false,
  maximumFindingsPerInvestigation: 1,
  maximumTrials: 8,
  maximumTotalWorlds: 20,
  maximumDurationSeconds: 1_200,
  maximumDelayTrials: 4,
  delayTargetPrecisionMs: 100,
  confirmFinalSet: true,
  confidenceMaximum: 0.97,
  finalReportEnabled: true,
};

const retryableErrorCodes = [
  'DAYTONA_SANDBOX_CREATION_FAILED',
  'DAYTONA_SANDBOX_NOT_READY',
  'DAYTONA_UPLOAD_FAILED',
  'DAYTONA_TRANSIENT_NETWORK_ERROR',
  'DAYTONA_COMMAND_TRANSPORT_ERROR',
  'DAYTONA_ARTIFACT_DOWNLOAD_FAILED',
  'DAYTONA_RATE_LIMITED',
];

export class InvestigationOrchestratorService {
  private readonly active = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: OrchestrationRepository,
    private readonly executor: WorkerExecutor,
    private readonly jobs: WorkerJobFactoryService,
    private readonly evidence: LocalEvidenceMetadataService,
    private readonly concurrency = new ExecutionConcurrencyService(2),
    private readonly fleet?: DaytonaWorkerFleet,
    private readonly fleetOptions: DaytonaFleetOrchestratorOptions = defaultDaytonaFleetOptions,
    private readonly adaptiveOptions: AdaptiveReproductionOptions = defaultAdaptiveOptions,
    private readonly adaptivePlans = new AdaptiveReproductionPlanService(),
    private readonly adaptiveComparison = new ReproductionComparisonService(),
    private readonly minimisationOptions: MinimisationOptions = defaultMinimisationOptions,
    private readonly minimisationPlans = new DeterministicMinimisationPlanService(),
    private readonly finalReports?: FinalEvidenceReportService,
  ) {}

  start(investigationId: string): void {
    if (this.active.has(investigationId)) return;
    const task = this.run(investigationId)
      .catch(async (error) => {
        logger.error({ err: error, investigationId, provider: this.executor.provider, status: 'FAILED' }, 'Investigation orchestration failed');
        await this.repository.failInvestigation(investigationId, error);
      })
      .finally(() => this.active.delete(investigationId));
    this.active.set(investigationId, task);
  }

  isActive(investigationId: string): boolean { return this.active.has(investigationId); }

  private async run(investigationId: string): Promise<void> {
    if (await this.repository.isCancelled(investigationId)) return;
    const context = await this.repository.orchestrationContext(investigationId);
    if (!context) throw new Error('Persisted investigation plan is missing');
    const worlds = await this.repository.queueInitialWorlds(context);
    await this.repository.transitionToRunning(investigationId);
    const maximumConcurrency = this.effectiveConcurrency(context, worlds.length);
    logger.info({ investigationId, provider: this.executor.provider, worldCount: worlds.length, maximumConcurrency, status: 'RUNNING' }, 'Investigation started');

    const executions = this.executor.provider === 'DAYTONA' && this.fleet
      ? (await this.executeDaytonaFleet(context, worlds, maximumConcurrency)).results.map((result) => ({ item: result, result: result.status === 'PASSED' || result.status === 'INVARIANT_VIOLATION' }))
      : await this.executeLocalWorlds(context, worlds, maximumConcurrency);

    if (await this.repository.isCancelled(investigationId)) return;
    if (executions.length > 0 && executions.every(({ result }) => result === false)) throw new Error('All workers failed to produce a processable result');
    await this.repository.transitionToObserving(investigationId);
    if (this.adaptiveOptions.enabled) await this.runAdaptiveReproduction(context);
    if (this.minimisationOptions.enabled) await this.runMinimisation(context);
    if (await this.repository.isCancelled(investigationId)) return;
    await this.repository.finishInvestigation(investigationId);
    logger.info({ investigationId, provider: this.executor.provider, status: 'COMPLETED' }, 'Investigation completed');
  }

  private async runAdaptiveReproduction(context: InvestigationOrchestrationContext): Promise<void> {
    const candidates = await this.repository.eligibleAdaptiveFindings(context.id, this.adaptiveOptions.maximumFindingsPerInvestigation);
    for (const candidate of candidates) {
      if (await this.repository.isCancelled(context.id)) return;
      await this.repository.transitionToAdapting(context.id, candidate.id);
      const remainingWorldBudget = Math.max(0, this.adaptiveOptions.maximumTotalWorlds - context.plan.worlds.length);
      const maximumWorlds = Math.min(this.adaptiveOptions.maximumFollowupWorlds, remainingWorldBudget);
      if (maximumWorlds <= 0) {
        await this.repository.recordFleetEvent(context.id, {
          phase: 'adaptive_plan_skipped',
          message: 'Adaptive reproduction skipped because the world limit was reached.',
          metadata: { findingId: candidate.id, maximumTotalWorlds: this.adaptiveOptions.maximumTotalWorlds },
        });
        await this.repository.completeAdaptiveStage(context.id, candidate.id, 'not-created');
        continue;
      }
      const plan = this.adaptivePlans.create({
        investigationId: context.id,
        findingId: candidate.id,
        findingFingerprint: candidate.fingerprint,
        sourceWorldId: candidate.sourceWorldId,
        sourceExperimentId: candidate.sourceExperimentId,
        sourceWorld: candidate.sourceWorld,
        maximumWorlds,
      });
      const reproductionRunId = plan.generatedWorlds[0]?.adaptive.reproductionRunId ?? plan.id;
      const worlds = await this.repository.createAdaptiveWorlds(context, plan);
      await this.repository.transitionToReproducing(context.id, candidate.id, reproductionRunId);
      const maximumConcurrency = this.effectiveConcurrency(context, worlds.length);
      if (this.executor.provider === 'DAYTONA' && this.fleet) {
        await this.executeDaytonaFleet(context, worlds, maximumConcurrency);
      } else {
        await this.executeLocalWorlds(context, worlds, maximumConcurrency);
      }
      if (await this.repository.isCancelled(context.id)) return;
      const results = await this.repository.adaptiveWorldResults(context.id, reproductionRunId);
      const outcomes = results.map((result) => ({
        worldId: result.worldId,
        experimentId: result.experimentId,
        purpose: result.purpose,
        world: result.world,
        outcome: this.comparisonOutcome(result.status, result.invariantEvaluationIds.length),
        invariantEvaluationIds: result.invariantEvaluationIds,
        evidenceArtifactIds: result.evidenceArtifactIds,
      }));
      const comparison = this.adaptiveComparison.compare(candidate.sourceWorld, outcomes, candidate.sourceWorldId);
      const previousConfidence = typeof candidate.causalConditions.numericConfidence === 'number'
        ? candidate.causalConditions.numericConfidence
        : this.adaptiveOptions.confidenceInitial;
      const confidence = new AdaptiveConfidenceService({
        initialConfidence: this.adaptiveOptions.confidenceInitial,
        maximumConfidence: this.adaptiveOptions.confidenceMaximum,
      }).update(previousConfidence, comparison, outcomes);
      await this.repository.updateFindingAfterAdaptive({
        findingId: candidate.id,
        reproductionRunId,
        plan,
        comparison,
        previousConfidence: confidence.previousConfidence,
        updatedConfidence: confidence.updatedConfidence,
        confidenceLabel: confidence.confidenceLabel,
        confidenceExplanation: confidence.explanation,
        reproducedIncrement: confidence.reproducedIncrement,
      });
      await this.repository.completeAdaptiveStage(context.id, candidate.id, reproductionRunId);
    }
  }

  private async runMinimisation(context: InvestigationOrchestrationContext): Promise<void> {
    const startedAt = Date.now();
    const candidates = await this.repository.eligibleMinimisationFindings(
      context.id,
      this.minimisationOptions.maximumFindingsPerInvestigation,
      this.minimisationOptions.maximumTotalWorlds,
    );
    for (const candidate of candidates) {
      if (await this.repository.isCancelled(context.id)) return;
      if (Date.now() - startedAt > this.minimisationOptions.maximumDurationSeconds * 1_000) return;
      await this.repository.transitionToMinimising(context.id, candidate.id);
      const plan = this.minimisationPlans.create({
        investigationId: context.id,
        findingId: candidate.id,
        findingFingerprint: candidate.fingerprint,
        sourceWorldId: candidate.sourceWorldId,
        sourceExperimentId: candidate.sourceExperimentId,
        reproductionRunId: candidate.reproductionRunId,
        sourceWorld: candidate.sourceWorld,
        causalConditions: candidate.causalConditions,
        maximumTrials: this.minimisationOptions.maximumTrials,
        targetPrecisionMs: this.minimisationOptions.delayTargetPrecisionMs,
      });
      const persisted = await this.repository.createMinimisationRun(plan);
      if (persisted.run.status === 'COMPLETED' && persisted.run.finalReportEvidenceId) {
        await this.repository.completeMinimisationStage(context.id, candidate.id, plan.id, 'COMPLETED');
        continue;
      }
      let state = this.minimisationPlans.initialState(plan);
      state = {
        ...state,
        retainedConditions: persisted.run.retainedConditions,
        removedConditions: persisted.run.removedConditions,
        inconclusiveConditions: persisted.run.inconclusiveConditions,
        completedTrials: persisted.run.completedTrials,
        delayRange: this.delayRange(
          persisted.run.knownPassingDelayMs ?? state.delayRange.lowerPassingBoundMs,
          persisted.run.knownFailingDelayMs ?? state.delayRange.upperFailingBoundMs,
        ),
      };

      const categorical = this.minimisationPlans.categoricalCandidates(plan, state);
      for (const definition of categorical) {
        if (await this.repository.isCancelled(context.id)) {
          await this.repository.completeMinimisationStage(context.id, candidate.id, plan.id, 'CANCELLED');
          return;
        }
        if (state.completedTrials >= this.minimisationOptions.maximumTrials) break;
        state = await this.runMinimisationCandidate(context, state, definition);
      }

      let delayTrials = 0;
      while (state.completedTrials < this.minimisationOptions.maximumTrials && delayTrials < this.minimisationOptions.maximumDelayTrials) {
        const next = this.minimisationPlans.nextDelayCandidate(plan, state, state.completedTrials + 1);
        if (!next) break;
        delayTrials++;
        state = await this.runMinimisationCandidate(context, state, next);
      }

      let confirmationWorldId: string | undefined;
      let confirmationReproduced = false;
      if (this.minimisationOptions.confirmFinalSet && state.completedTrials < this.minimisationOptions.maximumTrials) {
        const confirmation = this.minimisationPlans.confirmationCandidate(plan, state, state.completedTrials + 1);
        const before = state;
        state = await this.runMinimisationCandidate(context, state, confirmation);
        confirmationWorldId = confirmation.world.key;
        confirmationReproduced = state === before ? false : true;
        const result = await this.repository.minimisationWorldResult(confirmation.id);
        confirmationWorldId = result?.worldId ?? confirmationWorldId;
        confirmationReproduced = Boolean(result && this.minimisationResult(result.status, result.invariantEvaluationIds.length) === 'FAILURE_REPRODUCED');
      }

      const boundedRangeEstablished = state.delayRange.lowerPassingBoundMs !== undefined && state.delayRange.upperFailingBoundMs !== undefined;
      const confidence = this.minimisationPlans.updateConfidence({
        previousConfidence: candidate.numericConfidence,
        retainedCount: Object.keys(state.retainedConditions).length,
        removedCount: Object.keys(state.removedConditions).length,
        boundedRangeEstablished,
        finalConfirmationReproduced: confirmationReproduced,
        maximumConfidence: this.minimisationOptions.confidenceMaximum,
      });
      const report = this.minimisationOptions.finalReportEnabled && this.finalReports
        ? await this.writeFinalReport(context, candidate, plan.id, state, confidence.previousConfidence, confidence.finalConfidence, confidence.explanation, confirmationWorldId, confirmationReproduced)
        : undefined;
      await this.repository.completeMinimisation({
        investigationId: context.id,
        findingId: candidate.id,
        runId: plan.id,
        finalConfiguration: state.currentConfiguration,
        retainedConditions: state.retainedConditions,
        removedConditions: state.removedConditions,
        inconclusiveConditions: state.inconclusiveConditions,
        boundedRange: state.delayRange,
        ...(confirmationWorldId ? { confirmationWorldId } : {}),
        confirmationReproduced,
        previousConfidence: confidence.previousConfidence,
        finalConfidence: confidence.finalConfidence,
        confidenceLabel: confidence.confidenceLabel,
        confidenceExplanation: confidence.explanation,
        ...(report ? { report } : {}),
      });
      await this.repository.completeMinimisationStage(context.id, candidate.id, plan.id, confirmationReproduced ? 'COMPLETED' : 'INCONCLUSIVE');
    }
  }

  private async runMinimisationCandidate(
    context: InvestigationOrchestrationContext,
    state: MinimisationState,
    definition: MinimisationCandidateDefinition,
  ): Promise<MinimisationState> {
    const created = await this.repository.createMinimisationCandidateWorld(context, definition);
    if (this.executor.provider === 'DAYTONA' && this.fleet) {
      await this.executeDaytonaFleet(context, [created.record], 1);
    } else {
      await this.executeLocalWorlds(context, [created.record], 1);
    }
    const result = await this.repository.minimisationWorldResult(definition.id);
    const candidateResult = result ? this.minimisationResult(result.status, result.invariantEvaluationIds.length) : 'INCONCLUSIVE';
    const decision = this.minimisationPlans.decide(state, definition, candidateResult);
    await this.repository.updateMinimisationCandidate({
      runId: definition.minimisationRunId,
      candidateId: definition.id,
      result: candidateResult,
      decision: decision.decision,
      invariantIds: result?.invariantEvaluationIds ?? [],
      evidenceArtifactIds: result?.evidenceArtifactIds ?? [],
      retainedConditions: decision.retainedConditions,
      removedConditions: decision.removedConditions,
      inconclusiveConditions: decision.inconclusiveConditions,
      currentConfiguration: decision.currentConfiguration,
      delayRange: decision.delayRange,
      explanation: decision.explanation,
    });
    return {
      retainedConditions: decision.retainedConditions,
      removedConditions: decision.removedConditions,
      inconclusiveConditions: decision.inconclusiveConditions,
      currentConfiguration: decision.currentConfiguration,
      completedTrials: state.completedTrials + 1,
      delayRange: decision.delayRange,
    };
  }

  private minimisationResult(status: string, failedInvariantCount: number): CandidateResult {
    if (failedInvariantCount > 0 || status === 'FAILED') return 'FAILURE_REPRODUCED';
    if (status === 'PASSED' || status === 'COMPLETED') return 'FAILURE_NOT_REPRODUCED';
    if (status === 'CANCELLED') return 'CANCELLED';
    if (status === 'ERROR') return 'EXECUTION_FAILED';
    return 'INCONCLUSIVE';
  }

  private delayRange(lowerPassingBoundMs: number | undefined, upperFailingBoundMs: number | undefined) {
    return {
      ...(lowerPassingBoundMs !== undefined ? { lowerPassingBoundMs } : {}),
      ...(upperFailingBoundMs !== undefined ? { upperFailingBoundMs } : {}),
      targetPrecisionMs: this.minimisationOptions.delayTargetPrecisionMs,
    };
  }

  private async writeFinalReport(
    context: InvestigationOrchestrationContext,
    candidate: MinimisationFindingCandidate,
    minimisationRunId: string,
    state: MinimisationState,
    initialConfidence: number,
    finalConfidence: number,
    confidenceExplanation: string[],
    confirmationWorldId: string | undefined,
    confirmationReproduced: boolean,
  ) {
    if (!this.finalReports) return undefined;
    await this.repository.recordMinimisationEvent(context.id, 'final_report_started', 'Final evidence report generation started.', { findingId: candidate.id, minimisationRunId });
    const report: FinalFindingReport = {
      reportVersion: '2026-07-17.prompt8.v1',
      investigationId: context.id,
      findingId: candidate.id,
      title: candidate.title,
      generatedAt: new Date().toISOString(),
      summary: 'A deterministic minimisation run identified the minimal tested condition set for duplicate checkout submission.',
      businessImpact: typeof candidate.causalConditions.businessImpact === 'string'
        ? candidate.causalConditions.businessImpact
        : 'A customer may create duplicate payment/order activity for one intended checkout in the tested fixture.',
      environment: {
        projectId: context.projectId,
        environmentId: context.environmentId,
        journeyId: context.journeyId,
      },
      originalObservation: {
        worldId: candidate.sourceWorldId,
        experimentId: candidate.sourceExperimentId,
        configuration: candidate.sourceWorld as unknown as Record<string, unknown>,
        invariantIds: candidate.invariantEvaluationIds,
      },
      reproduction: {
        reproductionRunId: candidate.reproductionRunId,
        reproductionCount: candidate.reproductionCount,
        outcome: 'SUPPORTED',
      },
      minimisation: {
        minimisationRunId,
        retainedConditions: state.retainedConditions,
        removedConditions: state.removedConditions,
        inconclusiveConditions: state.inconclusiveConditions,
        boundedRange: {
          lowerPassingBoundMs: state.delayRange.lowerPassingBoundMs,
          upperFailingBoundMs: state.delayRange.upperFailingBoundMs,
          targetPrecisionMs: state.delayRange.targetPrecisionMs,
        },
        ...(confirmationWorldId ? { confirmationWorldId } : {}),
        confirmed: confirmationReproduced,
        claimLevel: 'MINIMAL_TESTED_SET',
      },
      confidence: {
        initial: initialConfidence,
        final: finalConfidence,
        explanation: confidenceExplanation,
      },
      reproductionSteps: this.reproductionSteps(state),
      evidence: candidate.evidenceArtifactIds.map((id) => ({ id, type: 'SUPPORTING_EVIDENCE', description: 'Evidence from source or adaptive reproduction world.' })),
      limitations: [
        'Greedy single-variable removal may miss interacting condition combinations.',
        'The delay result is a bounded tested range, not an exact threshold.',
        'Results apply to this fixture, journey, and deterministic worker setup.',
        'No automatic repair or repair verification is included.',
      ],
      provenance: {
        plannerProvider: context.plan.planner?.effectiveProvider ?? 'DETERMINISTIC',
        workerProvider: this.executor.provider,
        reportGenerator: 'DETERMINISTIC',
      },
    };
    return { ...(await this.finalReports.write(report)), report };
  }

  private reproductionSteps(state: MinimisationState): string[] {
    const delay = state.delayRange.upperFailingBoundMs ?? state.currentConfiguration.paymentDelayMs;
    return [
      'Open the checkout product page.',
      ...(state.retainedConditions.duplicateSubmissionBug ? ['Enable duplicate-submission mode.'] : []),
      `Configure payment response delay at a tested failing value around ${delay} ms.`,
      'Add the product to the cart.',
      'Proceed to checkout.',
      'Enter a valid test email.',
      state.retainedConditions.doubleSubmit
        ? `Click Pay twice with the tested interval of ${state.currentConfiguration.doubleSubmitIntervalMs} ms.`
        : 'Click Pay using the tested interaction pattern.',
      'Observe the payment and order invariant results.',
    ];
  }

  private comparisonOutcome(status: string, failedInvariantCount: number): ComparisonOutcome {
    if (failedInvariantCount > 0 || status === 'FAILED') return 'FAIL';
    if (status === 'PASSED' || status === 'COMPLETED') return 'PASS';
    return 'INCONCLUSIVE';
  }

  private async executeDaytonaFleet(context: InvestigationOrchestrationContext, worlds: CreatedWorldRecord[], maximumConcurrency: number) {
    if (!this.fleet) throw new Error('Daytona fleet is not configured');
    const abort = new AbortController();
    const cancellationPoll = setInterval(() => {
      void this.repository.isCancelled(context.id).then((cancelled) => {
        if (cancelled) abort.abort();
      });
    }, 250);
    try {
      const jobs: FleetJob[] = worlds
        .slice()
        .sort((left, right) => left.definition.creationOrder - right.definition.creationOrder)
        .map((world) => ({
          investigationId: context.id,
          worldId: world.id,
          experimentId: world.experimentId,
          creationOrder: world.definition.creationOrder,
          executeAttempt: async ({ attemptNumber, maximumAttempts, signal, emitEvent }) => {
            const execution = await this.beginAttempt(context, world, attemptNumber, maximumAttempts);
            try {
              return await this.runExecution(context, world, execution, signal, emitEvent);
            } catch (error) {
              const classification = classifyFleetError(error);
              await this.repository.failExecution(execution, error, {
                errorCode: classification.code,
                retryable: classification.retryable,
                attemptNumber,
                maximumAttempts,
              });
              throw error;
            }
          },
          cancelUnstarted: async () => {
            await this.repository.recordFleetEvent(context.id, {
              phase: 'world_cancelled_before_start',
              message: `${world.definition.name} cancelled before execution started.`,
              worldId: world.id,
              experimentId: world.experimentId,
            });
          },
        }));
      return await this.fleet.executeMany(jobs, {
        investigationId: context.id,
        maximumConcurrency,
        retryPolicy: {
          maximumAttempts: this.fleetOptions.maximumAttempts,
          baseDelayMs: this.fleetOptions.retryBaseDelayMs,
          maximumDelayMs: this.fleetOptions.retryMaximumDelayMs,
          retryableErrorCodes,
        },
        maximumTotalSandboxCreations: this.fleetOptions.maximumTotalSandboxCreations,
        maximumDurationMs: this.fleetOptions.maximumInvestigationDurationSeconds * 1_000,
        cancellationSignal: abort.signal,
        emitEvent: (event) => this.repository.recordFleetEvent(context.id, event),
      });
    } finally {
      clearInterval(cancellationPoll);
    }
  }

  private async executeLocalWorlds(context: InvestigationOrchestrationContext, worlds: CreatedWorldRecord[], maximumConcurrency: number) {
    const executions = [];
    const batches = [worlds.slice(0, 1), worlds.slice(1, 2), worlds.slice(2)].filter((batch) => batch.length > 0);
    for (const batch of batches) {
      executions.push(...await this.concurrency.run(batch, maximumConcurrency, (world) => this.executeWorld(context, world, 1, 1), () => this.repository.isCancelled(context.id)));
    }
    return executions;
  }

  private effectiveConcurrency(context: InvestigationOrchestrationContext, worldCount: number): number {
    if (this.executor.provider !== 'DAYTONA') return context.plan.maximumConcurrentWorkers;
    return Math.max(1, Math.min(
      context.plan.maximumConcurrentWorkers,
      this.fleetOptions.perInvestigationLimit,
      this.fleetOptions.serverWideLimit,
      worldCount || 1,
    ));
  }

  private async executeWorld(context: InvestigationOrchestrationContext, world: CreatedWorldRecord, attemptNumber: number, maximumAttempts: number): Promise<boolean> {
    let execution: PersistedWorldExecution | null = null;
    try {
      execution = await this.beginAttempt(context, world, attemptNumber, maximumAttempts);
      if (!execution) return false;
      const response = await this.runExecution(context, world, execution);
      return response.result.status === 'PASSED' || response.result.status === 'INVARIANT_VIOLATION';
    } catch (error) {
      if (execution) await this.repository.failExecution(execution, error);
      logger.error({ err: error, investigationId: context.id, worldId: world.id, experimentId: world.experimentId, workerId: execution?.workerId, provider: this.executor.provider, status: 'FAILED' }, 'Worker failed');
      return false;
    }
  }

  private async beginAttempt(context: InvestigationOrchestrationContext, world: CreatedWorldRecord, attemptNumber: number, maximumAttempts: number): Promise<PersistedWorldExecution> {
    const execution = await this.repository.beginWorld(context, world, this.executor.provider, attemptNumber, maximumAttempts);
    if (!execution) throw new Error('Investigation was cancelled before world execution began');
    return execution;
  }

  private async runExecution(
    context: InvestigationOrchestrationContext,
    world: CreatedWorldRecord,
    execution: PersistedWorldExecution,
    signal?: AbortSignal,
    emitFleetEvent?: (event: FleetEvent) => Promise<void>,
  ) {
    const job = await this.jobs.create({ investigationId: context.id, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, environmentBaseUrl: execution.environmentBaseUrl, invariantId: execution.invariantId, world: execution.world });
    const response = await this.executor.execute(job, {
      investigationId: context.id,
      worldId: execution.worldId,
      experimentId: execution.experimentId,
      workerId: execution.workerId,
      evidenceDirectory: job.evidence.outputDirectory,
      isCancelled: async () => Boolean(signal?.aborted) || this.repository.isCancelled(context.id),
      emitEvent: async (event: WorkerExecutionEvent) => {
        await this.repository.recordExecutionEvent(execution, event);
        await emitFleetEvent?.({ ...event, worldId: world.id, experimentId: world.experimentId, workerId: execution.workerId });
      },
    });
    const artifacts = await this.evidence.collect(response.result);
    await this.repository.completeExecution({
      execution,
      result: response.result,
      exitCode: response.exitCode,
      artifacts,
      providerMetadata: response.providerMetadata,
      attemptNumber: execution.attemptNumber,
      maximumAttempts: execution.maximumAttempts,
      ...(response.stdoutSummary ? { stdoutSummary: response.stdoutSummary } : {}),
      ...(response.stderrSummary ? { stderrSummary: response.stderrSummary } : {}),
    });
    this.logCompletion(execution, response.result);
    return response;
  }

  private logCompletion(execution: PersistedWorldExecution, result: WorkerResult): void {
    logger.info({ investigationId: execution.investigationId, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, provider: execution.provider, status: result.status, durationMs: result.durationMs }, 'Worker completed');
  }
}
