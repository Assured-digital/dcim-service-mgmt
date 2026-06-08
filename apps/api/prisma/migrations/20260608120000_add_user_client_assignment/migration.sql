-- Ensure gen_random_uuid() is available for the backfill below.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "UserClientAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserClientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserClientAssignment_userId_idx" ON "UserClientAssignment"("userId");

-- CreateIndex
CREATE INDEX "UserClientAssignment_clientId_idx" ON "UserClientAssignment"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "UserClientAssignment_userId_clientId_key" ON "UserClientAssignment"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "UserClientAssignment" ADD CONSTRAINT "UserClientAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClientAssignment" ADD CONSTRAINT "UserClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one assignment row per existing user that has a clientId.
-- Org-level users (null clientId) get none. Behaviour-preserving (each
-- single-client user ends up with exactly one assignment = their old clientId).
INSERT INTO "UserClientAssignment" ("id", "userId", "clientId", "createdAt")
SELECT gen_random_uuid()::text, "id", "clientId", now()
FROM "User"
WHERE "clientId" IS NOT NULL;
