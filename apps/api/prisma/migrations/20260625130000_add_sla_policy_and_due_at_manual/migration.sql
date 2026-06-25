-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "resolutionHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlaPolicy_clientId_idx" ON "SlaPolicy"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_clientId_priority_key" ON "SlaPolicy"("clientId", "priority");

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN "dueAtManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "dueAtManual" BOOLEAN NOT NULL DEFAULT false;
