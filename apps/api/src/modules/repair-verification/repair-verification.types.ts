import type { RepairVerificationTargetInput } from './repair-verification.schema.js';

export type JsonRecord = Record<string, unknown>;

export interface RepairVerificationInvariantSnapshot {
  id: string;
  type: string;
  severity: string;
  config: JsonRecord;
}

export interface RepairVerificationLaunchSnapshot {
  journey: { id: string; name: string; steps: unknown[]; successCondition: unknown };
  invariants: RepairVerificationInvariantSnapshot[];
  environment: { id: string; name: string; type: string; baseUrl: string };
  safety: {
    domainAllowlist: string[];
    allowedHttpMethods: string[];
    permitCheckoutSubmission: boolean;
    permitMockPayment: boolean;
    permitTestOrderCreation: boolean;
  };
}

export interface RepairVerificationWorldEvidence {
  id: string;
  configuration: JsonRecord;
  origin?: string;
  adaptivePurpose?: string;
  executionState: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INCOMPLETE';
  businessOutcome: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
}

export interface RepairVerificationEligibilityContext {
  organisationId: string;
  actor: { userId: string; role: string } | null;
  finding: {
    id: string;
    organisationId: string;
    projectId: string;
    investigationId: string;
    originalInvestigationOrganisationId: string;
    originalInvestigationProjectId: string;
    originalJourneyId: string;
    confidence: string;
    causalStatus?: string;
    originalInvestigationStatus: string;
  } | null;
  targetEnvironment: {
    id: string;
    projectId: string;
    organisationId: string;
    name: string;
    type: string;
    baseUrl: string;
    apiBaseUrl?: string;
    validationStatus: string;
    deletedAt: Date | null;
    configuration: JsonRecord;
  } | null;
  safetyPolicy: {
    id: string;
    domainAllowlist: string[];
    blockedActions: string[];
    configuration: JsonRecord;
  } | null;
  launchSnapshot: RepairVerificationLaunchSnapshot | null;
  minimalWorldConfiguration: JsonRecord | null;
  boundedRange: { knownPassingDelayMs?: number; knownFailingDelayMs?: number } | null;
  worlds: RepairVerificationWorldEvidence[];
  activeVerificationId: string | null;
}

export interface RepairVerificationPreflightRequest {
  organisationId: string;
  userId: string;
  findingId: string;
  target: RepairVerificationTargetInput;
}

export interface RepairVerificationRecord {
  id: string;
  organisationId: string;
  projectId: string;
  findingId: string;
  originalInvestigationId: string;
  verificationInvestigationId: string;
  environmentId: string;
  deploymentVersion: string | null;
  createdByUserId: string | null;
  cancelledByUserId: string | null;
  notes: string | null;
  executionStatus: string;
  verificationResult: string | null;
  originalBusinessOutcome: string;
  repairedBusinessOutcome: string | null;
  regressionControlOutcome: string | null;
  planSnapshot: JsonRecord;
  comparisonSnapshot: JsonRecord | null;
  idempotencyKey: string;
  requestFingerprint: string;
  failureCode: string | null;
  failureMessage: string | null;
  inconclusiveReason: string | null;
  cancellationReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreparedRepairVerificationPersistence {
  repairVerificationId: string;
  verificationInvestigationId: string;
  scenario: { id: string; name: string; prompt: string; controls: JsonRecord };
  investigation: {
    name: string;
    journeyId: string;
    safetyPolicyId: string;
  };
  experimentPlan: {
    plan: JsonRecord;
    planningExplanation: string;
    estimatedComputeUnits: number;
  };
  repairVerification: {
    organisationId: string;
    projectId: string;
    findingId: string;
    originalInvestigationId: string;
    environmentId: string;
    createdByUserId: string;
    notes?: string;
    planSnapshot: JsonRecord;
    idempotencyKey: string;
    requestFingerprint: string;
  };
}
