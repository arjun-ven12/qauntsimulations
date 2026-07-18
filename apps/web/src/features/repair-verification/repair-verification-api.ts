import { z } from 'zod';
import { authApi } from '../../services/auth-api.js';
import { useAuthStore } from '../../stores/auth.store.js';

const executionStatus = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
const result = z.enum(['FIX_CONFIRMED', 'DEFECT_STILL_PRESENT', 'REGRESSION_DETECTED', 'INCONCLUSIVE']);
const businessOutcome = z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']);
const planWorld = z.object({ key: z.string(), purpose: z.string(), reason: z.string(), configuration: z.record(z.unknown()) });
const planPreview = z.object({
  version: z.literal(1), environmentId: z.string(), maximumWorldCount: z.literal(6),
  journey: z.object({ id: z.string(), name: z.string() }),
  invariants: z.array(z.object({ id: z.string(), type: z.string(), severity: z.string() })),
  worlds: z.array(planWorld),
});
export const repairVerificationInputSchema = z.object({
  environmentId: z.string().trim().min(1, 'Select or enter a target Environment ID.'),
  deploymentVersion: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2_000).optional(),
  acknowledgement: z.literal(true),
});
export type RepairVerificationInput = z.infer<typeof repairVerificationInputSchema>;

const eligibility = z.object({
  findingId: z.string(), status: z.enum(['ELIGIBLE', 'INELIGIBLE', 'UNKNOWN']),
  issues: z.array(z.object({ code: z.string(), message: z.string(), category: z.string() })),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  planPreview: planPreview.nullable(),
});
const summary = z.object({
  repairVerificationId: z.string(), verificationInvestigationId: z.string(), executionStatus,
  verificationResult: result.nullable(), findingId: z.string(), environmentId: z.string(),
  deploymentVersion: z.string().nullable(), createdAt: z.string(), startedAt: z.string().nullable(), completedAt: z.string().nullable(),
});
const detail = summary.extend({
  organisationId: z.string(), projectId: z.string(), originalInvestigationId: z.string(), notes: z.string().nullable(),
  planSnapshot: z.record(z.unknown()),
  comparison: z.object({ originalBusinessOutcome: businessOutcome, repairedBusinessOutcome: businessOutcome.nullable(), regressionControlOutcome: businessOutcome.nullable(), verificationResult: result.nullable(), reason: z.string().nullable() }).nullable(),
  failure: z.object({ code: z.string(), message: z.string() }).nullable(),
  cancellation: z.object({ reason: z.string().nullable(), cancelledAt: z.string() }).nullable(),
});
const targets = z.object({ findingId: z.string(), environments: z.array(z.object({ id: z.string(), name: z.string(), type: z.string().nullable(), status: z.string(), selectable: z.boolean(), disabledReason: z.string().nullable() })) });
export type RepairVerificationDetail = z.infer<typeof detail>;

export class RepairVerificationApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly details?: unknown) { super(message); }
}

class HttpRepairVerificationApi {
  private readonly baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

  preflight(findingId: string, input: RepairVerificationInput) {
    return this.request(`/findings/${findingId}/repair-verifications/preflight`, { method: 'POST', body: JSON.stringify(input) })
      .then((value) => z.object({ eligibility, requestFingerprint: z.string() }).parse(value));
  }
  targets(findingId: string) { return this.request(`/findings/${findingId}/repair-verifications/targets`).then((value) => targets.parse(value)); }
  create(findingId: string, input: RepairVerificationInput, idempotencyKey: string) {
    return this.request(`/findings/${findingId}/repair-verifications`, { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': idempotencyKey } })
      .then((value) => z.object({ repairVerificationId: z.string(), verificationInvestigationId: z.string(), executionStatus, verificationResult: result.nullable() }).parse(value));
  }
  list(findingId: string) { return this.request(`/findings/${findingId}/repair-verifications`).then((value) => z.array(summary).parse(value)); }
  get(verificationId: string) { return this.request(`/repair-verifications/${verificationId}`).then((value) => detail.parse(value)); }
  cancel(verificationId: string, reason?: string) {
    return this.request(`/repair-verifications/${verificationId}/cancel`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }).then((value) => detail.parse(value));
  }

  private async request(path: string, init?: RequestInit, retry = true): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
    } catch { throw new RepairVerificationApiError('Rift could not reach Repair Verification.', 0, 'NETWORK_ERROR'); }
    const payload = await response.json() as { error?: { code?: string; message?: string; details?: unknown } };
    if (response.status === 401 && retry) {
      try { await authApi.refresh(); return this.request(path, init, false); } catch { await useAuthStore.getState().signOut(); }
    }
    if (!response.ok) throw new RepairVerificationApiError(payload.error?.message ?? 'Repair Verification request failed.', response.status, payload.error?.code ?? 'REPAIR_VERIFICATION_REQUEST_FAILED', payload.error?.details);
    return payload;
  }
}

export const repairVerificationApi = new HttpRepairVerificationApi();
export function isActiveRepairVerification(status?: string) { return status === 'QUEUED' || status === 'RUNNING'; }
