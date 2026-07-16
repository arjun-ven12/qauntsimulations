import { dirname, join } from 'node:path';
import type { DatabaseClient, Prisma } from '@taskos/database';
import type { CreateInvestigationInput } from '@taskos/shared-types';
import type { DeterministicExperimentPlan } from '../experiments/services/deterministic-experiment-plan.service.js';
import type {
  CompletedExecutionInput,
  CreatedWorldRecord,
  InvestigationCreationScope,
  InvestigationOrchestrationContext,
  InvestigationProgressRecord,
  PersistedWorldExecution,
} from './investigations.types.js';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const messageData = (message: string, metadata: Record<string, unknown> = {}): Prisma.InputJsonValue => json({ message, ...metadata });

export class InvestigationRepository {
  constructor(private readonly database: DatabaseClient) {}

  async validateCreationScope(organisationId: string, input: CreateInvestigationInput): Promise<InvestigationCreationScope | null> {
    const [project, environment, journey, scenario, invariants] = await Promise.all([
      this.database.project.findFirst({ where: { id: input.projectId, organisationId, deletedAt: null }, select: { id: true } }),
      this.database.environment.findFirst({ where: { id: input.environmentId, projectId: input.projectId, deletedAt: null }, select: { id: true, baseUrl: true } }),
      this.database.journey.findFirst({ where: { id: input.journeyId, projectId: input.projectId, deletedAt: null }, select: { id: true } }),
      this.database.scenario.findFirst({ where: { id: 'scenario_duplicate_submission', projectId: input.projectId, deletedAt: null }, select: { id: true } }),
      this.database.invariant.findMany({ where: { id: { in: input.invariantIds }, projectId: input.projectId, organisationId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!project || !environment?.baseUrl || !journey || !scenario || invariants.length !== input.invariantIds.length) return null;
    return { organisationId, scenarioId: scenario.id, environmentBaseUrl: environment.baseUrl, invariantIds: invariants.map(({ id }) => id) };
  }

  async create(input: CreateInvestigationInput, scope: InvestigationCreationScope, plan: DeterministicExperimentPlan): Promise<string> {
    return this.database.$transaction(async (transaction) => {
      const investigation = await transaction.investigation.create({ data: {
        organisationId: scope.organisationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        journeyId: input.journeyId,
        scenarioId: scope.scenarioId,
        name: `Checkout investigation: ${input.scenario.prompt.slice(0, 120)}`,
        status: 'PLANNING',
        startedAt: new Date(),
      } });
      await transaction.experimentPlan.create({ data: {
        investigationId: investigation.id,
        journeyId: input.journeyId,
        scenarioId: scope.scenarioId,
        provider: 'MOCK',
        plan: json(plan),
        planningExplanation: plan.planningExplanation,
        estimatedComputeUnits: 0,
      } });
      await transaction.investigationEvent.create({ data: {
        investigationId: investigation.id,
        type: 'investigation_created',
        data: messageData('Investigation created and deterministic planning requested.', { status: 'PLANNING' }),
      } });
      return investigation.id;
    });
  }

  async orchestrationContext(id: string): Promise<InvestigationOrchestrationContext | null> {
    const record = await this.database.investigation.findUnique({ where: { id }, select: {
      id: true, organisationId: true, projectId: true, journeyId: true, scenarioId: true,
      environment: { select: { baseUrl: true } },
      plans: { orderBy: { version: 'desc' }, take: 1, select: { id: true, plan: true } },
    } });
    const persistedPlan = record?.plans[0];
    if (!record || !persistedPlan) return null;
    return { id: record.id, organisationId: record.organisationId, projectId: record.projectId, journeyId: record.journeyId, scenarioId: record.scenarioId, environmentBaseUrl: record.environment.baseUrl, planId: persistedPlan.id, plan: persistedPlan.plan as unknown as DeterministicExperimentPlan };
  }

  async queueInitialWorlds(context: InvestigationOrchestrationContext): Promise<CreatedWorldRecord[]> {
    return this.database.$transaction(async (transaction) => {
      const changed = await transaction.investigation.updateMany({ where: { id: context.id, status: 'PLANNING' }, data: { status: 'QUEUED' } });
      if (changed.count !== 1) throw new Error('Investigation is not in PLANNING state');
      await transaction.investigationEvent.create({ data: { investigationId: context.id, type: 'plan_created', data: messageData('Deterministic local experiment plan created.', { status: 'QUEUED', maximumConcurrentWorkers: context.plan.maximumConcurrentWorkers }) } });
      const created: CreatedWorldRecord[] = [];
      for (const definition of context.plan.worlds) {
        const world = await transaction.world.create({ data: { investigationId: context.id, experimentPlanId: context.planId, status: 'QUEUED', configuration: json(definition), reason: definition.reason, randomSeed: definition.randomSeed } });
        const experiment = await transaction.experiment.create({ data: { investigationId: context.id, worldId: world.id, status: 'QUEUED', kind: 'INITIAL' } });
        await transaction.investigationEvent.createMany({ data: [
          { investigationId: context.id, type: 'world_generated', data: json({ message: `${definition.name} generated.`, worldId: world.id, creationOrder: definition.creationOrder }) },
          { investigationId: context.id, type: 'world_queued', data: json({ message: `${definition.name} queued for local execution.`, worldId: world.id, experimentId: experiment.id }) },
        ] });
        created.push({ id: world.id, experimentId: experiment.id, definition });
      }
      return created;
    });
  }

  async transitionToRunning(id: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'RUNNING' } });
    if (changed.count !== 1) throw new Error('Investigation is not in QUEUED state');
  }

  async beginWorld(context: InvestigationOrchestrationContext, record: CreatedWorldRecord): Promise<PersistedWorldExecution | null> {
    return this.database.$transaction(async (transaction) => {
      const investigation = await transaction.investigation.findUnique({ where: { id: context.id }, select: { status: true } });
      if (!investigation || investigation.status === 'CANCELLED') return null;
      await transaction.world.update({ where: { id: record.id }, data: { status: 'RUNNING' } });
      await transaction.experiment.update({ where: { id: record.experimentId }, data: { status: 'RUNNING' } });
      const worker = await transaction.worker.create({ data: {
        organisationId: context.organisationId,
        providerId: 'LOCAL',
        status: 'RUNNING',
        lastHeartbeatAt: new Date(),
        metadata: json({ investigationId: context.id, worldId: record.id, experimentId: record.experimentId }),
      } });
      const attempt = await transaction.executionAttempt.create({ data: { experimentId: record.experimentId, workerId: worker.id, attempt: 1, status: 'RUNNING', provider: 'LOCAL', startedAt: new Date() } });
      await transaction.investigationEvent.create({ data: { investigationId: context.id, type: 'worker_started', data: json({ message: `${record.definition.name} started.`, status: 'RUNNING', worldId: record.id, experimentId: record.experimentId, workerId: worker.id }) } });
      return { investigationId: context.id, organisationId: context.organisationId, projectId: context.projectId, environmentBaseUrl: context.environmentBaseUrl, invariantId: context.plan.invariantIds[0]!, worldId: record.id, experimentId: record.experimentId, workerId: worker.id, attemptId: attempt.id, world: record.definition };
    });
  }

  async completeExecution(input: CompletedExecutionInput): Promise<void> {
    const { execution, result } = input;
    const isCompleted = result.status === 'PASSED' || result.status === 'INVARIANT_VIOLATION';
    const experimentStatus = result.status === 'PASSED' ? 'PASSED' : result.status === 'INVARIANT_VIOLATION' ? 'FAILED' : 'ERROR';
    await this.database.$transaction(async (transaction) => {
      await transaction.executionAttempt.update({ where: { id: execution.attemptId }, data: {
        status: experimentStatus,
        completedAt: new Date(result.completedAt),
        exitCode: input.exitCode,
        durationMs: result.durationMs,
        result: json(result),
        resultPath: join(dirname(result.evidence.manifestPath), 'worker-result.json'),
        evidenceManifestPath: result.evidence.manifestPath,
        metrics: json(result.metrics),
        ...(result.error ? { error: json(result.error) } : {}),
      } });
      await transaction.worker.update({ where: { id: execution.workerId }, data: { status: isCompleted ? 'COMPLETED' : 'FAILED', lastHeartbeatAt: new Date() } });
      await transaction.experiment.update({ where: { id: execution.experimentId }, data: { status: experimentStatus } });
      await transaction.world.update({ where: { id: execution.worldId }, data: { status: isCompleted ? 'COMPLETED' : 'FAILED' } });

      const artifactIds: string[] = [];
      for (const artifact of input.artifacts) {
        const created = await transaction.evidenceArtifact.create({ data: {
          experimentId: execution.experimentId,
          executionAttemptId: execution.attemptId,
          type: artifact.type,
          storageProvider: 'LOCAL',
          storageKey: artifact.storageKey,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.sizeBytes,
          ...(artifact.checksum ? { checksum: artifact.checksum } : {}),
          redacted: artifact.type === 'CONSOLE_LOG' || artifact.type === 'NETWORK_LOG',
          metadata: json({ workerId: execution.workerId, worldId: execution.worldId, investigationId: execution.investigationId, ...(artifact.metadata ?? {}) }),
        } });
        artifactIds.push(created.id);
      }

      const evaluationIds: string[] = [];
      for (const evaluation of result.invariantEvaluations) {
        const created = await transaction.invariantEvaluation.create({ data: {
          experimentId: execution.experimentId,
          invariantId: execution.invariantId,
          executionAttemptId: execution.attemptId,
          workerId: execution.workerId,
          passed: evaluation.passed,
          expected: json(evaluation.expected),
          observed: json({ type: evaluation.type, invariantResultId: evaluation.invariantId, value: evaluation.observed }),
          confidence: evaluation.confidence,
          evidenceReferences: json(evaluation.evidenceReferences),
          explanation: evaluation.explanation,
        } });
        evaluationIds.push(created.id);
        if (!evaluation.passed) await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'invariant_violated', data: json({ message: `${evaluation.type} was violated.`, worldId: execution.worldId, experimentId: execution.experimentId, evaluationId: created.id }) } });
      }

      await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: isCompleted ? 'worker_completed' : 'worker_failed', data: json({ message: `${execution.world.name} ${isCompleted ? 'completed' : 'failed to execute'}.`, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, workerStatus: result.status, durationMs: result.durationMs }) } });
      if (artifactIds.length) await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'evidence_captured', data: json({ message: `${artifactIds.length} evidence artifacts recorded.`, worldId: execution.worldId, experimentId: execution.experimentId, artifactCount: artifactIds.length }) } });

      if (result.invariantEvaluations.some((evaluation) => !evaluation.passed)) {
        const title = 'Duplicate checkout submission under delayed payment response';
        const fingerprint = `${execution.investigationId}:duplicate-checkout:journey_checkout:delayed-repeat`;
        const finding = await transaction.finding.upsert({ where: { fingerprint }, update: { reproductionCount: { increment: 1 } }, create: {
            fingerprint,
            organisationId: execution.organisationId,
            projectId: execution.projectId,
            investigationId: execution.investigationId,
            title,
            severity: 'CRITICAL',
            confidence: 'POSSIBLE',
            reproductionCount: 1,
            summary: 'An impatient repeated submission during a delayed payment response produced more than one payment request and more than one order request.',
            causalConditions: json({
              fingerprint,
              causalStatus: 'UNCONFIRMED',
              businessImpact: 'A customer may be charged or create orders more than once for one intended checkout. This run used test payments only.',
              firstDivergence: result.firstDivergence ?? null,
              worldId: execution.worldId,
              experimentId: execution.experimentId,
              minimalConditions: { paymentDelayMs: execution.world.paymentDelayMs, doubleSubmit: execution.world.doubleSubmit, duplicateSubmissionBug: execution.world.duplicateSubmissionBug },
              invariantEvaluationIds: evaluationIds,
              evidenceArtifactIds: artifactIds,
              numericConfidence: 0.75,
            }),
          } });
        if (finding.reproductionCount === 1) await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'finding_created', data: json({ message: title, worldId: execution.worldId, experimentId: execution.experimentId, findingId: finding.id }) } });
        if (artifactIds.length) await transaction.findingEvidence.createMany({ data: artifactIds.map((artifactId) => ({ findingId: finding.id, artifactId })), skipDuplicates: true });
      }
    });
  }

  async failExecution(execution: PersistedWorldExecution, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown local worker error';
    await this.database.$transaction(async (transaction) => {
      await transaction.executionAttempt.update({ where: { id: execution.attemptId }, data: { status: 'ERROR', completedAt: new Date(), error: json({ code: 'LOCAL_WORKER_ERROR', message }) } });
      await transaction.worker.update({ where: { id: execution.workerId }, data: { status: 'FAILED', lastHeartbeatAt: new Date() } });
      await transaction.experiment.update({ where: { id: execution.experimentId }, data: { status: 'ERROR' } });
      await transaction.world.update({ where: { id: execution.worldId }, data: { status: 'FAILED' } });
      await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'worker_failed', data: json({ message: 'Local worker execution failed.', worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, errorCode: 'LOCAL_WORKER_ERROR' }) } });
    });
  }

  async finishInvestigation(id: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const running = await transaction.investigation.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'OBSERVING' } });
      if (running.count !== 1) return;
      await transaction.investigation.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await transaction.investigationEvent.create({ data: { investigationId: id, type: 'investigation_completed', data: messageData('All initial worlds reached a terminal state and their evidence was processed.', { status: 'COMPLETED' }) } });
    });
  }

  async failInvestigation(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown orchestration error';
    await this.database.$transaction(async (transaction) => {
      await transaction.investigation.updateMany({ where: { id, status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] } }, data: { status: 'FAILED', completedAt: new Date() } });
      await transaction.investigationEvent.create({ data: { investigationId: id, type: 'investigation_failed', data: messageData('Investigation orchestration failed.', { status: 'FAILED', errorCode: 'ORCHESTRATION_FAILED', errorMessage: message }) } });
    });
  }

  async isCancelled(id: string): Promise<boolean> {
    return (await this.database.investigation.findUnique({ where: { id }, select: { status: true } }))?.status === 'CANCELLED';
  }

  async cancel(organisationId: string, id: string): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const changed = await transaction.investigation.updateMany({ where: { id, organisationId, status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] } }, data: { status: 'CANCELLED', completedAt: new Date() } });
      if (changed.count !== 1) return false;
      await transaction.world.updateMany({ where: { investigationId: id, status: { in: ['GENERATED', 'QUEUED'] } }, data: { status: 'CANCELLED' } });
      await transaction.experiment.updateMany({ where: { investigationId: id, status: 'QUEUED' }, data: { status: 'CANCELLED' } });
      await transaction.investigationEvent.create({ data: { investigationId: id, type: 'investigation_cancelled', data: messageData('Cancellation requested; queued local workers will not start.', { status: 'CANCELLED' }) } });
      return true;
    });
  }

  async markStaleLocalExecutions(staleBefore: Date): Promise<number> {
    const attempts = await this.database.executionAttempt.findMany({ where: { provider: 'LOCAL', status: 'RUNNING', startedAt: { lt: staleBefore } }, select: { id: true, workerId: true, experimentId: true, experiment: { select: { worldId: true, investigationId: true } } } });
    if (!attempts.length) return 0;
    await this.database.$transaction(async (transaction) => {
      for (const attempt of attempts) {
        await transaction.executionAttempt.update({ where: { id: attempt.id }, data: { status: 'ERROR', completedAt: new Date(), error: json({ code: 'API_PROCESS_RESTARTED', message: 'The in-process local worker was abandoned by an API process restart.' }) } });
        if (attempt.workerId) await transaction.worker.update({ where: { id: attempt.workerId }, data: { status: 'FAILED', lastHeartbeatAt: new Date() } });
        await transaction.experiment.update({ where: { id: attempt.experimentId }, data: { status: 'ERROR' } });
        await transaction.world.update({ where: { id: attempt.experiment.worldId }, data: { status: 'FAILED' } });
        await transaction.investigationEvent.create({ data: { investigationId: attempt.experiment.investigationId, type: 'worker_failed', data: messageData('A stale local worker was marked failed during startup cleanup.', { worldId: attempt.experiment.worldId, experimentId: attempt.experimentId, workerId: attempt.workerId, errorCode: 'API_PROCESS_RESTARTED' }) } });
      }
      for (const investigationId of new Set(attempts.map((attempt) => attempt.experiment.investigationId))) {
        await transaction.investigation.updateMany({ where: { id: investigationId, status: { in: ['QUEUED', 'RUNNING', 'OBSERVING'] } }, data: { status: 'FAILED', completedAt: new Date() } });
        await transaction.investigationEvent.create({ data: { investigationId, type: 'investigation_failed', data: messageData('Investigation could not resume after the API process stopped.', { errorCode: 'API_PROCESS_RESTARTED' }) } });
      }
    });
    return attempts.length;
  }

  async progress(organisationId: string, id: string): Promise<InvestigationProgressRecord | null> {
    const record = await this.database.investigation.findFirst({ where: { id, organisationId }, select: {
      id: true, status: true,
      worlds: { select: { id: true } },
      experiments: { select: { status: true } },
      events: { orderBy: { occurredAt: 'desc' }, take: 20, select: { id: true, type: true, occurredAt: true, data: true } },
      _count: { select: { findings: true } },
    } });
    return record ? { id: record.id, status: record.status, worlds: record.worlds, experiments: record.experiments, events: record.events, findingsCount: record._count.findings } : null;
  }

  async listWorlds(organisationId: string, id: string) {
    return this.database.world.findMany({ where: { investigationId: id, investigation: { organisationId } }, orderBy: { createdAt: 'asc' }, include: { experiments: { orderBy: { createdAt: 'asc' }, take: 1, include: { attempts: { orderBy: { attempt: 'desc' }, take: 1, select: { workerId: true, startedAt: true, completedAt: true } } } } } });
  }
  async listExperiments(organisationId: string, id: string) {
    return this.database.experiment.findMany({ where: { investigationId: id, investigation: { organisationId } }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { attempts: true } }, attempts: { orderBy: { attempt: 'desc' }, take: 1 } } });
  }
  async listWorkers(organisationId: string, id: string) {
    return this.database.worker.findMany({ where: { organisationId, attempts: { some: { experiment: { investigationId: id } } } }, orderBy: { createdAt: 'asc' }, include: { attempts: { where: { experiment: { investigationId: id } }, include: { experiment: { select: { worldId: true, investigationId: true } } } } } });
  }
  async listEvidence(organisationId: string, id: string) {
    return this.database.evidenceArtifact.findMany({ where: { experiment: { investigationId: id, investigation: { organisationId } } }, orderBy: { createdAt: 'asc' } });
  }
  async listFindings(organisationId: string, id: string) {
    return this.database.finding.findMany({ where: { investigationId: id, organisationId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }
}
