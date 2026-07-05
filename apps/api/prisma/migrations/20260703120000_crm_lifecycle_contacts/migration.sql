-- CRM Phase 1 (CRM_DESIGN.md): client lifecycle stage + Contact table.
-- Additive only. lifecycleStage defaults to ACTIVE so every existing client is unaffected.

ALTER TABLE "Client" ADD COLUMN "lifecycleStage" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Client" ADD COLUMN "sharePointFolderPath" TEXT;

CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "siteId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contact_clientId_status_idx" ON "Contact"("clientId", "status");
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
