import type {
  DatabaseClient,
  RepairVerificationBusinessOutcome,
  RepairVerificationExecutionStatus,
  RepairVerificationResult,
} from '@taskos/database';
import type {
  JsonRecord,
  RepairVerificationEligibilityContext,
  RepairVerificationLaunchSnapshot,
  RepairVerificationRecord,
  PreparedRepairVerificationPersistence,
  RepairVerificationWorldEvidence,
} from './repair-verification.types.js';

export interface RepairVerificationReadRepository {
  loadEligibilityContext(input: {
    organisationId: string;
    userId: string;
    findingId: string;
    environmentId: string;
  }): Promise<RepairVerificationEligibilityContext>;
  findById(organisationId: string, verificationId: string): Promise<RepairVerificationRecord | null>;
  listForFinding(organisationId: string, findingId: string): Promise<RepairVerificationRecord[]>;
  findByIdempotencyKey(organisationId: string, idempotencyKey: string): Promise<RepairVerificationRecord | null>;
  findMembershipRole(organisationId: string, userId: string): Promise<string | null>;
  findFindingProjectId(organisationId: string, findingId: string): Promise<string | null>;
  listTargetEnvironments(organisationId: string, findingId: string): Promise<Array<{
    id: string; name: string; type: string | null; status: string; selectable: boolean; disabledReason: string | null;
  }> | null>;
  createPrepared(input: PreparedRepairVerificationPersistence): Promise<RepairVerificationRecord>;
  cancelQueued(input: {
    organisationId: string;
    verificationId: string;
    cancelledByUserId: string;
    cancellationReason?: string;
  }): Promise<RepairVerificationRecord | null>;
  beginExecution(verificationId: string): Promise<RepairVerificationRecord | null>;
  terminalExecutionEvidence(verificationInvestigationId: string): Promise<{
    verification: RepairVerificationRecord;
    investigationStatus: string;
    worlds: RepairVerificationWorldEvidence[];
  } | null>;
  persistTerminalResult(input: {
    verificationId: string;
    executionStatus: RepairVerificationExecutionStatus;
    verificationResult: RepairVerificationResult;
    repairedBusinessOutcome: RepairVerificationBusinessOutcome;
    regressionControlOutcome: RepairVerificationBusinessOutcome;
    comparisonSnapshot: JsonRecord;
    inconclusiveReason?: string;
    failureCode?: string;
    failureMessage?: string;
  }): Promise<RepairVerificationRecord | null>;
}

export class PrismaRepairVerificationReadRepository implements RepairVerificationReadRepository {
  constructor(private readonly database: DatabaseClient) {}

