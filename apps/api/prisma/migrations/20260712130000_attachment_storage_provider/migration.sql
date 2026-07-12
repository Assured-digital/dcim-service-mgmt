-- C1a — which storage backend holds each attachment's bytes (s3 | azure |
-- sharepoint). Enables dual-read after a backend switch: legacy rows are NULL
-- and served by STORAGE_LEGACY_PROVIDER; new rows stamp the active provider.
ALTER TABLE "Attachment" ADD COLUMN "storageProvider" TEXT;
