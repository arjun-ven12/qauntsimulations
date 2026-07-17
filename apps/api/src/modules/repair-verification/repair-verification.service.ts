import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission, type OrganisationPermission } from '../organisations/organisation.permissions.js';
import { RepairVerificationEligibilityService } from './eligibility.service.js';
import { PreparedRepairVerificationInvestigationService } from './prepared-investigation.service.js';
import type { RepairVerificationExecutionService } from './repair-verification-execution.service.js';
import type { RepairVerificationReadRepository } from './repair-verification.repository.js';
import {
  repairVerificationCancellationInputSchema,
  repairVerificationComparisonSchema,
  repairVerificationCreateResponseSchema,
  repairVerificationDetailSchema,
  repairVerificationIdempotencyKeySchema,
  repairVerificationListItemSchema,
  repairVerificationTargetInputSchema,
  repairVerificationTargetsResponseSchema,
  type RepairVerificationEligibilitySummary,
} from './repair-verification.schema.js';
import { repairVerificationRequestFingerprint } from './request-fingerprint.js';
import type { RepairVerificationRecord } from './repair-verification.types.js';

type RequiredPermission = Extract<OrganisationPermission, 'VIEW_PROJECTS' | 'EDIT_PROJECTS'>;

export interface RepairVerificationPreflightResult {
  eligibility: RepairVerificationEligibilitySummary;
  requestFingerprint: string;
}

export class RepairVerificationDomainService {
  constructor(
    private readonly repository: RepairVerificationReadRepository,
    private readonly eligibility = new RepairVerificationEligibilityService(),
    private readonly preparedInvestigations = new PreparedRepairVerificationInvestigationService(),
    private readonly execution?: RepairVerificationExecutionService,
  ) {}

  async preflight(context: AuthContext, findingId: string, raw: unknown): Promise<RepairVerificationPreflightResult> {
    const prepared = await this.evaluate(context, findingId, raw, 'EDIT_PROJECTS');
    return { eligibility: prepared.eligibility, requestFingerprint: prepared.requestFingerprint };
  }

  async create(context: AuthContext, findingId: string, raw: unknown, rawIdempotencyKey: unknown) {
    const organisationId = await this.requirePermission(context, 'EDIT_PROJECTS');
    const idempotencyKey = repairVerificationIdempotencyKeySchema.parse(rawIdempotencyKey);
    const target = repairVerificationTargetInputSchema.parse(raw);
    const fingerprint = repairVerificationRequestFingerprint({ organisationId, findingId, target });
    const existing = await this.repository.findByIdempotencyKey(organisationId, idempotencyKey);
    if (existing) return this.idempotentResponse(existing, fingerprint);

    const prepared = await this.evaluate(context, findingId, target, 'EDIT_PROJECTS');
    if (prepared.eligibility.status !== 'ELIGIBLE' || !prepared.eligibility.planPreview) {
      const activeConflict = prepared.eligibility.issues.some(({ code }) => code === 'REPAIR_VERIFICATION_ACTIVE');
      throw new ApplicationError(
        activeConflict ? 'REPAIR_VERIFICATION_ACTIVE' : 'REPAIR_VERIFICATION_NOT_ELIGIBLE',
        activeConflict
          ? 'A Repair Verification is already active for this Finding'
          : 'Repair Verification cannot be queued until all eligibility requirements are satisfied',
        409,
        prepared.eligibility.issues,
      );
    }
    const persistence = this.preparedInvestigations.prepare({
      context: prepared.context,
      target: prepared.target,
      planPreview: prepared.eligibility.planPreview,
      idempotencyKey,
      requestFingerprint: prepared.requestFingerprint,
      actorUserId: context.userId,
    });
    try {
      const created = await this.repository.createPrepared(persistence);
      this.execution?.schedule(created.id, created.verificationInvestigationId);
      return { created: true, response: mapCreate(created) };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await this.repository.findByIdempotencyKey(organisationId, idempotencyKey);
      if (replay) return this.idempotentResponse(replay, fingerprint);
      throw new ApplicationError(
        'REPAIR_VERIFICATION_ACTIVE',
        'A Repair Verification is already active for this Finding',
        409,
      );
    }
  }

  async list(context: AuthContext, findingId: string) {
    const organisationId = await this.requirePermission(context, 'VIEW_PROJECTS');
    const projectId = await this.repository.findFindingProjectId(organisationId, findingId);
    if (!projectId) throw notFound();
    return (await this.repository.listForFinding(organisationId, findingId)).map(mapListItem);
  }