  async loadEligibilityContext(input: {
    organisationId: string;
    userId: string;
    findingId: string;
    environmentId: string;
  }): Promise<RepairVerificationEligibilityContext> {
    const [membership, finding, targetEnvironment, activeVerification] = await Promise.all([
      this.database.organisationMember.findFirst({
        where: {
          organisationId: input.organisationId,
          userId: input.userId,
          organisation: { deletedAt: null },
          user: { deletedAt: null },
        },
        select: { role: true },
      }),
      this.database.finding.findFirst({
        where: { id: input.findingId, organisationId: input.organisationId, deletedAt: null },
        include: {
          project: {
            select: {
              organisationId: true,
              safetyPolicies: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, domainAllowlist: true, blockedActions: true, configuration: true },
              },
            },
          },
          investigation: {
            include: {
              plans: { orderBy: { version: 'desc' }, take: 1, select: { plan: true } },
              worlds: {
                orderBy: { createdAt: 'asc' },
                include: {
                  experiments: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                      evaluations: { select: { passed: true } },
                      attempts: {
                        orderBy: { attempt: 'desc' },
                        take: 1,
                        select: { status: true, result: true, completedAt: true },
                      },
                    },
                  },
                },
              },
            },
          },
          minimalReproduction: { select: { worldConfiguration: true } },
          minimisationRuns: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: {
              finalMinimalTestedConditions: true,
              knownPassingDelayMs: true,
              knownFailingDelayMs: true,
            },
          },
        },
      }),
      this.database.environment.findFirst({
        where: { id: input.environmentId, project: { organisationId: input.organisationId } },
        include: { project: { select: { organisationId: true } } },
      }),
      this.database.repairVerification.findFirst({
        where: {
          findingId: input.findingId,
          organisationId: input.organisationId,
          executionStatus: { in: ['QUEUED', 'RUNNING'] },
        },
        select: { id: true },
      }),
    ]);

    const minimisation = finding?.minimisationRuns[0];
    const minimalWorldConfiguration = jsonRecord(finding?.minimalReproduction?.worldConfiguration)
      ?? jsonRecord(minimisation?.finalMinimalTestedConditions);
    const causal = jsonRecord(finding?.causalConditions);
    const launchSnapshot = readLaunchSnapshot(finding?.investigation.plans[0]?.plan);

    return {
      organisationId: input.organisationId,
      actor: membership ? { userId: input.userId, role: String(membership.role) } : null,
      finding: finding ? {
        id: finding.id,
        organisationId: finding.organisationId,
        projectId: finding.projectId,
        investigationId: finding.investigationId,
        originalInvestigationOrganisationId: finding.investigation.organisationId,
        originalInvestigationProjectId: finding.investigation.projectId,
        originalJourneyId: finding.investigation.journeyId,
        confidence: String(finding.confidence),
        ...(typeof causal?.causalStatus === 'string' ? { causalStatus: causal.causalStatus } : {}),
        originalInvestigationStatus: String(finding.investigation.status),
      } : null,
      targetEnvironment: targetEnvironment ? {
        id: targetEnvironment.id,
        projectId: targetEnvironment.projectId,
        organisationId: targetEnvironment.project.organisationId,
        name: targetEnvironment.name,
        type: String(targetEnvironment.type),
        baseUrl: targetEnvironment.baseUrl,
        ...(targetEnvironment.apiBaseUrl ? { apiBaseUrl: targetEnvironment.apiBaseUrl } : {}),
        validationStatus: String(targetEnvironment.validationStatus),
        deletedAt: targetEnvironment.deletedAt,
        configuration: jsonRecord(targetEnvironment.configuration) ?? {},
      } : null,
      safetyPolicy: finding?.project.safetyPolicies[0] ? {
        id: finding.project.safetyPolicies[0].id,
        domainAllowlist: finding.project.safetyPolicies[0].domainAllowlist,
        blockedActions: finding.project.safetyPolicies[0].blockedActions,
        configuration: jsonRecord(finding.project.safetyPolicies[0].configuration) ?? {},
      } : null,
      launchSnapshot,
      minimalWorldConfiguration,
      boundedRange: minimisation && (
        minimisation.knownPassingDelayMs !== null || minimisation.knownFailingDelayMs !== null
      ) ? {
        ...(minimisation.knownPassingDelayMs !== null ? { knownPassingDelayMs: minimisation.knownPassingDelayMs } : {}),
        ...(minimisation.knownFailingDelayMs !== null ? { knownFailingDelayMs: minimisation.knownFailingDelayMs } : {}),
      } : null,
      worlds: finding?.investigation.worlds.map(mapWorldEvidence) ?? [],
      activeVerificationId: activeVerification?.id ?? null,
    };
  }

  async findById(organisationId: string, verificationId: string) {
    const record = await this.database.repairVerification.findFirst({
      where: { id: verificationId, organisationId },
    });
    return record ? mapRepairVerification(record) : null;
  }

  async listForFinding(organisationId: string, findingId: string) {
    const records = await this.database.repairVerification.findMany({
      where: { organisationId, findingId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapRepairVerification);
  }

  async findByIdempotencyKey(organisationId: string, idempotencyKey: string) {
    const record = await this.database.repairVerification.findUnique({
      where: { organisationId_idempotencyKey: { organisationId, idempotencyKey } },
    });
    return record ? mapRepairVerification(record) : null;
  }

  async findMembershipRole(organisationId: string, userId: string) {
    const membership = await this.database.organisationMember.findFirst({
      where: { organisationId, userId, organisation: { deletedAt: null }, user: { deletedAt: null } },
      select: { role: true },
    });
    return membership ? String(membership.role) : null;
  }

  async findFindingProjectId(organisationId: string, findingId: string) {
    const finding = await this.database.finding.findFirst({
      where: { id: findingId, organisationId, deletedAt: null },
      select: { projectId: true },
    });
    return finding?.projectId ?? null;
  }

  async listTargetEnvironments(organisationId: string, findingId: string) {
    const finding = await this.database.finding.findFirst({
      where: { id: findingId, organisationId, deletedAt: null },
      select: { projectId: true },
    });
    if (!finding) return null;
    const environments = await this.database.environment.findMany({
      where: { projectId: finding.projectId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, type: true, validationStatus: true },
    });
    return environments.map((environment) => {
      const status = String(environment.validationStatus);
      const selectable = status === 'READY';
      return {
        id: environment.id,
        name: environment.name,
        type: environment.type ? String(environment.type) : null,
        status,
        selectable,
        disabledReason: selectable ? null : 'Environment must be READY before it can be used for Repair Verification.',
      };
    });
  }

  async createPrepared(input: PreparedRepairVerificationPersistence) {
    const created = await this.database.$transaction(async (transaction) => {
      await transaction.scenario.create({ data: {
        id: input.scenario.id,
        projectId: input.repairVerification.projectId,
        name: input.scenario.name,
        prompt: input.scenario.prompt,
        controls: input.scenario.controls as never,
      } });
      await transaction.investigation.create({ data: {
        id: input.verificationInvestigationId,
        organisationId: input.repairVerification.organisationId,
        projectId: input.repairVerification.projectId,
        environmentId: input.repairVerification.environmentId,
        journeyId: input.investigation.journeyId,
        scenarioId: input.scenario.id,
        safetyPolicyId: input.investigation.safetyPolicyId,
        name: input.investigation.name,
        status: 'QUEUED',
      } });
      await transaction.experimentPlan.create({ data: {
        investigationId: input.verificationInvestigationId,
        journeyId: input.investigation.journeyId,
        scenarioId: input.scenario.id,
        version: 1,
        provider: 'MOCK',
        plan: input.experimentPlan.plan as never,
        planningExplanation: input.experimentPlan.planningExplanation,
        estimatedComputeUnits: input.experimentPlan.estimatedComputeUnits,
      } });
      return transaction.repairVerification.create({ data: {
        id: input.repairVerificationId,
        organisationId: input.repairVerification.organisationId,
        projectId: input.repairVerification.projectId,
        findingId: input.repairVerification.findingId,
        originalInvestigationId: input.repairVerification.originalInvestigationId,
        verificationInvestigationId: input.verificationInvestigationId,
        environmentId: input.repairVerification.environmentId,
        createdByUserId: input.repairVerification.createdByUserId,
        ...(input.repairVerification.notes ? { notes: input.repairVerification.notes } : {}),
        executionStatus: 'QUEUED',
        originalBusinessOutcome: 'FAIL',
        planSnapshot: input.repairVerification.planSnapshot as never,
        idempotencyKey: input.repairVerification.idempotencyKey,
        requestFingerprint: input.repairVerification.requestFingerprint,
      } });
    });
    return mapRepairVerification(created);
  }

  async cancelQueued(input: {
    organisationId: string;
    verificationId: string;
    cancelledByUserId: string;
    cancellationReason?: string;
  }) {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.repairVerification.findFirst({
        where: { id: input.verificationId, organisationId: input.organisationId },
      });
      if (!current || current.executionStatus !== 'QUEUED') return null;
      const now = new Date();
      const investigation = await transaction.investigation.updateMany({
        where: { id: current.verificationInvestigationId, organisationId: input.organisationId, status: 'QUEUED' },
        data: { status: 'CANCELLED', completedAt: now },
      });
      if (investigation.count !== 1) return null;
      const changed = await transaction.repairVerification.updateMany({
        where: { id: current.id, organisationId: input.organisationId, executionStatus: 'QUEUED' },
        data: {
          executionStatus: 'CANCELLED',
          verificationResult: 'INCONCLUSIVE',
          repairedBusinessOutcome: 'INCONCLUSIVE',
          regressionControlOutcome: 'INCONCLUSIVE',
          cancelledByUserId: input.cancelledByUserId,
          cancelledAt: now,
          completedAt: now,
          ...(input.cancellationReason ? { cancellationReason: input.cancellationReason } : {}),
        },
      });
      if (changed.count !== 1) throw new Error('Queued Repair Verification cancellation lost its atomic update');
      const cancelled = await transaction.repairVerification.findUnique({ where: { id: current.id } });
      if (!cancelled) throw new Error('Cancelled Repair Verification was not found');
      return mapRepairVerification(cancelled);
    });
  }

  async beginExecution(verificationId: string) {
    const now = new Date();
    const changed = await this.database.repairVerification.updateMany({
      where: { id: verificationId, executionStatus: 'QUEUED' },
      data: { executionStatus: 'RUNNING', startedAt: now },
    });
    if (changed.count !== 1) return null;
    const record = await this.database.repairVerification.findUnique({ where: { id: verificationId } });
    return record ? mapRepairVerification(record) : null;
  }

  async terminalExecutionEvidence(verificationInvestigationId: string) {
    const verification = await this.database.repairVerification.findFirst({
      where: { verificationInvestigationId },
      include: {
        verificationInvestigation: {
          select: {
            status: true,
            worlds: {
              orderBy: { createdAt: 'asc' },
              include: {
                experiments: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  include: {
                    evaluations: { select: { passed: true } },
                    attempts: { orderBy: { attempt: 'desc' }, take: 1, select: { status: true, result: true, completedAt: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!verification || !['COMPLETED', 'FAILED', 'CANCELLED'].includes(String(verification.verificationInvestigation.status))) return null;
    return {
      verification: mapRepairVerification(verification),
      investigationStatus: String(verification.verificationInvestigation.status),
      worlds: verification.verificationInvestigation.worlds.map(mapWorldEvidence),
    };
  }

  async persistTerminalResult(input: {
    verificationId: string;
    executionStatus: RepairVerificationExecutionStatus;
    verificationResult: RepairVerificationResult;
    repairedBusinessOutcome: RepairVerificationBusinessOutcome;
    regressionControlOutcome: RepairVerificationBusinessOutcome;
    comparisonSnapshot: JsonRecord;
    inconclusiveReason?: string;
    failureCode?: string;
    failureMessage?: string;
  }) {
    const changed = await this.database.repairVerification.updateMany({
      where: { id: input.verificationId, executionStatus: { in: ['QUEUED', 'RUNNING'] } },
      data: {
        executionStatus: input.executionStatus,
        verificationResult: input.verificationResult,
        repairedBusinessOutcome: input.repairedBusinessOutcome,
        regressionControlOutcome: input.regressionControlOutcome,
        comparisonSnapshot: input.comparisonSnapshot as never,
        completedAt: new Date(),
        ...(input.executionStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        ...(input.inconclusiveReason ? { inconclusiveReason: input.inconclusiveReason } : {}),
        ...(input.failureCode ? { failureCode: input.failureCode } : {}),
        ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
      },
    });
    if (changed.count !== 1) return null;
    const record = await this.database.repairVerification.findUnique({ where: { id: input.verificationId } });
    return record ? mapRepairVerification(record) : null;
  }
}

function mapRepairVerification(record: {
  id: string; organisationId: string; projectId: string; findingId: string;
  originalInvestigationId: string; verificationInvestigationId: string; environmentId: string;
  createdByUserId: string | null; cancelledByUserId: string | null; notes: string | null;
  executionStatus: string; verificationResult: string | null; originalBusinessOutcome: string;
  repairedBusinessOutcome: string | null; regressionControlOutcome: string | null;
  planSnapshot: unknown; comparisonSnapshot: unknown; idempotencyKey: string; requestFingerprint: string; failureCode: string | null;
  failureMessage: string | null; inconclusiveReason: string | null; cancellationReason: string | null;
  startedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null;
  createdAt: Date; updatedAt: Date;
}): RepairVerificationRecord {
  const planSnapshot = jsonRecord(record.planSnapshot) ?? {};
  const metadata = jsonRecord(planSnapshot.repairVerification);
  return {
    ...record,
    deploymentVersion: typeof metadata?.deploymentVersion === 'string' ? metadata.deploymentVersion : null,
    planSnapshot,
    comparisonSnapshot: jsonRecord(record.comparisonSnapshot),
  };
}

function mapWorldEvidence(world: {
  id: string;
  status: string;
  configuration: unknown;
  experiments: Array<{
    status: string;
    evaluations: Array<{ passed: boolean }>;
    attempts: Array<{ status: string; result: unknown; completedAt: Date | null }>;
  }>;
}): RepairVerificationWorldEvidence {
  const configuration = jsonRecord(world.configuration) ?? {};
  const experiment = world.experiments[0];
  const attempt = experiment?.attempts[0];
  const resultStatus = jsonRecord(attempt?.result)?.status;
  const completed = resultStatus === 'PASSED' || resultStatus === 'INVARIANT_VIOLATION'
    || Boolean(attempt?.completedAt && experiment?.evaluations.length);
  const executionState = world.status === 'CANCELLED' || experiment?.status === 'CANCELLED'
    ? 'CANCELLED'
    : completed
      ? 'COMPLETED'
      : world.status === 'FAILED' || experiment?.status === 'ERROR' || attempt?.status === 'ERROR'
        ? 'FAILED'
        : 'INCOMPLETE';
  const businessOutcome = executionState !== 'COMPLETED' || !experiment?.evaluations.length
    ? 'INCONCLUSIVE'
    : experiment.evaluations.some(({ passed }) => !passed) ? 'FAIL' : 'PASS';
  const adaptive = jsonRecord(configuration.adaptive);
  const repairVerification = jsonRecord(configuration.repairVerification);
  return {
    id: world.id,
    configuration,
    ...(typeof configuration.origin === 'string' ? { origin: configuration.origin } : {}),
    ...(typeof adaptive?.adaptivePurpose === 'string' ? { adaptivePurpose: adaptive.adaptivePurpose } : {}),
    ...(isRepairVerificationPurpose(repairVerification?.purpose) ? { repairVerificationPurpose: repairVerification.purpose } : {}),
    executionState,
    businessOutcome,
  };
}

function isRepairVerificationPurpose(value: unknown): value is NonNullable<RepairVerificationWorldEvidence['repairVerificationPurpose']> {
  return value === 'REPAIR_MINIMAL_REPRODUCTION' || value === 'REPAIR_PASSING_CONTROL' || value === 'REPAIR_BOUNDARY_REGRESSION';
}

function readLaunchSnapshot(planValue: unknown): RepairVerificationLaunchSnapshot | null {
  const plan = jsonRecord(planValue);
  const launch = jsonRecord(plan?.launch);
  const journey = jsonRecord(launch?.journey);
  const environment = jsonRecord(launch?.environment);
  const safety = jsonRecord(launch?.safety);
  if (!journey || !environment || !safety || !Array.isArray(launch?.invariants)) return null;
  if (typeof journey.id !== 'string' || typeof journey.name !== 'string' || !Array.isArray(journey.steps)) return null;
  if (typeof environment.id !== 'string' || typeof environment.name !== 'string' || typeof environment.type !== 'string' || typeof environment.baseUrl !== 'string') return null;
  const invariants = launch.invariants.flatMap((value) => {
    const item = jsonRecord(value);
    return item && typeof item.id === 'string' && typeof item.type === 'string' && typeof item.severity === 'string'
      ? [{ id: item.id, type: item.type, severity: item.severity, config: jsonRecord(item.config) ?? {} }]
      : [];
  });
  if (!invariants.length) return null;
  const domainAllowlist = stringArray(safety.domainAllowlist);
  const allowedHttpMethods = stringArray(safety.allowedHttpMethods);
  if (
    typeof safety.permitCheckoutSubmission !== 'boolean'
    || typeof safety.permitMockPayment !== 'boolean'
    || typeof safety.permitTestOrderCreation !== 'boolean'
  ) return null;
  return {
    journey: { id: journey.id, name: journey.name, steps: journey.steps, successCondition: journey.successCondition },
    invariants,
    environment: { id: environment.id, name: environment.name, type: environment.type, baseUrl: environment.baseUrl },
    safety: {
      domainAllowlist,
      allowedHttpMethods,
      permitCheckoutSubmission: safety.permitCheckoutSubmission,
      permitMockPayment: safety.permitMockPayment,
      permitTestOrderCreation: safety.permitTestOrderCreation,
    },
  };
}

export function jsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
