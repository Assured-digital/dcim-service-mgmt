-- CreateEnum
CREATE TYPE "PlatformModule" AS ENUM ('SERVICE_DESK', 'DCIM', 'CRM', 'OPERATIONS');

-- CreateTable
CREATE TABLE "ClientModuleEntitlement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "module" "PlatformModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientModuleEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientModuleEntitlement_clientId_module_key" ON "ClientModuleEntitlement"("clientId", "module");

-- AddForeignKey
ALTER TABLE "ClientModuleEntitlement" ADD CONSTRAINT "ClientModuleEntitlement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing client gets all modules enabled (zero regression on
-- rollout). gen_random_uuid() is PG13+ core — no extension required.
INSERT INTO "ClientModuleEntitlement" ("id", "clientId", "module", "enabled", "updatedAt")
SELECT gen_random_uuid()::text, c."id", m."module", true, CURRENT_TIMESTAMP
FROM "Client" c
CROSS JOIN (
    VALUES
        ('SERVICE_DESK'::"PlatformModule"),
        ('DCIM'::"PlatformModule"),
        ('CRM'::"PlatformModule"),
        ('OPERATIONS'::"PlatformModule")
) AS m("module");
