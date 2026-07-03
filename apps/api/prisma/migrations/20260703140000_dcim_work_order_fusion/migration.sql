-- MAC↔ITSM work-order fusion (DCIM_DESIGN_SPEC §6.1, Horizon 2). Additive:
-- three nullable columns stage a pending physical operation on the Asset,
-- applied automatically when its linked Task/Change completes. No data touched.

ALTER TABLE "Asset" ADD COLUMN "pendingOp" TEXT;
ALTER TABLE "Asset" ADD COLUMN "pendingWorkOrderType" TEXT;
ALTER TABLE "Asset" ADD COLUMN "pendingWorkOrderId" TEXT;

-- The completion hook reverse-looks-up the waiting asset by (type, id).
CREATE INDEX "Asset_pendingWorkOrderId_idx" ON "Asset"("pendingWorkOrderId");
