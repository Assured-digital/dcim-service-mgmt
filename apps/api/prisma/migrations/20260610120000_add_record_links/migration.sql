-- CreateTable
CREATE TABLE "RecordLink" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "aType" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bType" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordLink_clientId_aType_aId_idx" ON "RecordLink"("clientId", "aType", "aId");

-- CreateIndex
CREATE INDEX "RecordLink_clientId_bType_bId_idx" ON "RecordLink"("clientId", "bType", "bId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordLink_clientId_aType_aId_bType_bId_key" ON "RecordLink"("clientId", "aType", "aId", "bType", "bId");

-- AddForeignKey
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
