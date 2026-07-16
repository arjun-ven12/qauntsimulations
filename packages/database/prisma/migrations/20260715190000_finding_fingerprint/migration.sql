ALTER TABLE "Finding" ADD COLUMN "fingerprint" TEXT;
CREATE UNIQUE INDEX "Finding_fingerprint_key" ON "Finding"("fingerprint");
