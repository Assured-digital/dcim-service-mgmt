-- Asset deletion request-and-approve workflow: additive, nullable columns only.
ALTER TABLE "Asset" ADD COLUMN "deletionStatus" TEXT;
ALTER TABLE "Asset" ADD COLUMN "deletionRequestedById" TEXT;
ALTER TABLE "Asset" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "deletionReason" TEXT;
