-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PLANNED', 'ACTIVE', 'DEGRADED', 'RETIRED');

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromAssetId" TEXT NOT NULL,
    "toAssetId" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT,
    "notes" TEXT,
    "installedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connection_clientId_status_idx" ON "Connection"("clientId", "status");

-- CreateIndex
CREATE INDEX "Connection_fromAssetId_idx" ON "Connection"("fromAssetId");

-- CreateIndex
CREATE INDEX "Connection_toAssetId_idx" ON "Connection"("toAssetId");

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
