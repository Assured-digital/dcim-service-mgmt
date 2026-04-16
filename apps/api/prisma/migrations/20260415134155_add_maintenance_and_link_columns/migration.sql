-- CreateEnum
CREATE TYPE "MaintenanceWorkType" AS ENUM ('INSPECTION', 'PSU_REPLACEMENT', 'FIRMWARE_UPGRADE', 'PAT_INSPECTION', 'COOLING_CHECK', 'CABLE_AUDIT', 'REPAIR', 'UPGRADE', 'OTHER');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "installDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ChangeRequest" ADD COLUMN     "linkedEntityId" TEXT,
ADD COLUMN     "linkedEntityType" TEXT;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "linkedEntityId" TEXT,
ADD COLUMN     "linkedEntityType" TEXT;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "linkedEntityId" TEXT,
ADD COLUMN     "linkedEntityType" TEXT;

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "linkedEntityId" TEXT,
ADD COLUMN     "linkedEntityType" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "linkedEntityId" TEXT,
ADD COLUMN     "linkedEntityType" TEXT;

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "workType" "MaintenanceWorkType" NOT NULL DEFAULT 'OTHER',
    "workTypeOther" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "performedById" TEXT,
    "notes" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
