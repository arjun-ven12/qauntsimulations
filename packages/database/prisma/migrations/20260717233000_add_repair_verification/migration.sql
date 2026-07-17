-- Repair, VerificationRun, and VerificationExperiment remain legacy/inactive.
-- RepairVerification is the only canonical persistence model for the v1 feature.

CREATE TYPE "RepairVerificationExecutionStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "RepairVerificationResult" AS ENUM (
  'FIX_CONFIRMED',
  'DEFECT_STILL_PRESENT',
  'REGRESSION_DETECTED',
  'INCONCLUSIVE'
);

CREATE TYPE "RepairVerificationBusinessOutcome" AS ENUM (
  'PASS',
  'FAIL',
  'INCONCLUSIVE'
);

CREATE TABLE "RepairVerification" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "originalInvestigationId" TEXT NOT NULL,
  "verificationInvestigationId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "cancelledByUserId" TEXT,
  "notes" TEXT,
  "executionStatus" "RepairVerificationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "verificationResult" "RepairVerificationResult",
  "originalBusinessOutcome" "RepairVerificationBusinessOutcome" NOT NULL,
  "repairedBusinessOutcome" "RepairVerificationBusinessOutcome",
  "regressionControlOutcome" "RepairVerificationBusinessOutcome",
  "planSnapshot" JSONB NOT NULL,
  "comparisonSnapshot" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "inconclusiveReason" TEXT,
  "cancellationReason" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RepairVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairVerification_verificationInvestigationId_key"
  ON "RepairVerification"("verificationInvestigationId");
CREATE UNIQUE INDEX "RepairVerification_organisationId_idempotencyKey_key"
  ON "RepairVerification"("organisationId", "idempotencyKey");
CREATE INDEX "RepairVerification_organisationId_createdAt_idx"
  ON "RepairVerification"("organisationId", "createdAt");
CREATE INDEX "RepairVerification_projectId_createdAt_idx"
  ON "RepairVerification"("projectId", "createdAt");
CREATE INDEX "RepairVerification_findingId_createdAt_idx"
  ON "RepairVerification"("findingId", "createdAt");
CREATE INDEX "RepairVerification_originalInvestigationId_idx"
  ON "RepairVerification"("originalInvestigationId");
CREATE INDEX "RepairVerification_environmentId_idx"
  ON "RepairVerification"("environmentId");
CREATE INDEX "RepairVerification_executionStatus_updatedAt_idx"
  ON "RepairVerification"("executionStatus", "updatedAt");

-- Prisma does not represent partial unique indexes in the schema. This database guard is
-- authoritative and prevents concurrent QUEUED/RUNNING verification records per Finding.
CREATE UNIQUE INDEX "RepairVerification_one_active_per_finding"
  ON "RepairVerification"("findingId")
  WHERE "executionStatus" IN (
    'QUEUED'::"RepairVerificationExecutionStatus",
    'RUNNING'::"RepairVerificationExecutionStatus"
  );

ALTER TABLE "RepairVerification"
  ADD CONSTRAINT "RepairVerification_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairVerification"
  ADD CONSTRAINT "RepairVerification_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairVerification"
  ADD CONSTRAINT "RepairVerification_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "Finding"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairVerification"
  ADD CONSTRAINT "RepairVerification_originalInvestigationId_fkey"
  FOREIGN KEY ("originalInvestigationId") REFERENCES "Investigation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairVerification"
  ADD CONSTRAINT "RepairVerification_verificationInvestigationId_fkey"
  FOREIGN KEY ("verificationInvestigationId") REFERENCES "Investigation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairVerification"
  ADD CONSTRAINT "RepairVerification_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "Environment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairVerification"
  ADD CONSTRAINT "RepairVerification_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RepairVerification"
  ADD CONSTRAINT "RepairVerification_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
