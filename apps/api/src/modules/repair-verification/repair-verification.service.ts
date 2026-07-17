import { RepairVerificationEligibilityService } from './eligibility.service.js';
import type { RepairVerificationReadRepository } from './repair-verification.repository.js';
import {
  repairVerificationTargetInputSchema,
  type RepairVerificationEligibilitySummary,
} from './repair-verification.schema.js';
import { repairVerificationRequestFingerprint } from './request-fingerprint.js';
import type { RepairVerificationPreflightRequest } from './repair-verification.types.js';

export interface RepairVerificationPreflightResult {
  eligibility: RepairVerificationEligibilitySummary;
  requestFingerprint: string;
}

// Read-only domain foundation. This service intentionally has no create/start method.
export class RepairVerificationDomainService {
  constructor(
    private readonly repository: RepairVerificationReadRepository,
    private readonly eligibility = new RepairVerificationEligibilityService(),
  ) {}

  async preflight(raw: RepairVerificationPreflightRequest): Promise<RepairVerificationPreflightResult> {
    const target = repairVerificationTargetInputSchema.parse(raw.target);
    const context = await this.repository.loadEligibilityContext({
      organisationId: raw.organisationId,
      userId: raw.userId,
      findingId: raw.findingId,
      environmentId: target.environmentId,
    });
    return {
      eligibility: this.eligibility.evaluate(context, target),
      requestFingerprint: repairVerificationRequestFingerprint({
        organisationId: raw.organisationId,
        findingId: raw.findingId,
        target,
      }),
    };
  }
}
