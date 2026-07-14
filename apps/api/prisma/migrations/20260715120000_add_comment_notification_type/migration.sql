-- B3 Phase 2b — COMMENT notification type (comment activity to watchers). In its
-- OWN migration so the enum value is committed before any later migration/code uses
-- it (PostgreSQL ADD VALUE can't be used in the transaction that adds it).
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT';
