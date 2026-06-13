-- Comment threading, Stage 2 — add the REPLY notification kind. Fully additive:
-- one new enum value, nothing else touched.
--
-- Postgres note: since PG12, `ALTER TYPE ... ADD VALUE` IS permitted inside a
-- transaction block (the pre-PG12 restriction is gone). The only remaining rule
-- is that the new value cannot be USED in the SAME transaction it is added in.
-- This migration ADDS 'REPLY' only — it is first USED at runtime (the reply-create
-- emit), in a separate transaction — so it is safe under Prisma's transactional
-- `migrate deploy` on PG16. No backfill, no data mutation.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REPLY';
