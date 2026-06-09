-- Phase 3a (multi-client): drop the now-unused User.clientId scalar.
-- Safe/destructive: Phase 1 (20260608120000_add_user_client_assignment) backfilled
-- every clientId value into UserClientAssignment, so no data is lost. The join-table
-- relations are the sole source of a user's client scope from here on.

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_clientId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "clientId";