  async targets(context: AuthContext, findingId: string) {
    const organisationId = await this.requirePermission(context, 'EDIT_PROJECTS');
    const environments = await this.repository.listTargetEnvironments(organisationId, findingId);
    if (!environments) throw notFound();
    return repairVerificationTargetsResponseSchema.parse({ findingId, environments });
  }

  async detail(context: AuthContext, verificationId: string) {
    const organisationId = await this.requirePermission(context, 'VIEW_PROJECTS');
    const record = await this.repository.findById(organisationId, verificationId);
    if (!record) throw notFound();
    return mapDetail(record);
  }

  async cancel(context: AuthContext, verificationId: string, raw: unknown) {
    const organisationId = await this.requirePermission(context, 'EDIT_PROJECTS');
    const input = repairVerificationCancellationInputSchema.parse(raw ?? {});
    const current = await this.repository.findById(organisationId, verificationId);
    if (!current) throw notFound();
    const cancelled = await this.repository.cancelQueued({
      organisationId,
      verificationId,
      cancelledByUserId: context.userId,
      ...(input.reason ? { cancellationReason: input.reason } : {}),
    });
    if (!cancelled) {
      throw new ApplicationError(
        'REPAIR_VERIFICATION_NOT_CANCELLABLE',
        'Repair Verification was already started or is terminal',
        409,
      );
    }
    return mapDetail(cancelled);
  }

  private async evaluate(
    context: AuthContext,
    findingId: string,
    raw: unknown,
    permission: RequiredPermission,
  ) {
    const organisationId = await this.requirePermission(context, permission);
    const target = repairVerificationTargetInputSchema.parse(raw);
    const contextRecord = await this.repository.loadEligibilityContext({
      organisationId,
      userId: context.userId,
      findingId,
      environmentId: target.environmentId,
    });
    const eligibility = this.eligibility.evaluate(contextRecord, target);
    return {
      target,
      context: contextRecord,
      eligibility,
      requestFingerprint: repairVerificationRequestFingerprint({ organisationId, findingId, target }),
    };
  }

  private async requirePermission(context: AuthContext, permission: RequiredPermission): Promise<string> {
    if (!context.organisationId) {
      throw new ApplicationError('ORGANISATION_REQUIRED', 'An organisation context is required', 403);
    }
    const role = await this.repository.findMembershipRole(context.organisationId, context.userId);
    if (!role || !hasOrganisationPermission(role as AuthContext['role'], permission)) {
      throw new ApplicationError(
        'INSUFFICIENT_PERMISSION',
        'Your organisation role does not permit this Repair Verification action',
        403,
      );
    }
    return context.organisationId;
  }

  private idempotentResponse(record: RepairVerificationRecord, fingerprint: string) {
    if (record.requestFingerprint !== fingerprint) {
      throw new ApplicationError(
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key was already used with a different Repair Verification request',
        409,
      );
    }
    return { created: false, response: mapCreate(record) };
  }
}

function mapCreate(record: RepairVerificationRecord) {
  return repairVerificationCreateResponseSchema.parse({
    repairVerificationId: record.id,
    verificationInvestigationId: record.verificationInvestigationId,
    executionStatus: record.executionStatus,
    verificationResult: record.verificationResult,
  });
}

function mapListItem(record: RepairVerificationRecord) {
  return repairVerificationListItemSchema.parse({
    ...mapCreate(record),
    findingId: record.findingId,
    environmentId: record.environmentId,
    deploymentVersion: record.deploymentVersion,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
  });
}

function mapDetail(record: RepairVerificationRecord) {
  const comparison = record.comparisonSnapshot
    ? repairVerificationComparisonSchema.safeParse(record.comparisonSnapshot).data ?? null
    : null;
  return repairVerificationDetailSchema.parse({
    ...mapListItem(record),
    organisationId: record.organisationId,
    projectId: record.projectId,
    originalInvestigationId: record.originalInvestigationId,
    notes: record.notes,
    planSnapshot: record.planSnapshot,
    comparison,
    failure: record.failureCode && record.failureMessage
      ? { code: record.failureCode, message: record.failureMessage }
      : null,
    cancellation: record.cancelledAt
      ? { reason: record.cancellationReason, cancelledAt: record.cancelledAt.toISOString() }
      : null,
  });
}

function notFound() {
  return new ApplicationError('REPAIR_VERIFICATION_NOT_FOUND', 'Repair Verification was not found', 404);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}
