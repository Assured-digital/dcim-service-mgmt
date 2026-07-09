-- A1 — SSO: passwordHash becomes optional (SSO-only users have none) + a stable
-- link to the Entra identity (oid).

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "entraObjectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_entraObjectId_key" ON "User"("entraObjectId");
