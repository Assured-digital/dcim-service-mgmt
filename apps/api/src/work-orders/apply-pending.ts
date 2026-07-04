import { PrismaService } from "../prisma/prisma.service"
import { emitAudit } from "../audit-events/emit-audit"
import { findUSlotConflicts } from "../cabinets/u-slot.util"

// MAC↔ITSM work-order fusion (DCIM_DESIGN_SPEC §6.1, Horizon 2). When a linked
// Task/Change reaches its terminal state, the completion hook calls in here to
// apply the pending physical operation staged on the waiting asset — the
// automatic coupling that dcTrack needs ServiceNow for and we don't.
//
// Standalone functions (not on AssetsService) so tasks/changes can call them
// without a circular module dependency — they only touch a few Asset scalars.

const DECOMMISSION_DISPOSAL = "MARKED_FOR_DISPOSAL"

// The waiting asset for a given work order (reverse of asset.pendingWorkOrderId).
async function findWaitingAsset(prisma: PrismaService, workOrderType: "task" | "change", workOrderId: string, clientId: string) {
  return prisma.asset.findFirst({
    where: { pendingWorkOrderType: workOrderType, pendingWorkOrderId: workOrderId, clientId },
  })
}

const clearPending = {
  pendingOp: null, pendingWorkOrderType: null, pendingWorkOrderId: null,
  pendingTargetCabinetId: null, pendingTargetUPosition: null, pendingTargetRackSide: null,
}

// Apply the staged op — called when the work order COMPLETES (Task→DONE /
// Change→COMPLETED). Best-effort and idempotent: no waiting asset → no-op; an
// op whose precondition no longer holds (e.g. asset already RETIRED) just clears
// the marker. Never throws into the caller's status-update transaction.
export async function applyCompletedWorkOrder(
  prisma: PrismaService,
  args: { workOrderType: "task" | "change"; workOrderId: string; actorUserId: string; clientId: string }
): Promise<void> {
  const { workOrderType, workOrderId, actorUserId, clientId } = args
  try {
    const asset = await findWaitingAsset(prisma, workOrderType, workOrderId, clientId)
    if (!asset || !asset.pendingOp) return

    if (asset.pendingOp === "INSTALL") {
      // Only a still-PLANNED asset activates; anything else just clears.
      if (asset.lifecycleState !== "PLANNED") {
        await prisma.asset.update({ where: { id: asset.id }, data: clearPending })
        return
      }
      await prisma.asset.update({ where: { id: asset.id }, data: { lifecycleState: "ACTIVE", ...clearPending } })
      await emitAudit(prisma, {
        entityType: "Asset", entityId: asset.id, action: "WORK_ORDER_COMPLETED",
        actorUserId, clientId, reference: asset.assetTag, title: asset.name,
        changes: [{ field: "lifecycleState", label: "Lifecycle", from: "Planned", to: "Active" }],
        comment: "Install work order completed — asset activated",
      })
      return
    }

    if (asset.pendingOp === "DECOMMISSION") {
      if (asset.lifecycleState === "RETIRED") {
        await prisma.asset.update({ where: { id: asset.id }, data: clearPending })
        return
      }
      // Mirrors the RETIRE step of assets.decommission() — capacity frees, block
      // stays drawn greyed until a manual REMOVE.
      await prisma.asset.update({
        where: { id: asset.id },
        data: { lifecycleState: "RETIRED", disposalStatus: asset.disposalStatus ?? DECOMMISSION_DISPOSAL, ...clearPending },
      })
      await emitAudit(prisma, {
        entityType: "Asset", entityId: asset.id, action: "WORK_ORDER_COMPLETED",
        actorUserId, clientId, reference: asset.assetTag, title: asset.name,
        changes: [{ field: "lifecycleState", label: "Lifecycle", from: asset.lifecycleState, to: "Retired" }],
        comment: "Decommission change completed — asset retired",
      })
      return
    }

    if (asset.pendingOp === "MOVE") {
      // Only a still-ACTIVE asset relocates; anything else just clears.
      if (asset.lifecycleState !== "ACTIVE" || !asset.pendingTargetCabinetId || asset.pendingTargetUPosition == null) {
        await prisma.asset.update({ where: { id: asset.id }, data: clearPending })
        return
      }
      const rackSide = asset.pendingTargetRackSide === "REAR" ? "REAR" : "FRONT"
      // Fresh overlap re-check — the target slot may have filled since the work
      // order was raised. On conflict, leave the asset in place and just clear.
      const occupants = await prisma.asset.findMany({
        where: {
          cabinetId: asset.pendingTargetCabinetId, uPosition: { not: null }, isZeroU: false,
          id: { not: asset.id }, lifecycleState: { not: "RETIRED" },
        },
        select: { id: true, name: true, uPosition: true, uHeight: true, rackSide: true, isFullDepth: true },
      })
      const conflicts = findUSlotConflicts(
        { uPosition: asset.pendingTargetUPosition, uHeight: asset.uHeight, rackSide, isFullDepth: asset.isFullDepth },
        occupants.map((o) => ({ ...o, uPosition: o.uPosition as number, label: o.name })),
      )
      if (conflicts.length > 0) {
        await prisma.asset.update({ where: { id: asset.id }, data: clearPending })
        await emitAudit(prisma, {
          entityType: "Asset", entityId: asset.id, action: "WORK_ORDER_COMPLETED",
          actorUserId, clientId, reference: asset.assetTag, title: asset.name,
          comment: `Move work order completed but the target slot is now occupied by ${conflicts[0].label} — asset left in place`,
        })
        return
      }
      const targetCabinet = await prisma.cabinet.findUnique({
        where: { id: asset.pendingTargetCabinetId }, select: { siteId: true, name: true },
      })
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          cabinetId: asset.pendingTargetCabinetId,
          siteId: targetCabinet?.siteId ?? asset.siteId,
          uPosition: asset.pendingTargetUPosition,
          rackSide,
          ...clearPending,
        },
      })
      await emitAudit(prisma, {
        entityType: "Asset", entityId: asset.id, action: "WORK_ORDER_COMPLETED",
        actorUserId, clientId, reference: asset.assetTag, title: asset.name,
        comment: `Move work order completed — asset relocated to ${targetCabinet?.name ?? "target"} U${asset.pendingTargetUPosition}`,
      })
      return
    }
  } catch {
    // Never let a fusion side-effect break the ITSM status update.
  }
}

// A REJECTED/CANCELLED change abandons its staged op — clear the marker so the
// asset stops showing a pending shadow (the physical change won't happen).
export async function abandonWorkOrder(
  prisma: PrismaService,
  args: { workOrderType: "task" | "change"; workOrderId: string; actorUserId: string; clientId: string }
): Promise<void> {
  const { workOrderType, workOrderId, actorUserId, clientId } = args
  try {
    const asset = await findWaitingAsset(prisma, workOrderType, workOrderId, clientId)
    if (!asset || !asset.pendingOp) return
    await prisma.asset.update({ where: { id: asset.id }, data: clearPending })
    const opLabel = asset.pendingOp === "INSTALL" ? "Install" : asset.pendingOp === "MOVE" ? "Move" : "Decommission"
    await emitAudit(prisma, {
      entityType: "Asset", entityId: asset.id, action: "WORK_ORDER_CANCELLED",
      actorUserId, clientId, reference: asset.assetTag, title: asset.name,
      comment: `${opLabel} work order cancelled`,
    })
  } catch {
    // Best-effort.
  }
}
