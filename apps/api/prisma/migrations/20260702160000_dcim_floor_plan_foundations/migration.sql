-- DCIM floor-plan foundations (DCIM_SCHEMA_SPEC.md §2/§4/§5/§6/§6b). ONE additive
-- migration BASING OUT every planned DCIM feature at the data layer: spatial floor
-- plan (Cabinet posX/posY/orientation/row/status, Room dimensions/shell), AisleZone,
-- FloorObject, ImportMapping; decommission (Asset disposalStatus/physicallyRemoved);
-- and LATENT layers (Region, Port + Connection port FKs, Asset health/telemetry) so
-- future features POPULATE fields rather than migrate. All nullable/defaulted; no
-- backfill, no drops. PROD-safe on live data.

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "disposalStatus" TEXT,
ADD COLUMN     "healthStatus" TEXT,
ADD COLUMN     "lastTelemetryAt" TIMESTAMP(3),
ADD COLUMN     "physicallyRemoved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Cabinet" ADD COLUMN     "orientation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "posX" DOUBLE PRECISION,
ADD COLUMN     "posY" DOUBLE PRECISION,
ADD COLUMN     "positionInRow" INTEGER,
ADD COLUMN     "row" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "fromPortId" TEXT,
ADD COLUMN     "toPortId" TEXT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "backgroundImageKey" TEXT,
ADD COLUMN     "backgroundImageType" TEXT,
ADD COLUMN     "backgroundOpacity" DOUBLE PRECISION DEFAULT 0.4,
ADD COLUMN     "depthMm" INTEGER,
ADD COLUMN     "gridCols" INTEGER,
ADD COLUMN     "gridRows" INTEGER,
ADD COLUMN     "shellShape" JSONB,
ADD COLUMN     "shellType" TEXT,
ADD COLUMN     "widthMm" INTEGER;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "regionId" TEXT,
ADD COLUMN     "status" TEXT;

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AisleZone" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AisleZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorObject" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION,
    "depth" DOUBLE PRECISION,
    "orientation" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMapping" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "columnMap" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Port" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portType" TEXT NOT NULL,
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Port_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Region_clientId_idx" ON "Region"("clientId");

-- CreateIndex
CREATE INDEX "AisleZone_roomId_idx" ON "AisleZone"("roomId");

-- CreateIndex
CREATE INDEX "FloorObject_roomId_idx" ON "FloorObject"("roomId");

-- CreateIndex
CREATE INDEX "ImportMapping_clientId_idx" ON "ImportMapping"("clientId");

-- CreateIndex
CREATE INDEX "Port_assetId_idx" ON "Port"("assetId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AisleZone" ADD CONSTRAINT "AisleZone_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorObject" ADD CONSTRAINT "FloorObject_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorObject" ADD CONSTRAINT "FloorObject_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMapping" ADD CONSTRAINT "ImportMapping_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_fromPortId_fkey" FOREIGN KEY ("fromPortId") REFERENCES "Port"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_toPortId_fkey" FOREIGN KEY ("toPortId") REFERENCES "Port"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Port" ADD CONSTRAINT "Port_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;