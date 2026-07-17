import { dirname, join } from 'node:path';
import type { DatabaseClient, Prisma } from '@taskos/database';
import type { CreateInvestigationInput } from '@taskos/shared-types';
import type { DeterministicExperimentPlan } from '../experiments/services/deterministic-experiment-plan.service.js';
import type {
  AdaptiveFindingCandidate,
  AdaptiveFindingUpdateInput,
  AdaptiveWorldResultRecord,
  CompletedExecutionInput,
  CreatedWorldRecord,
  InvestigationCreationScope,
  InvestigationOrchestrationContext,
  InvestigationProgressRecord,
  PersistedExecutionEvent,
  PersistedFleetEvent,
  PersistedWorldExecution,
} from './investigations.types.js';
import type { WorkerExecutionProvider } from '../execution/worker-executor.types.js';
import type { AdaptiveReproductionPlan } from '../experiments/services/adaptive-reproduction-plan.service.js';
import type { DeterministicWorldDefinition } from '../experiments/services/deterministic-experiment-plan.service.js';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const messageData = (message: string, metadata: Record<string, unknown> = {}): Prisma.InputJsonValue => json({ message, ...metadata });
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

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
      await transaction.investigationEvent.create({ data: { investigationId: context.id, type: 'plan_created', data: messageData('Deterministic experiment plan created.', { status: 'QUEUED', maximumConcurrentWorkers: context.plan.maximumConcurrentWorkers }) } });
      const created: CreatedWorldRecord[] = [];
      for (const definition of context.plan.worlds) {
        const world = await transaction.world.create({ data: { investigationId: context.id, experimentPlanId: context.planId, status: 'QUEUED', configuration: json(definition), reason: definition.reason, randomSeed: definition.randomSeed } });
        const experiment = await transaction.experiment.create({ data: { investigationId: context.id, worldId: world.id, status: 'QUEUED', kind: 'INITIAL' } });
        await transaction.investigationEvent.createMany({ data: [
          { investigationId: context.id, type: 'world_generated', data: json({ message: `${definition.name} generated.`, worldId: world.id, creationOrder: definition.creationOrder }) },
          { investigationId: context.id, type: 'world_queued', data: json({ message: `${definition.name} queued for execution.`, worldId: world.id, experimentId: experiment.id }) },
        ] });
        created.push({ id: world.id, experimentId: experiment.id, definition });
      }
      return created;
    });
  }

  async eligibleAdaptiveFindings(investigationId: string, limit: number): Promise<AdaptiveFindingCandidate[]> {
    const findings = await this.database.finding.findMany({
      where: { investigationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        conditions: true,
      },
    });
    const candidates: AdaptiveFindingCandidate[] = [];
    for (const finding of findings) {
      if (candidates.length >= limit) break;
      const conditions = record(finding.causalConditions);
      if (conditions.causalStatus && conditions.causalStatus !== 'UNCONFIRMED') continue;
      if (finding.conditions.some(({ kind }) => kind === 'ADAPTIVE_REPRODUCTION_COMPLETED')) continue;
      const sourceWorldId = typeof conditions.worldId === 'string' ? conditions.worldId : undefined;
      const sourceExperimentId = typeof conditions.experimentId === 'string' ? conditions.experimentId : undefined;
      if (!sourceWorldId || !sourceExperimentId) continue;
      const world = await this.database.world.findUnique({ where: { id: sourceWorldId }, select: { configuration: true, status: true } });
      const sourceWorld = record(world?.configuration) as unknown as DeterministicWorldDefinition;
      if (!world || world.status === 'CANCELLED' || world.status === 'QUEUED' || world.status === 'RUNNING') continue;
      if (sourceWorld.origin === 'ADAPTIVE_REPRODUCTION') continue;
      if (!sourceWorld.duplicateSubmissionBug || !sourceWorld.doubleSubmit) continue;
      candidates.push({
        id: finding.id,
        fingerprint: finding.fingerprint ?? finding.id,
        title: finding.title,
        confidence: finding.confidence,
        reproductionCount: finding.reproductionCount,
        causalConditions: conditions,
        sourceWorldId,
        sourceExperimentId,
        sourceWorld,
        invariantEvaluationIds: stringArray(conditions.invariantEvaluationIds),
        evidenceArtifactIds: stringArray(conditions.evidenceArtifactIds),
      });
    }
    await this.database.investigationEvent.create({
      data: {
        investigationId,
        type: 'follow_up_generated',
        data: messageData(`${candidates.length} adaptive reproduction candidate(s) found.`, { phase: 'adaptive_eligibility_checked', candidateCount: candidates.length }),
      },
    });
    return candidates;
  }

  async transitionToObserving(id: string, message = 'Initial worlds settled; observing validated findings.'): Promise<boolean> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'OBSERVING' } });
    if (changed.count === 1) {
      await this.database.investigationEvent.create({ data: { investigationId: id, type: 'follow_up_generated', data: messageData(message, { phase: 'observing_started', status: 'OBSERVING' }) } });
      return true;
    }
    return (await this.database.investigation.findUnique({ where: { id }, select: { status: true } }))?.status === 'OBSERVING';
  }

  async transitionToAdapting(id: string, findingId: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'OBSERVING' }, data: { status: 'ADAPTING' } });
    if (changed.count !== 1) throw new Error('Investigation is not in OBSERVING state');
    await this.database.investigationEvent.create({ data: { investigationId: id, type: 'reproduction_started', data: messageData('Adaptive reproduction started.', { status: 'ADAPTING', findingId }) } });
  }

  async transitionToReproducing(id: string, findingId: string, reproductionRunId: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'ADAPTING' }, data: { status: 'REPRODUCING' } });
    if (changed.count !== 1) throw new Error('Investigation is not in ADAPTING state');
    await this.database.investigationEvent.create({ data: { investigationId: id, type: 'reproduction_started', data: messageData('Adaptive follow-up worlds are running.', { status: 'REPRODUCING', findingId, reproductionRunId }) } });
  }

  async completeAdaptiveStage(id: string, findingId: string, reproductionRunId: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'REPRODUCING' }, data: { status: 'OBSERVING' } });
    if (changed.count === 1) {
      await this.database.investigationEvent.create({ data: { investigationId: id, type: 'follow_up_generated', data: messageData('Adaptive reproduction completed.', { phase: 'reproduction_completed', status: 'OBSERVING', findingId, reproductionRunId }) } });
    }
  }

  async createAdaptiveWorlds(context: InvestigationOrchestrationContext, plan: AdaptiveReproductionPlan): Promise<CreatedWorldRecord[]> {
    return this.database.$transaction(async (transaction) => {
      const existingWorlds = await transaction.world.findMany({ where: { investigationId: context.id }, include: { experiments: { orderBy: { createdAt: 'asc' }, take: 1 } } });
      const existingByPurpose = new Map<string, CreatedWorldRecord>();
      for (const world of existingWorlds) {
        const configuration = record(world.configuration) as unknown as DeterministicWorldDefinition;
        const adaptive = configuration.adaptive;
        if (adaptive && adaptive.reproductionRunId === plan.generatedWorlds[0]?.adaptive.reproductionRunId) {
          const experiment = world.experiments[0];
          if (experiment) existingByPurpose.set(adaptive.adaptivePurpose, { id: world.id, experimentId: experiment.id, definition: configuration });
        }
      }
      const created: CreatedWorldRecord[] = [];
      const alreadyStoredPlan = await transaction.findingCondition.findFirst({ where: { findingId: plan.findingId, kind: 'ADAPTIVE_REPRODUCTION_PLAN' } });
      if (!alreadyStoredPlan) {
        await transaction.findingCondition.create({ data: { findingId: plan.findingId, kind: 'ADAPTIVE_REPRODUCTION_PLAN', condition: json(plan) } });
        await transaction.investigationEvent.create({ data: { investigationId: context.id, type: 'follow_up_generated', data: messageData('Deterministic adaptive reproduction plan created.', { phase: 'adaptive_plan_created', findingId: plan.findingId, reproductionRunId: plan.generatedWorlds[0]?.adaptive.reproductionRunId, generatedWorldCount: plan.generatedWorlds.length }) } });
      }
      for (const definition of plan.generatedWorlds) {
        const existing = existingByPurpose.get(definition.adaptive.adaptivePurpose);
        if (existing) {
          created.push(existing);
          continue;
        }
        const world = await transaction.world.create({ data: { investigationId: context.id, experimentPlanId: context.planId, status: 'QUEUED', configuration: json(definition), reason: definition.reason, randomSeed: definition.randomSeed } });
        const experiment = await transaction.experiment.create({ data: { investigationId: context.id, worldId: world.id, status: 'QUEUED', kind: 'ADAPTIVE_REPRODUCTION' } });
        await transaction.investigationEvent.createMany({ data: [
          { investigationId: context.id, type: 'world_generated', data: json({ message: `${definition.name} generated.`, phase: 'adaptive_world_generated', worldId: world.id, experimentId: experiment.id, findingId: plan.findingId, reproductionRunId: definition.adaptive.reproductionRunId, adaptivePurpose: definition.adaptive.adaptivePurpose, changedVariables: definition.adaptive.changedVariables }) },
          { investigationId: context.id, type: 'world_queued', data: json({ message: `${definition.name} queued for adaptive reproduction.`, phase: 'reproduction_world_queued', worldId: world.id, experimentId: experiment.id, findingId: plan.findingId, reproductionRunId: definition.adaptive.reproductionRunId }) },
        ] });
        created.push({ id: world.id, experimentId: experiment.id, definition });
      }
      return created.sort((left, right) => left.definition.creationOrder - right.definition.creationOrder);
    });
  }

  async transitionToRunning(id: string): Promise<void> {
    const changed = await this.database.investigation.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'RUNNING' } });
    if (changed.count !== 1) throw new Error('Investigation is not in QUEUED state');
  }

  async beginWorld(context: InvestigationOrchestrationContext, record: CreatedWorldRecord, provider: WorkerExecutionProvider, attemptNumber = 1, maximumAttempts = 1): Promise<PersistedWorldExecution | null> {
    return this.database.$transaction(async (transaction) => {
      const investigation = await transaction.investigation.findUnique({ where: { id: context.id }, select: { status: true } });
      if (!investigation || investigation.status === 'CANCELLED') return null;
      await transaction.world.update({ where: { id: record.id }, data: { status: 'RUNNING' } });
      await transaction.experiment.update({ where: { id: record.experimentId }, data: { status: 'RUNNING' } });
      const worker = await transaction.worker.create({ data: {
        organisationId: context.organisationId,
        providerId: provider,
        status: 'RUNNING',
        lastHeartbeatAt: new Date(),
        metadata: json({ provider, investigationId: context.id, worldId: record.id, experimentId: record.experimentId, attemptNumber, maximumAttempts }),
      } });
      const attempt = await transaction.executionAttempt.create({ data: { experimentId: record.experimentId, workerId: worker.id, attempt: attemptNumber, status: 'RUNNING', provider, startedAt: new Date(), metrics: json({ attemptNumber, maximumAttempts, queuedAt: new Date().toISOString() }) } });
      await transaction.investigationEvent.create({ data: { investigationId: context.id, type: 'worker_started', data: json({ message: `${record.definition.name} attempt ${attemptNumber} started.`, provider, status: 'RUNNING', worldId: record.id, experimentId: record.experimentId, workerId: worker.id, attemptId: attempt.id, attemptNumber, maximumAttempts }) } });
      return { investigationId: context.id, organisationId: context.organisationId, projectId: context.projectId, environmentBaseUrl: context.environmentBaseUrl, invariantId: context.plan.invariantIds[0]!, worldId: record.id, experimentId: record.experimentId, workerId: worker.id, attemptId: attempt.id, world: record.definition, provider, attemptNumber, maximumAttempts };
    });
  }

  async recordExecutionEvent(execution: PersistedWorldExecution, event: PersistedExecutionEvent): Promise<void> {
    const type = event.phase.includes('evidence')
      ? 'evidence_captured'
      : event.phase.includes('worker_execution')
        ? 'experiment_started'
        : event.phase.includes('ready') || event.phase.includes('setup_completed')
          ? 'sandbox_ready'
          : 'sandbox_provisioning';
    await this.database.investigationEvent.create({ data: {
      investigationId: execution.investigationId,
      type,
      data: json({
        message: event.message,
        phase: event.phase,
        provider: execution.provider,
        worldId: execution.worldId,
        experimentId: execution.experimentId,
        workerId: execution.workerId,
        attemptId: execution.attemptId,
        attemptNumber: execution.attemptNumber,
        ...(event.sandboxId ? { sandboxId: event.sandboxId } : {}),
        ...(event.metadata ?? {}),
      }),
    } });
  }

  async recordFleetEvent(investigationId: string, event: PersistedFleetEvent): Promise<void> {
    const type = event.phase.includes('evidence')
      ? 'evidence_captured'
      : event.phase.includes('completed') || event.phase.includes('terminal')
        ? 'worker_completed'
        : event.phase.includes('failed')
          ? 'worker_failed'
          : event.phase.includes('ready') || event.phase.includes('capacity')
            ? 'sandbox_ready'
            : 'sandbox_provisioning';
    await this.database.investigationEvent.create({ data: {
      investigationId,
      type,
      data: json({
        message: event.message,
        phase: event.phase,
        ...(event.worldId ? { worldId: event.worldId } : {}),
        ...(event.experimentId ? { experimentId: event.experimentId } : {}),
        ...(event.workerId ? { workerId: event.workerId } : {}),
        ...(event.sandboxId ? { sandboxId: event.sandboxId } : {}),
        ...(event.metadata ?? {}),
      }),
    } });
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
        metrics: json({ ...result.metrics, providerMetadata: input.providerMetadata, attemptNumber: input.attemptNumber ?? execution.attemptNumber, maximumAttempts: input.maximumAttempts ?? execution.maximumAttempts }),
        provider: input.providerMetadata.provider,
        ...(input.stdoutSummary ? { stdoutSummary: input.stdoutSummary } : {}),
        ...(input.stderrSummary ? { stderrSummary: input.stderrSummary } : {}),
        ...(result.error ? { error: json(result.error) } : {}),
      } });
      await transaction.worker.update({ where: { id: execution.workerId }, data: {
        providerId: input.providerMetadata.provider,
        status: isCompleted ? 'COMPLETED' : 'FAILED',
        lastHeartbeatAt: new Date(),
        metadata: json({
          investigationId: execution.investigationId,
          worldId: execution.worldId,
          experimentId: execution.experimentId,
          attemptId: execution.attemptId,
          attemptNumber: input.attemptNumber ?? execution.attemptNumber,
          maximumAttempts: input.maximumAttempts ?? execution.maximumAttempts,
          ...input.providerMetadata,
        }),
      } });
      await transaction.experiment.update({ where: { id: execution.experimentId }, data: { status: experimentStatus } });
      await transaction.world.update({ where: { id: execution.worldId }, data: { status: isCompleted ? 'COMPLETED' : 'FAILED' } });

      const artifactIds: string[] = [];
      for (const artifact of input.artifacts) {
        const created = await transaction.evidenceArtifact.create({ data: {
          experimentId: execution.experimentId,
          executionAttemptId: execution.attemptId,
          type: artifact.type,
          storageProvider: input.providerMetadata.provider,
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

      await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: isCompleted ? 'worker_completed' : 'worker_failed', data: json({ message: `${execution.world.name} ${isCompleted ? 'completed' : 'failed to execute'}.`, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, attemptId: execution.attemptId, attemptNumber: input.attemptNumber ?? execution.attemptNumber, workerStatus: result.status, durationMs: result.durationMs }) } });
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

  async failExecution(execution: PersistedWorldExecution, error: unknown, metadata: Record<string, unknown> = {}): Promise<void> {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown local worker error';
    const code = typeof metadata.errorCode === 'string' ? metadata.errorCode : `${execution.provider}_WORKER_ERROR`;
    await this.database.$transaction(async (transaction) => {
      await transaction.executionAttempt.update({ where: { id: execution.attemptId }, data: { status: 'ERROR', completedAt: new Date(), error: json({ code, message, ...metadata }) } });
      await transaction.worker.update({ where: { id: execution.workerId }, data: { status: 'FAILED', lastHeartbeatAt: new Date() } });
      await transaction.experiment.update({ where: { id: execution.experimentId }, data: { status: 'ERROR' } });
      await transaction.world.update({ where: { id: execution.worldId }, data: { status: 'FAILED' } });
      await transaction.investigationEvent.create({ data: { investigationId: execution.investigationId, type: 'worker_failed', data: json({ message: `${execution.provider} worker execution failed.`, worldId: execution.worldId, experimentId: execution.experimentId, workerId: execution.workerId, attemptId: execution.attemptId, attemptNumber: execution.attemptNumber, errorCode: code, errorMessage: message, ...metadata }) } });
    });
  }

  async adaptiveWorldResults(investigationId: string, reproductionRunId: string): Promise<AdaptiveWorldResultRecord[]> {
    const worlds = await this.database.world.findMany({
      where: { investigationId },
      orderBy: { createdAt: 'asc' },
      include: {
        experiments: {
          orderBy: { createdAt: 'asc' },
          include: {
            evaluations: { select: { id: true, passed: true, observed: true } },
            artifacts: { select: { id: true } },
          },
        },
      },
    });
    return worlds.flatMap((world) => {
      const definition = record(world.configuration) as unknown as DeterministicWorldDefinition;
      if (definition.adaptive?.reproductionRunId !== reproductionRunId) return [];
      const experiment = world.experiments[0];
      if (!experiment) return [];
      return [{
        worldId: world.id,
        experimentId: experiment.id,
        purpose: definition.adaptive.adaptivePurpose,
        world: definition,
        status: experiment.status,
        invariantEvaluationIds: experiment.evaluations.filter(({ passed }) => !passed).map(({ id }) => id),
        evidenceArtifactIds: experiment.artifacts.map(({ id }) => id),
      }];
    });
  }

  async updateFindingAfterAdaptive(input: AdaptiveFindingUpdateInput): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const finding = await transaction.finding.findUnique({ where: { id: input.findingId } });
      if (!finding) throw new Error('Finding disappeared before adaptive update');
      const existingConditions = record(finding.causalConditions);
      const previousReproductionCount = finding.reproductionCount;
      const existingRuns = await transaction.reproductionRun.findMany({ where: { findingId: input.findingId }, select: { experimentId: true } });
      const existingExperimentIds = new Set(existingRuns.map(({ experimentId }) => experimentId));
      let reproductionIncrement = 0;
      const adaptiveWorlds = await transaction.world.findMany({
        where: { investigationId: input.plan.investigationId },
        include: { experiments: { orderBy: { createdAt: 'asc' }, take: 1 } },
      });
      for (const world of adaptiveWorlds) {
        const configuration = record(world.configuration) as unknown as DeterministicWorldDefinition;
        if (configuration.adaptive?.reproductionRunId !== input.reproductionRunId) continue;
        const experimentId = world.experiments[0]?.id;
        if (!experimentId || existingExperimentIds.has(experimentId)) continue;
        const reproduced = input.comparison.supportingWorldIds.includes(world.id);
        await transaction.reproductionRun.create({ data: { findingId: input.findingId, experimentId, reproduced } });
        if (reproduced && configuration.adaptive.adaptivePurpose === 'EXACT_REPRODUCTION') reproductionIncrement++;
      }
      const nextConditions = {
        ...existingConditions,
        latestReproductionRunId: input.reproductionRunId,
        reproductionPlanId: input.plan.id,
        causalStatus: input.comparison.causalStatus,
        numericConfidence: input.updatedConfidence,
        confidenceExplanation: input.confidenceExplanation,
        failureRegion: input.comparison.failureRegion,
        variableComparisons: input.comparison.comparisons,
        supportingWorldIds: input.comparison.supportingWorldIds,
        supportingInvariantEvaluationIds: input.comparison.supportingInvariantEvaluationIds,
        evidenceArtifactIds: [...new Set([...stringArray(existingConditions.evidenceArtifactIds), ...input.comparison.evidenceArtifactIds])],
      };
      await transaction.finding.update({
        where: { id: input.findingId },
        data: {
          confidence: input.confidenceLabel,
          reproductionCount: previousReproductionCount + reproductionIncrement,
          causalConditions: json(nextConditions),
        },
      });
      if (input.comparison.evidenceArtifactIds.length) {
        await transaction.findingEvidence.createMany({
          data: input.comparison.evidenceArtifactIds.map((artifactId) => ({ findingId: input.findingId, artifactId })),
          skipDuplicates: true,
        });
      }
      const completed = await transaction.findingCondition.findFirst({ where: { findingId: input.findingId, kind: 'ADAPTIVE_REPRODUCTION_COMPLETED' } });
      if (!completed) {
        await transaction.findingCondition.create({ data: { findingId: input.findingId, kind: 'ADAPTIVE_REPRODUCTION_COMPLETED', condition: json({ reproductionRunId: input.reproductionRunId, completedAt: new Date().toISOString(), comparison: input.comparison }) } });
      }
      await transaction.investigationEvent.createMany({ data: [
        { investigationId: input.plan.investigationId, type: 'finding_confirmed', data: json({ message: 'Adaptive comparison analysis completed.', phase: 'comparison_analysis_completed', findingId: input.findingId, reproductionRunId: input.reproductionRunId, causalStatus: input.comparison.causalStatus }) },
        { investigationId: input.plan.investigationId, type: 'finding_confirmed', data: json({ message: 'Finding confidence updated from adaptive reproduction.', phase: 'confidence_updated', findingId: input.findingId, reproductionRunId: input.reproductionRunId, previousConfidence: input.previousConfidence, updatedConfidence: input.updatedConfidence, reproductionCount: previousReproductionCount + reproductionIncrement }) },
        { investigationId: input.plan.investigationId, type: 'finding_confirmed', data: json({ message: 'Failure-region estimate updated.', phase: 'failure_region_updated', findingId: input.findingId, reproductionRunId: input.reproductionRunId, failureRegion: input.comparison.failureRegion }) },
      ] });
    });
  }

  async finishInvestigation(id: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const moved = await transaction.investigation.updateMany({ where: { id, status: { in: ['RUNNING', 'OBSERVING'] } }, data: { status: 'OBSERVING' } });
      if (moved.count !== 1) return;
      await transaction.investigation.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await transaction.investigationEvent.create({ data: { investigationId: id, type: 'investigation_completed', data: messageData('All worlds reached a terminal state and their evidence was processed.', { status: 'COMPLETED' }) } });
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
