ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'investigation_created';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'world_queued';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'worker_started';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'worker_completed';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'worker_failed';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'finding_created';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'investigation_cancelled';

ALTER TABLE "ExecutionAttempt"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "exitCode" INTEGER,
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "result" JSONB,
  ADD COLUMN "resultPath" TEXT,
  ADD COLUMN "evidenceManifestPath" TEXT,
  ADD COLUMN "stdoutSummary" TEXT,
  ADD COLUMN "stderrSummary" TEXT;

ALTER TABLE "InvariantEvaluation"
  ADD COLUMN "executionAttemptId" TEXT,
  ADD COLUMN "workerId" TEXT,
  ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "evidenceReferences" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "InvariantEvaluation_executionAttemptId_idx" ON "InvariantEvaluation"("executionAttemptId");
CREATE INDEX "InvariantEvaluation_workerId_idx" ON "InvariantEvaluation"("workerId");

ALTER TABLE "InvariantEvaluation"
  ADD CONSTRAINT "InvariantEvaluation_executionAttemptId_fkey"
  FOREIGN KEY ("executionAttemptId") REFERENCES "ExecutionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvariantEvaluation"
  ADD CONSTRAINT "InvariantEvaluation_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
