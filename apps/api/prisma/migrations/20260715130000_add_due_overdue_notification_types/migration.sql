-- B3 Phase 3 — time-based sweep notification types. Own migration (values are only
-- ADDed here, never used in this transaction), so they commit before the sweep code
-- emits them. Postgres 16 permits ALTER TYPE ... ADD VALUE inside a transaction.
ALTER TYPE "NotificationType" ADD VALUE 'DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'OVERDUE';
