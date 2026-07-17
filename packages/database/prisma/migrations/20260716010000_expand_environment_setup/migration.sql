-- User-facing Environment Setup configuration. Existing runtime manifest data is preserved.
ALTER TYPE "EnvironmentType" ADD VALUE IF NOT EXISTS 'LOCAL';
ALTER TYPE "EnvironmentType" ADD VALUE IF NOT EXISTS 'PREVIEW';
ALTER TYPE "EnvironmentType" ADD VALUE IF NOT EXISTS 'TEST_MIRROR';

CREATE TYPE "EnvironmentValidationStatus" AS ENUM ('NOT_VALIDATED', 'INCOMPLETE', 'READY', 'VALIDATION_FAILED');

ALTER TABLE "Environment"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "apiBaseUrl" TEXT,
  ADD COLUMN "healthCheckUrl" TEXT,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "validationStatus" "EnvironmentValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN "lastValidatedAt" TIMESTAMP(3),
  ADD COLUMN "configuration" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "Environment_projectId_isDefault_idx" ON "Environment"("projectId", "isDefault");
CREATE INDEX "Environment_projectId_validationStatus_idx" ON "Environment"("projectId", "validationStatus");
