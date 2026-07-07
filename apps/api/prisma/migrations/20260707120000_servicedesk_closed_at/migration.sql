-- Service Desk Live/History split: add a resolved-date (closedAt) to the three
-- work-item types that lacked one. ChangeRequest / Risk / Issue already have closedAt.
-- History windowing filters + sorts by this column across all six types.

ALTER TABLE "ServiceRequest" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Incident" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "closedAt" TIMESTAMP(3);

-- Backfill existing terminal-status rows so pre-existing closed work has a resolved
-- date. Best-effort: updatedAt is the closest proxy for when it was closed (these
-- rows closed before the column existed). New closures set closedAt at transition time.
UPDATE "ServiceRequest" SET "closedAt" = "updatedAt"
  WHERE "status" IN ('COMPLETED', 'CLOSED', 'CANCELLED') AND "closedAt" IS NULL;

UPDATE "Incident" SET "closedAt" = "updatedAt"
  WHERE "status" IN ('RESOLVED', 'CLOSED') AND "closedAt" IS NULL;

UPDATE "Task" SET "closedAt" = "updatedAt"
  WHERE "status" = 'DONE' AND "closedAt" IS NULL;

-- ChangeRequest / Risk / Issue already had closedAt, but historically only stamped it
-- on the CLOSED status — their OTHER terminal states (completed/cancelled/rejected/
-- accepted/resolved) were left null. Backfill those so History windowing sees them.
UPDATE "ChangeRequest" SET "closedAt" = "updatedAt"
  WHERE "status" IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED') AND "closedAt" IS NULL;

UPDATE "Risk" SET "closedAt" = "updatedAt"
  WHERE "status" IN ('ACCEPTED', 'CLOSED') AND "closedAt" IS NULL;

UPDATE "Issue" SET "closedAt" = "updatedAt"
  WHERE "status" IN ('RESOLVED', 'CLOSED') AND "closedAt" IS NULL;
