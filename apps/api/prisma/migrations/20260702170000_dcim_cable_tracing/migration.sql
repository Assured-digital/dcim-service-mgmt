-- Multi-hop cable tracing (DCIM_DESIGN_SPEC §6.1, Horizon 2). Fully additive:
-- Port gains a symmetric one-to-one pass-through self-relation (patch-panel
-- front↔rear); Connection gains descriptive cable-run fields. No data touched,
-- all columns nullable — PROD-safe replay on the migrate-deploy path.

-- AlterTable: Port pass-through peer (self-FK, unique = one-to-one)
ALTER TABLE "Port" ADD COLUMN "throughPortId" TEXT;

-- CreateIndex: unique enforces "a port is the pass-through target of at most one other"
CREATE UNIQUE INDEX "Port_throughPortId_key" ON "Port"("throughPortId");

-- AddForeignKey: self-relation, SET NULL so deleting one side clears the peer's pointer
ALTER TABLE "Port" ADD CONSTRAINT "Port_throughPortId_fkey" FOREIGN KEY ("throughPortId") REFERENCES "Port"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Connection cable descriptors
ALTER TABLE "Connection" ADD COLUMN "cableLength" DOUBLE PRECISION;
ALTER TABLE "Connection" ADD COLUMN "cableColour" TEXT;
