-- Reviewer flag-for-rework, per check item: a boolean flag + a required reviewer note,
-- set on the PENDING_REVIEW review surface and surfaced to the engineer on return.
-- Additive + nullable; existing rows keep NULL (no backfill, treated as not-flagged).
-- No CREATE EXTENSION, no default → pure ADD COLUMN (no table rewrite). Runs first on
-- the cloud migrate-deploy (local syncs via prisma db push).
ALTER TABLE "CheckItem" ADD COLUMN "reworkFlagged" BOOLEAN;
ALTER TABLE "CheckItem" ADD COLUMN "reworkNote" TEXT;
