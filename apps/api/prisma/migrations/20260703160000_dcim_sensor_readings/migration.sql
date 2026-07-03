-- Measured telemetry (DCIM_SCHEMA_SPEC §6b, Horizon 3) — the manual/CSV field-
-- reading phase. One new time-series table; fully additive, PROD-safe replay.

-- CreateTable
CREATE TABLE "SensorReading" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SensorReading_clientId_assetId_metric_readAt_idx" ON "SensorReading"("clientId", "assetId", "metric", "readAt");
CREATE INDEX "SensorReading_assetId_metric_readAt_idx" ON "SensorReading"("assetId", "metric", "readAt");

-- AddForeignKey
ALTER TABLE "SensorReading" ADD CONSTRAINT "SensorReading_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SensorReading" ADD CONSTRAINT "SensorReading_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
