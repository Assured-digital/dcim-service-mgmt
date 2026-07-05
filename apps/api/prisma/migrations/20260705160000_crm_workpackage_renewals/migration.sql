-- CRM Phase 5 (CRM_DESIGN.md §3): contract-layer renewal fields on WorkPackage.
-- Additive; existing rows get autoRenews=false and null renewal fields.

ALTER TABLE "WorkPackage" ADD COLUMN "renewalDate" TIMESTAMP(3);
ALTER TABLE "WorkPackage" ADD COLUMN "noticePeriodDays" INTEGER;
ALTER TABLE "WorkPackage" ADD COLUMN "autoRenews" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkPackage" ADD COLUMN "commercialNotes" TEXT;
