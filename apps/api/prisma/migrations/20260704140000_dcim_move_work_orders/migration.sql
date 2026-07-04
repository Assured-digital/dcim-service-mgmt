-- MAC↔ITSM fusion Phase 2: Move work orders with dual-position shadow.
-- Adds the pending MOVE target to Asset (used only when pendingOp = 'MOVE').
ALTER TABLE "Asset" ADD COLUMN "pendingTargetCabinetId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "pendingTargetUPosition" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "pendingTargetRackSide" TEXT;
