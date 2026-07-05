-- CRM Phase 3 (CRM_DESIGN.md): Opportunity pipeline.

CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NEW_BUSINESS',
    "stage" TEXT NOT NULL DEFAULT 'DISCOVERY',
    "lastStageChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "probability" INTEGER,
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "expectedCloseDate" TIMESTAMP(3),
    "nextStep" TEXT,
    "nextStepDate" TIMESTAMP(3),
    "ownerId" TEXT,
    "contactId" TEXT,
    "workPackageId" TEXT,
    "renewsWorkPackageId" TEXT,
    "lostReason" TEXT,
    "lostDetail" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Opportunity_reference_key" ON "Opportunity"("reference");
CREATE INDEX "Opportunity_clientId_stage_idx" ON "Opportunity"("clientId", "stage");

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_workPackageId_fkey" FOREIGN KEY ("workPackageId") REFERENCES "WorkPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_renewsWorkPackageId_fkey" FOREIGN KEY ("renewsWorkPackageId") REFERENCES "WorkPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
