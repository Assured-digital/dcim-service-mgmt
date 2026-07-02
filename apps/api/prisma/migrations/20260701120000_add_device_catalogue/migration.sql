-- Hardware catalogue (DCIM spec §3): global (NOT client-scoped) Manufacturer +
-- DeviceType tables, plus an optional Asset.deviceTypeId FK. Fully additive: new
-- tables + one new nullable column, no backfill, no drops. PROD-safe on live data.

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceType" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "uHeight" DOUBLE PRECISION,
    "isFullDepth" BOOLEAN DEFAULT true,
    "powerDrawW" DOUBLE PRECISION,
    "partNumber" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceType_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "deviceTypeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_name_key" ON "Manufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_slug_key" ON "Manufacturer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceType_slug_key" ON "DeviceType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceType_manufacturerId_model_key" ON "DeviceType"("manufacturerId", "model");

-- AddForeignKey
ALTER TABLE "DeviceType" ADD CONSTRAINT "DeviceType_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
