-- Notifications Phase 1 (#154) — add the ASSIGNED and STATUS_CHANGED notification
-- kinds. Fully additive: two new enum values, nothing else touched (the Notification
-- table already carries everything these emits need).
--
-- Postgres note: since PG12, `ALTER TYPE ... ADD VALUE` IS permitted inside a
-- transaction block (the pre-PG12 restriction is gone). The only remaining rule is
-- that a new value cannot be USED in the SAME transaction it is added in. This
-- migration ADDS the values only — they are first USED at runtime (the assignment /
-- status-change emits), in separate transactions — so it is safe under Prisma's
-- transactional `migrate deploy` on PG16. No backfill, no data mutation.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'STATUS_CHANGED';
