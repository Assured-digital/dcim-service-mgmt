-- Work notes on the DCIM estate entities (asset / cabinet / site) — the
-- Hyperview "Work Notes" pattern. Fully additive: one new table, no data
-- touched — PROD-safe replay on the migrate-deploy path.

-- CreateTable
CREATE TABLE "WorkNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkNote_clientId_entityType_entityId_idx" ON "WorkNote"("clientId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
