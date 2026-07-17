ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_eligibility_checked';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_candidate_queued';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_condition_inconclusive';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_range_candidate_generated';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimal_reproduction_candidate_created';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimal_reproduction_inconclusive';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'final_report_artifact_created';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_failed';

CREATE TABLE IF NOT EXISTS "MinimisationRun" (
  "id" TEXT NOT NULL,
  "investigationId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "sourceWorldId" TEXT NOT NULL,
  "reproductionRunId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "strategyVersion" TEXT NOT NULL,
  "originalFailingConfiguration" JSONB NOT NULL,
  "currentRetainedConditions" JSONB NOT NULL DEFAULT '{}',
  "removedConditions" JSONB NOT NULL DEFAULT '{}',
  "inconclusiveConditions" JSONB NOT NULL DEFAULT '{}',
  "knownPassingDelayMs" INTEGER,
  "knownFailingDelayMs" INTEGER,
  "generatedCandidateWorldIds" JSONB NOT NULL DEFAULT '[]',
  "maximumTrials" INTEGER NOT NULL,
  "completedTrials" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "finalMinimalTestedConditions" JSONB,
  "finalBoundedRange" JSONB,
  "finalConfidence" DOUBLE PRECISION,
  "finalReportEvidenceId" TEXT,
  CONSTRAINT "MinimisationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MinimisationCandidate" (
  "id" TEXT NOT NULL,
  "minimisationRunId" TEXT NOT NULL,
  "worldId" TEXT,
  "experimentId" TEXT,
  "sequence" INTEGER NOT NULL,
  "purpose" TEXT NOT NULL,
  "variableName" TEXT NOT NULL,
  "sourceValue" JSONB NOT NULL,
  "candidateValue" JSONB NOT NULL,
  "result" TEXT NOT NULL DEFAULT 'QUEUED',
  "conditionDecision" TEXT NOT NULL DEFAULT 'INCONCLUSIVE',
  "invariantIds" JSONB NOT NULL DEFAULT '[]',
  "supportingEvidenceIds" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "MinimisationCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MinimisationRun_findingId_strategyVersion_key" ON "MinimisationRun"("findingId", "strategyVersion");
CREATE INDEX IF NOT EXISTS "MinimisationRun_investigationId_status_idx" ON "MinimisationRun"("investigationId", "status");
CREATE INDEX IF NOT EXISTS "MinimisationRun_findingId_status_idx" ON "MinimisationRun"("findingId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "MinimisationCandidate_minimisationRunId_sequence_key" ON "MinimisationCandidate"("minimisationRunId", "sequence");
CREATE INDEX IF NOT EXISTS "MinimisationCandidate_minimisationRunId_result_idx" ON "MinimisationCandidate"("minimisationRunId", "result");
CREATE INDEX IF NOT EXISTS "MinimisationCandidate_worldId_idx" ON "MinimisationCandidate"("worldId");
CREATE INDEX IF NOT EXISTS "MinimisationCandidate_experimentId_idx" ON "MinimisationCandidate"("experimentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MinimisationRun_investigationId_fkey'
  ) THEN
    ALTER TABLE "MinimisationRun"
      ADD CONSTRAINT "MinimisationRun_investigationId_fkey"
      FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MinimisationRun_findingId_fkey'
  ) THEN
    ALTER TABLE "MinimisationRun"
      ADD CONSTRAINT "MinimisationRun_findingId_fkey"
      FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MinimisationCandidate_minimisationRunId_fkey'
  ) THEN
    ALTER TABLE "MinimisationCandidate"
      ADD CONSTRAINT "MinimisationCandidate_minimisationRunId_fkey"
      FOREIGN KEY ("minimisationRunId") REFERENCES "MinimisationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MinimisationCandidate_worldId_fkey'
  ) THEN
    ALTER TABLE "MinimisationCandidate"
      ADD CONSTRAINT "MinimisationCandidate_worldId_fkey"
      FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MinimisationCandidate_experimentId_fkey'
  ) THEN
    ALTER TABLE "MinimisationCandidate"
      ADD CONSTRAINT "MinimisationCandidate_experimentId_fkey"
      FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
