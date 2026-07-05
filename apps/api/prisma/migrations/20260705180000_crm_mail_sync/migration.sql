-- CRM Phase 7b (CRM_DESIGN.md §8): shared-mailbox email sync.
-- Activity gains a Graph conversationId (thread continuity); EmailTriage holds
-- unmatched messages for one-click triage.

ALTER TABLE "Activity" ADD COLUMN "emailConversationId" TEXT;

CREATE TABLE "EmailTriage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "conversationId" TEXT,
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "bodyPreview" TEXT,
    "webLink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedActivityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTriage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailTriage_internetMessageId_key" ON "EmailTriage"("internetMessageId");
CREATE INDEX "EmailTriage_organizationId_status_idx" ON "EmailTriage"("organizationId", "status");
