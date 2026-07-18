CREATE TYPE "CustomTemplateCategory" AS ENUM (
  'PROJECT',
  'ENVIRONMENT',
  'PROJECT_SAFETY',
  'JOURNEY',
  'INVARIANT',
  'SCENARIO'
);

CREATE TABLE "CustomTemplate" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "category" "CustomTemplateCategory" NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "description" TEXT,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomTemplate_organisationId_ownerUserId_category_normalizedName_key"
  ON "CustomTemplate"("organisationId", "ownerUserId", "category", "normalizedName");

CREATE INDEX "CustomTemplate_organisationId_ownerUserId_category_updatedAt_idx"
  ON "CustomTemplate"("organisationId", "ownerUserId", "category", "updatedAt");

ALTER TABLE "CustomTemplate"
  ADD CONSTRAINT "CustomTemplate_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomTemplate"
  ADD CONSTRAINT "CustomTemplate_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
