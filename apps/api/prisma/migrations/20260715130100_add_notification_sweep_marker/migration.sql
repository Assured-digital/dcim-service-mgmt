-- B3 Phase 3 — idempotency ledger for the notification sweep (one row per record+signal).
CREATE TABLE "NotificationSweepMarker" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationSweepMarker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationSweepMarker_recordType_recordId_signal_key" ON "NotificationSweepMarker"("recordType", "recordId", "signal");
