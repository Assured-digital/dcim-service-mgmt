-- Asset custom properties (register power-features). Additive: a per-client field
-- definition table + a JSON values column on Asset. PROD-safe replay.

ALTER TABLE "Asset" ADD COLUMN "customValues" JSONB;

CREATE TABLE "AssetCustomField" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetCustomField_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetCustomField_clientId_key_key" ON "AssetCustomField"("clientId", "key");
CREATE INDEX "AssetCustomField_clientId_idx" ON "AssetCustomField"("clientId");

ALTER TABLE "AssetCustomField" ADD CONSTRAINT "AssetCustomField_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
