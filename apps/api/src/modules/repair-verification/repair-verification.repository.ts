import type { DatabaseClient } from '@taskos/database';
import type {
  JsonRecord,
  RepairVerificationEligibilityContext,
  RepairVerificationLaunchSnapshot,
  RepairVerificationRecord,
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
                select: { domainAllowlist: true, configuration: true },
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
        domainAllowlist: finding.project.safetyPolicies[0].domainAllowlist,
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
}

function mapRepairVerification(record: {
  id: string; organisationId: string; projectId: string; findingId: string;
  originalInvestigationId: string; verificationInvestigationId: string; environmentId: string;
  createdByUserId: string | null; cancelledByUserId: string | null; notes: string | null;
  executionStatus: string; verificationResult: string | null; originalBusinessOutcome: string;
  repairedBusinessOutcome: string | null; regressionControlOutcome: string | null;
  planSnapshot: unknown; comparisonSnapshot: unknown; failureCode: string | null;
  failureMessage: string | null; inconclusiveReason: string | null; cancellationReason: string | null;
  startedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null;
  createdAt: Date; updatedAt: Date;
}): RepairVerificationRecord {
  return {
    ...record,
    planSnapshot: jsonRecord(record.planSnapshot) ?? {},
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
  return {
    id: world.id,
    configuration,
    ...(typeof configuration.origin === 'string' ? { origin: configuration.origin } : {}),
    ...(typeof adaptive?.adaptivePurpose === 'string' ? { adaptivePurpose: adaptive.adaptivePurpose } : {}),
    executionState,
    businessOutcome,
  };
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
