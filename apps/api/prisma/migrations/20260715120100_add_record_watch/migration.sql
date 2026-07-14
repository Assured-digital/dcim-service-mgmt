-- B3 Phase 2b — the Watch feature: a user opts into a record's notifications.
CREATE TABLE "RecordWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordWatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordWatch_userId_recordType_recordId_key" ON "RecordWatch"("userId", "recordType", "recordId");
CREATE INDEX "RecordWatch_recordType_recordId_idx" ON "RecordWatch"("recordType", "recordId");

ALTER TABLE "RecordWatch" ADD CONSTRAINT "RecordWatch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
