-- Optional per-attachment caption: a short, frictionless label captured alongside
-- field-evidence photos (check-item photos today). Additive + nullable; existing rows
-- keep NULL (no backfill). No CREATE EXTENSION. Runs first on the cloud migrate-deploy.
ALTER TABLE "Attachment" ADD COLUMN "caption" TEXT;
