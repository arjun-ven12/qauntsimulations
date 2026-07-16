CREATE TYPE "OrganisationInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

CREATE TABLE "OrganisationInvitation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "OrganisationInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganisationInvitation_tokenHash_key" ON "OrganisationInvitation"("tokenHash");
CREATE INDEX "OrganisationInvitation_organisationId_idx" ON "OrganisationInvitation"("organisationId");
CREATE INDEX "OrganisationInvitation_email_idx" ON "OrganisationInvitation"("email");
CREATE INDEX "OrganisationInvitation_status_expiresAt_idx" ON "OrganisationInvitation"("status", "expiresAt");
CREATE INDEX "OrganisationInvitation_organisationId_email_idx" ON "OrganisationInvitation"("organisationId", "email");

ALTER TABLE "OrganisationInvitation" ADD CONSTRAINT "OrganisationInvitation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganisationInvitation" ADD CONSTRAINT "OrganisationInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
