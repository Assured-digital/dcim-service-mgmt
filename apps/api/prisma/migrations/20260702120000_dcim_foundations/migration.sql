-- DCIM foundations (DCIM_DESIGN_SPEC.md §1): ONE additive migration carrying every
-- schema delta for workstreams A-D. All new columns nullable or defaulted; one new
-- table; no backfill, no drops. PROD-safe on live data.

-- CreateEnum
CREATE TYPE "DeviceAirflow" AS ENUM ('FRONT_TO_REAR', 'REAR_TO_FRONT', 'SIDE_TO_REAR', 'PASSIVE', 'MIXED');

-- AlterTable (Asset — placement semantics + capacity, spec §2/§4.1)
ALTER TABLE "Asset" ADD COLUMN "isFullDepth" BOOLEAN,
ADD COLUMN "isZeroU" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "budgetedDrawW" DOUBLE PRECISION,
ADD COLUMN "weightKg" DOUBLE PRECISION;

-- AlterTable (Cabinet — U numbering + weight denominator, spec §1)
ALTER TABLE "Cabinet" ADD COLUMN "startingUnit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "maxWeightKg" DOUBLE PRECISION;

-- AlterTable (DeviceType — catalogue depth, spec §3; updatedAt defaulted for existing rows)
ALTER TABLE "DeviceType" ADD COLUMN "weightKg" DOUBLE PRECISION,
ADD COLUMN "airflow" "DeviceAirflow",
ADD COLUMN "category" TEXT,
ADD COLUMN "excludeFromUtilization" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deratePct" INTEGER,
ADD COLUMN "frontImageKey" TEXT,
ADD COLUMN "frontImageType" TEXT,
ADD COLUMN "rearImageKey" TEXT,
ADD COLUMN "rearImageType" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable (Site — contracted capacity, spec §5)
ALTER TABLE "Site" ADD COLUMN "contractedKw" DOUBLE PRECISION,
ADD COLUMN "contractedU" INTEGER;

-- CreateTable (advisory U-range reservations, spec §2)
CREATE TABLE "CabinetReservation" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "uStart" INTEGER NOT NULL,
    "uHeight" INTEGER NOT NULL DEFAULT 1,
    "rackSide" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabinetReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CabinetReservation_cabinetId_idx" ON "CabinetReservation"("cabinetId");

-- CreateIndex
CREATE INDEX "CabinetReservation_clientId_expiresAt_idx" ON "CabinetReservation"("clientId", "expiresAt");

-- AddForeignKey
ALTER TABLE "CabinetReservation" ADD CONSTRAINT "CabinetReservation_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetReservation" ADD CONSTRAINT "CabinetReservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
