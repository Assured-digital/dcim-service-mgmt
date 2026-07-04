import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service";
import { AssetLifecycleState, OwnerType, Prisma, Role } from "@prisma/client";
import { isOrgSuperRole } from "../auth/role-scope";
import { emitAudit } from "../audit-events/emit-audit";
import { computeDisplayName, userDisplaySelect } from "../users/display";
import { activeReservationWhere, findUSlotConflicts, uSlotOutOfBounds, UPlacement } from "../cabinets/u-slot.util";
import { DCIM_DEFAULT_DERATE_PCT } from "../dcim/capacity.util";
import { resolveAttachments } from "../attachments/resolve-attachments";
import { TasksService } from "../tasks/tasks.service";
import { ChangesService } from "../changes/changes.service";

@Injectable()
export class AssetsService {
  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
    private changes: ChangesService,
  ) {}

  // Authoritative U-slot collision check (DCIM_DESIGN_SPEC.md §2.2). Runs inside
  // the SAME transaction as the write (closes the check-then-write race). Asset
  // overlap → hard 400 naming the blocker; active-reservation overlap → 409
  // (advisory — retried with overrideReservationId to place anyway).
  private async assertUSlotAvailable(
    tx: Prisma.TransactionClient,
    placement: UPlacement & { cabinetId: string },
    opts: { excludeAssetId?: string; overrideReservationId?: string | null } = {}
  ) {
    const cabinet = await tx.cabinet.findUnique({
      where: { id: placement.cabinetId },
      select: { totalU: true, startingUnit: true }
    });
    if (!cabinet) throw new BadRequestException("Cabinet not found.");

    const bounds = uSlotOutOfBounds(placement, cabinet);
    if (bounds) throw new BadRequestException(bounds);

    const occupants = await tx.asset.findMany({
      where: {
        cabinetId: placement.cabinetId,
        uPosition: { not: null },
        isZeroU: false,
        ...(opts.excludeAssetId ? { id: { not: opts.excludeAssetId } } : {})
      },
      select: { id: true, name: true, uPosition: true, uHeight: true, rackSide: true, isFullDepth: true }
    });
    const assetConflicts = findUSlotConflicts(
      placement,
      occupants.map((a) => ({ ...a, uPosition: a.uPosition as number, label: a.name }))
    );
    if (assetConflicts.length > 0) {
      const h = Math.max(1, Math.ceil(placement.uHeight ?? 1));
      const range = h > 1 ? `U${placement.uPosition}–${placement.uPosition + h - 1}` : `U${placement.uPosition}`;
      const side = (placement.rackSide ?? "FRONT").toLowerCase();
      throw new BadRequestException(`${range} ${side} is occupied by ${assetConflicts[0].label}.`);
    }

    const reservations = await tx.cabinetReservation.findMany({
      where: { cabinetId: placement.cabinetId, ...activeReservationWhere() },
      select: { id: true, name: true, uStart: true, uHeight: true, rackSide: true, expiresAt: true }
    });
    const reservationConflicts = findUSlotConflicts(
      placement,
      // Reservations block their stated face (or both when rackSide is null),
      // regardless of the incoming asset's depth — treat as full depth.
      reservations.map((r) => ({
        id: r.id, label: r.name, uPosition: r.uStart, uHeight: r.uHeight,
        rackSide: r.rackSide, isFullDepth: true
      }))
    ).filter((c) => c.id !== opts.overrideReservationId);
    if (reservationConflicts.length > 0) {
      const blocker = reservations.find((r) => r.id === reservationConflicts[0].id)!;
      throw new ConflictException({
        message: `This range is reserved for "${blocker.name}".`,
        reservation: { id: blocker.id, name: blocker.name, expiresAt: blocker.expiresAt }
      });
    }
  }

  private async backfillRackSide(clientId: string) {
    await this.prisma.asset.updateMany({
      where: { clientId, rackSide: null },
      data: { rackSide: "FRONT" }
    });
  }

  async listForClient(clientId: string, role: Role) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
    await this.backfillRackSide(clientId);

    const assetInclude = {
      cabinet: { include: { room: { select: { id: true, name: true } } } },
      site: true,
    } as const;

    if (!isOrgSuperRole(role)) {
      return this.prisma.asset.findMany({
        where: {
          ownerType: OwnerType.CLIENT,
          clientId
        },
        include: assetInclude,
        orderBy: { updatedAt: "desc" }
      });
    }

    return this.prisma.asset.findMany({
      where: {
        OR: [
          { ownerType: OwnerType.INTERNAL },
          { ownerType: OwnerType.CLIENT, clientId }
        ]
      },
      include: assetInclude,
      orderBy: { updatedAt: "desc" }
    });
  }

  async getByIdForClient(assetId: string, clientId: string, role: Role) {
    if (!clientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        cabinet: { include: { room: { select: { id: true, name: true } } } },
        site: true,
      }
    });

    if (!asset) throw new NotFoundException("Asset not found");

    if (!isOrgSuperRole(role)) {
      if (asset.ownerType !== OwnerType.CLIENT || asset.clientId !== clientId) {
        throw new ForbiddenException("Asset not in your client scope");
      }
    }

    // Documents on the asset (Hyperview pattern) — resolver-spread like every
    // other attachable read. Concrete clientId in the resolver means INTERNAL
    // (null-client) assets simply resolve to none.
    const attachments = await resolveAttachments(this.prisma, clientId, "asset", asset.id);
    return { ...asset, attachments };
  }

  async create(dto: any, requesterClientId: string, requesterRole: Role, actorUserId: string) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");
    const targetClientId = dto.clientId ?? requesterClientId;

    if (dto.ownerType === OwnerType.CLIENT && !targetClientId) {
      throw new BadRequestException("clientId is required when ownerType is CLIENT.");
    }

    if (
      !isOrgSuperRole(requesterRole) &&
      dto.ownerType === OwnerType.CLIENT &&
      targetClientId !== requesterClientId
    ) {
      throw new ForbiddenException("Cannot create client-owned asset for a different client.");
    }

    if (dto.ownerType === OwnerType.INTERNAL && !isOrgSuperRole(requesterRole)) {
      throw new ForbiddenException("Only admins can create INTERNAL assets.");
    }

    const asset = await this.prisma.$transaction(async (tx) => {
      // Denormalise placement + capacity fields from the DeviceType (spec §2.2/§4.1):
      // isFullDepth (null = full depth, conservative), weightKg, and the budgeted
      // watts (nameplate × per-type or default derate). All stamped ONCE at
      // placement; thereafter plain editable asset fields. Explicit dto values win.
      let isFullDepth: boolean | null = dto.isFullDepth ?? null;
      let dt: { isFullDepth: boolean | null; powerDrawW: number | null; weightKg: number | null; deratePct: number | null } | null = null;
      if (dto.deviceTypeId) {
        dt = await tx.deviceType.findUnique({
          where: { id: dto.deviceTypeId },
          select: { isFullDepth: true, powerDrawW: true, weightKg: true, deratePct: true }
        });
      }
      if (isFullDepth == null) isFullDepth = dt?.isFullDepth ?? null;

      const nameplateW = dto.powerDrawW ?? dt?.powerDrawW ?? null;
      const derate = dt?.deratePct ?? DCIM_DEFAULT_DERATE_PCT;
      const budgetedDrawW = dto.budgetedDrawW ?? (nameplateW != null ? Math.round(nameplateW * derate / 100) : null);
      const weightKg = dto.weightKg ?? dt?.weightKg ?? null;

      const isZeroU = dto.isZeroU === true;
      const rackSide = dto.rackSide === "REAR" ? "REAR" : "FRONT";
      const uPosition = isZeroU ? null : dto.uPosition ?? null;

      if (dto.cabinetId && uPosition != null) {
        await this.assertUSlotAvailable(
          tx,
          { cabinetId: dto.cabinetId, uPosition, uHeight: dto.uHeight, rackSide, isFullDepth },
          { overrideReservationId: dto.overrideReservationId ?? null }
        );
      }

      return tx.asset.create({
        data: {
          assetTag: dto.assetTag,
          name: dto.name,
          assetType: dto.assetType,
          ownerType: dto.ownerType,
          clientId: dto.ownerType === OwnerType.CLIENT ? targetClientId : null,
          siteId: dto.siteId ?? null,
          cabinetId: dto.cabinetId ?? null,
          deviceTypeId: dto.deviceTypeId ?? null,
          status: dto.status ?? "ACTIVE",
          manufacturer: dto.manufacturer ?? null,
          modelNumber: dto.modelNumber ?? null,
          serialNumber: dto.serialNumber ?? null,
          uHeight: dto.uHeight ?? null,
          uPosition,
          isFullDepth,
          isZeroU,
          powerDrawW: nameplateW,
          budgetedDrawW,
          weightKg,
          ipAddress: dto.ipAddress ?? null,
          warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : null,
          lifecycleState: dto.lifecycleState ?? "ACTIVE",
          notes: dto.notes ?? null,
          location: dto.location ?? null,
          rackSide
        }
      });
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Asset",
        entityId: asset.id,
        action: "CREATED",
        actorUserId,
        clientId: asset.clientId ?? requesterClientId,
        data: { assetTag: asset.assetTag, name: asset.name, siteId: asset.siteId, cabinetId: asset.cabinetId }
      }
    });

    return asset;
  }

  async removeForClient(assetId: string, requesterClientId: string, requesterRole: Role, actorUserId: string) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId }
    });
    if (!asset) throw new BadRequestException("Asset not found.");

    if (!isOrgSuperRole(requesterRole)) {
      if (asset.ownerType !== OwnerType.CLIENT || asset.clientId !== requesterClientId) {
        throw new ForbiddenException("Cannot delete assets outside your client scope.");
      }
    } else if (asset.ownerType === OwnerType.CLIENT && asset.clientId !== requesterClientId) {
      throw new ForbiddenException("Selected scope does not match this client-owned asset.");
    }

    const deleted = await this.prisma.asset.delete({ where: { id: asset.id } });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Asset",
        entityId: asset.id,
        action: "DELETED",
        actorUserId,
        clientId: asset.clientId ?? requesterClientId,
        data: { assetTag: asset.assetTag, name: asset.name }
      }
    });

    return deleted;
  }

  // Shared scope guard for the deletion-request flow (mirrors the inline checks in
  // removeForClient/updateForClient): non-super actors are confined to their own
  // CLIENT-owned assets; org-super must have the matching client scope selected.
  private assertAssetInScope(
    asset: { ownerType: OwnerType; clientId: string | null },
    requesterClientId: string,
    requesterRole: Role,
    verb: string
  ) {
    if (!isOrgSuperRole(requesterRole)) {
      if (asset.ownerType !== OwnerType.CLIENT || asset.clientId !== requesterClientId) {
        throw new ForbiddenException(`Cannot ${verb} assets outside your client scope.`);
      }
    } else if (asset.ownerType === OwnerType.CLIENT && asset.clientId !== requesterClientId) {
      throw new ForbiddenException("Selected scope does not match this client-owned asset.");
    }
  }

  // ENGINEER / SERVICE_DESK_ANALYST raise a deletion request (no direct delete).
  async requestDeletion(
    assetId: string,
    requesterClientId: string,
    requesterRole: Role,
    actorUserId: string,
    reason?: string
  ) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException("Asset not found.");
    this.assertAssetInScope(asset, requesterClientId, requesterRole, "request deletion for");

    if (asset.deletionStatus === "PENDING") {
      throw new BadRequestException("A deletion request is already pending for this asset.");
    }

    const updated = await this.prisma.asset.update({
      where: { id: asset.id },
      data: {
        deletionStatus: "PENDING",
        deletionRequestedById: actorUserId,
        deletionRequestedAt: new Date(),
        deletionReason: reason ?? null
      }
    });

    await emitAudit(this.prisma, {
      entityType: "Asset",
      entityId: asset.id,
      action: "DELETION_REQUESTED",
      actorUserId,
      clientId: asset.clientId ?? requesterClientId,
      reference: asset.assetTag,
      title: asset.name,
      comment: reason ?? null
    });

    return updated;
  }

  // Approver queue: assets in this client scope awaiting a deletion decision.
  async listPendingDeletions(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");

    const assets = await this.prisma.asset.findMany({
      where: { clientId, deletionStatus: "PENDING" },
      include: {
        cabinet: { include: { room: { select: { id: true, name: true } } } },
        site: true
      },
      orderBy: { deletionRequestedAt: "desc" }
    });

    // Resolve requester display names in one batch (bare-id pattern, mirrors resolveCreator).
    const requesterIds = [
      ...new Set(assets.map((a) => a.deletionRequestedById).filter((id): id is string => !!id))
    ];
    const users = requesterIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: userDisplaySelect })
      : [];
    const nameById = new Map(users.map((u) => [u.id, computeDisplayName(u)]));

    return assets.map((a) => ({
      ...a,
      requestedBy: a.deletionRequestedById
        ? { id: a.deletionRequestedById, displayName: nameById.get(a.deletionRequestedById) ?? null }
        : null
    }));
  }

  // Approve → the actual hard delete happens (reuses removeForClient, which also
  // emits the existing DELETED audit event).
  async approveDeletion(
    assetId: string,
    requesterClientId: string,
    requesterRole: Role,
    actorUserId: string
  ) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException("Asset not found.");
    if (asset.deletionStatus !== "PENDING") {
      throw new BadRequestException("No pending deletion request for this asset.");
    }
    this.assertAssetInScope(asset, requesterClientId, requesterRole, "approve deletion for");

    await emitAudit(this.prisma, {
      entityType: "Asset",
      entityId: asset.id,
      action: "DELETION_APPROVED",
      actorUserId,
      clientId: asset.clientId ?? requesterClientId,
      reference: asset.assetTag,
      title: asset.name,
      changes: [{ field: "deletionStatus", label: "Deletion", from: "Pending", to: "Approved" }]
    });

    return this.removeForClient(asset.id, requesterClientId, requesterRole, actorUserId);
  }

  // Reject → clear the request (fields back to null); the asset survives.
  async rejectDeletion(
    assetId: string,
    requesterClientId: string,
    requesterRole: Role,
    actorUserId: string,
    notes?: string
  ) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException("Asset not found.");
    if (asset.deletionStatus !== "PENDING") {
      throw new BadRequestException("No pending deletion request for this asset.");
    }
    this.assertAssetInScope(asset, requesterClientId, requesterRole, "reject deletion for");

    const updated = await this.prisma.asset.update({
      where: { id: asset.id },
      data: {
        deletionStatus: null,
        deletionRequestedById: null,
        deletionRequestedAt: null,
        deletionReason: null
      }
    });

    await emitAudit(this.prisma, {
      entityType: "Asset",
      entityId: asset.id,
      action: "DELETION_REJECTED",
      actorUserId,
      clientId: asset.clientId ?? requesterClientId,
      reference: asset.assetTag,
      title: asset.name,
      comment: notes ?? null
    });

    return updated;
  }

  // Decommission workflow (DCIM_SCHEMA_SPEC §4.2): retire → physically remove →
  // dispose, each step audited. Capacity frees at RETIRE (the engine excludes
  // RETIRED); the elevation draws retired-but-racked kit greyed until REMOVE
  // clears its position. No hard-delete — history is preserved.
  async decommission(
    assetId: string,
    step: "RETIRE" | "REMOVE" | "DISPOSE",
    requesterClientId: string,
    requesterRole: Role,
    actorUserId: string
  ) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException("Asset not found.");
    this.assertAssetInScope(asset, requesterClientId, requesterRole, "decommission");

    let data: Record<string, any>;
    let action: string;
    let changes: { field: string; label: string; from: string; to: string }[];

    if (step === "RETIRE") {
      if (asset.lifecycleState === AssetLifecycleState.RETIRED) {
        throw new BadRequestException("Asset is already retired.");
      }
      data = {
        lifecycleState: AssetLifecycleState.RETIRED,
        disposalStatus: asset.disposalStatus ?? "MARKED_FOR_DISPOSAL"
      };
      action = "DECOMMISSION_RETIRED";
      changes = [{ field: "lifecycleState", label: "Lifecycle", from: asset.lifecycleState, to: "RETIRED" }];
    } else if (step === "REMOVE") {
      if (asset.lifecycleState !== AssetLifecycleState.RETIRED) {
        throw new BadRequestException("Retire the asset before marking it physically removed.");
      }
      if (asset.physicallyRemoved) throw new BadRequestException("Asset is already marked removed.");
      data = { physicallyRemoved: true, uPosition: null, rackSide: null };
      action = "DECOMMISSION_REMOVED";
      changes = [{ field: "physicallyRemoved", label: "Physically removed", from: "No", to: "Yes" }];
    } else {
      if (asset.lifecycleState !== AssetLifecycleState.RETIRED) {
        throw new BadRequestException("Retire the asset before marking it disposed.");
      }
      if (asset.disposalStatus === "DISPOSED") throw new BadRequestException("Asset is already disposed.");
      data = { disposalStatus: "DISPOSED" };
      action = "DECOMMISSION_DISPOSED";
      changes = [{ field: "disposalStatus", label: "Disposal", from: asset.disposalStatus ?? "—", to: "DISPOSED" }];
    }

    const updated = await this.prisma.asset.update({ where: { id: asset.id }, data });

    await emitAudit(this.prisma, {
      entityType: "Asset",
      entityId: asset.id,
      action,
      actorUserId,
      clientId: asset.clientId ?? requesterClientId,
      reference: asset.assetTag,
      title: asset.name,
      changes
    });

    return updated;
  }

  // MAC↔ITSM fusion (Horizon 2): raise a work order (Task or Change) against an
  // asset and STAGE the pending op on it. When that work order completes, the
  // status-update hook applies the op automatically (see work-orders/apply-
  // pending.ts). One pending op per asset. INSTALL targets a PLANNED asset
  // (→ ACTIVE on done); DECOMMISSION targets a live asset (→ RETIRED on done).
  async raiseWorkOrder(
    assetId: string,
    requesterClientId: string,
    requesterRole: Role,
    actorUserId: string,
    dto: {
      op: "INSTALL" | "DECOMMISSION"
      workOrderType: "task" | "change"
      title?: string; description?: string; priority?: string
      changeType?: string; scheduledStart?: string; scheduledEnd?: string; assigneeId?: string
    }
  ) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException("Asset not found.");
    this.assertAssetInScope(asset, requesterClientId, requesterRole, "raise a work order for");

    if (asset.pendingOp) throw new BadRequestException("This asset already has a pending work order.");
    if (dto.op === "INSTALL" && asset.lifecycleState !== AssetLifecycleState.PLANNED) {
      throw new BadRequestException("Install work orders apply to planned assets only.");
    }
    if (dto.op === "DECOMMISSION" && asset.lifecycleState === AssetLifecycleState.RETIRED) {
      throw new BadRequestException("Asset is already retired.");
    }

    const clientId = asset.clientId ?? requesterClientId;
    const where = `${asset.name} (${asset.assetTag})`;
    const title = dto.title?.trim() ||
      (dto.op === "INSTALL" ? `Install ${where}` : `Decommission ${where}`);
    const description = dto.description?.trim() ||
      (dto.op === "INSTALL"
        ? `Physically install and commission ${where}. Mark this work order done once it is racked and live — the asset then activates automatically.`
        : `Decommission ${where}. Completing this change retires the asset and frees its capacity.`);

    const workOrder = dto.workOrderType === "task"
      ? await this.tasks.createForClient(clientId, actorUserId, {
          title, description, priority: dto.priority, assigneeId: dto.assigneeId,
          linkedEntityType: "Asset", linkedEntityId: asset.id,
        })
      : await this.changes.createForClient(clientId, actorUserId, {
          title, description, changeType: dto.changeType, priority: dto.priority,
          scheduledStart: dto.scheduledStart, scheduledEnd: dto.scheduledEnd, assigneeId: dto.assigneeId,
          linkedEntityType: "Asset", linkedEntityId: asset.id,
        });

    const updated = await this.prisma.asset.update({
      where: { id: asset.id },
      data: { pendingOp: dto.op, pendingWorkOrderType: dto.workOrderType, pendingWorkOrderId: workOrder.id },
    });

    await emitAudit(this.prisma, {
      entityType: "Asset", entityId: asset.id, action: "WORK_ORDER_RAISED",
      actorUserId, clientId, reference: asset.assetTag, title: asset.name,
      comment: `${dto.op === "INSTALL" ? "Install" : "Decommission"} ${dto.workOrderType} raised: ${workOrder.reference}`,
    });

    return {
      asset: updated,
      workOrder: { id: workOrder.id, reference: workOrder.reference, type: dto.workOrderType },
    };
  }

  async updateForClient(assetId: string, dto: {
    assetTag?: string
    name?: string
    assetType?: string
    siteId?: string | null
    cabinetId?: string | null
    deviceTypeId?: string | null
    status?: string
    manufacturer?: string
    modelNumber?: string
    serialNumber?: string
    uHeight?: number | null
    uPosition?: number | null
    isFullDepth?: boolean | null
    isZeroU?: boolean
    powerDrawW?: number | null
    budgetedDrawW?: number | null
    weightKg?: number | null
    ipAddress?: string
    lifecycleState?: AssetLifecycleState
    notes?: string
    location?: string
    rackSide?: "FRONT" | "REAR" | null
    overrideReservationId?: string | null
    customValues?: Record<string, unknown>
  }, requesterClientId: string, requesterRole: Role, actorUserId: string) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId }
    });
    if (!asset) throw new BadRequestException("Asset not found.");

    if (!isOrgSuperRole(requesterRole)) {
      if (asset.ownerType !== OwnerType.CLIENT || asset.clientId !== requesterClientId) {
        throw new ForbiddenException("Cannot update assets outside your client scope.");
      }
    } else if (asset.ownerType === OwnerType.CLIENT && asset.clientId !== requesterClientId) {
      throw new ForbiddenException("Selected scope does not match this client-owned asset.");
    }

    const targetSiteId = dto.siteId !== undefined ? dto.siteId : asset.siteId;
    const targetCabinetId = dto.cabinetId !== undefined ? dto.cabinetId : asset.cabinetId;

    if (targetSiteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: targetSiteId, clientId: requesterClientId }
      });
      if (!site) throw new BadRequestException("Target site not found for selected client scope.");
    }

    if (targetCabinetId) {
      const cabinet = await this.prisma.cabinet.findFirst({
        where: { id: targetCabinetId, site: { clientId: requesterClientId } }
      });
      if (!cabinet) throw new BadRequestException("Target cabinet not found for selected client scope.");
      if (targetSiteId && cabinet.siteId !== targetSiteId) {
        throw new BadRequestException("Selected cabinet does not belong to selected site.");
      }
    }

    // Attaching a NEW device type re-stamps the denormalised specs (spec §3.2/§4.1):
    // the catalogue populates blanks, dto values still win, and the existing values
    // are the fallback. null unlinks (keeps the values as free-text). Fetched up
    // front so the collision check below uses the (possibly new) isFullDepth.
    const newTypeAttached =
      dto.deviceTypeId !== undefined && dto.deviceTypeId != null && dto.deviceTypeId !== asset.deviceTypeId;
    let dt: { isFullDepth: boolean | null; powerDrawW: number | null; weightKg: number | null; deratePct: number | null } | null = null;
    if (newTypeAttached) {
      dt = await this.prisma.deviceType.findUnique({
        where: { id: dto.deviceTypeId! },
        select: { isFullDepth: true, powerDrawW: true, weightKg: true, deratePct: true }
      });
      if (!dt) throw new BadRequestException("Device type not found.");
    }

    // Resolve the TARGET placement/specs (dto wins, else stamp from type, else keep).
    const targetUHeight = dto.uHeight !== undefined ? dto.uHeight : asset.uHeight;
    const targetUPosition = dto.uPosition !== undefined ? dto.uPosition : asset.uPosition;
    const targetIsFullDepth = dto.isFullDepth !== undefined ? dto.isFullDepth : (dt ? dt.isFullDepth : asset.isFullDepth);
    const targetIsZeroU = dto.isZeroU !== undefined ? dto.isZeroU : asset.isZeroU;
    const targetRackSide =
      dto.rackSide === "REAR" ? "REAR" : dto.rackSide === "FRONT" ? "FRONT" : asset.rackSide ?? "FRONT";
    const targetPowerDrawW = dto.powerDrawW !== undefined ? dto.powerDrawW : (dt ? dt.powerDrawW : asset.powerDrawW);
    const targetWeightKg = dto.weightKg !== undefined ? dto.weightKg : (dt ? dt.weightKg : asset.weightKg);
    const stampedBudget = dt && targetPowerDrawW != null
      ? Math.round(targetPowerDrawW * (dt.deratePct ?? DCIM_DEFAULT_DERATE_PCT) / 100)
      : undefined;
    const targetBudgetedDrawW = dto.budgetedDrawW !== undefined ? dto.budgetedDrawW : (stampedBudget ?? asset.budgetedDrawW);
    const targetDeviceTypeId = dto.deviceTypeId !== undefined ? dto.deviceTypeId : asset.deviceTypeId;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (targetCabinetId && targetUPosition != null && !targetIsZeroU) {
        await this.assertUSlotAvailable(
          tx,
          {
            cabinetId: targetCabinetId,
            uPosition: targetUPosition,
            uHeight: targetUHeight,
            rackSide: targetRackSide,
            isFullDepth: targetIsFullDepth
          },
          { excludeAssetId: asset.id, overrideReservationId: dto.overrideReservationId ?? null }
        );
      }

      return tx.asset.update({
        where: { id: assetId },
        data: {
          assetTag: dto.assetTag ?? asset.assetTag,
          name: dto.name ?? asset.name,
          assetType: dto.assetType ?? asset.assetType,
          siteId: targetSiteId ?? null,
          cabinetId: targetCabinetId ?? null,
          deviceTypeId: targetDeviceTypeId,
          status: dto.status ?? asset.status,
          manufacturer: dto.manufacturer ?? asset.manufacturer,
          modelNumber: dto.modelNumber ?? asset.modelNumber,
          serialNumber: dto.serialNumber ?? asset.serialNumber,
          uHeight: targetUHeight,
          uPosition: targetIsZeroU ? null : targetUPosition,
          isFullDepth: targetIsFullDepth,
          isZeroU: targetIsZeroU,
          powerDrawW: targetPowerDrawW,
          budgetedDrawW: targetBudgetedDrawW,
          weightKg: targetWeightKg,
          ipAddress: dto.ipAddress ?? asset.ipAddress,
          lifecycleState: dto.lifecycleState ?? asset.lifecycleState,
          notes: dto.notes ?? asset.notes,
          location: dto.location ?? asset.location,
          rackSide: targetRackSide,
          // Merge custom property values (partial patch), preserving unrelated
          // keys; explicit null on a key clears just that field.
          customValues: dto.customValues !== undefined
            ? ({ ...(asset.customValues as Record<string, unknown> ?? {}), ...dto.customValues } as Prisma.InputJsonValue)
            : undefined,
        }
      });
    });

    // ── Classify the change and emit an audit event ───────────────────
    const trackedFields = [
      "assetTag", "name", "assetType", "manufacturer", "modelNumber", "serialNumber",
      "ipAddress", "notes", "location", "status", "lifecycleState",
      "siteId", "cabinetId", "uPosition", "uHeight", "rackSide", "powerDrawW",
      "isFullDepth", "isZeroU", "budgetedDrawW", "weightKg", "deviceTypeId"
    ] as const;

    const changes: { field: string; from: any; to: any }[] = [];
    for (const field of trackedFields) {
      const before = (asset as any)[field] ?? null;
      const after = (updated as any)[field] ?? null;
      if (before !== after) changes.push({ field, from: before, to: after });
    }

    if (changes.length > 0) {
      const changedFields = new Set(changes.map(c => c.field));
      const statusOnly =
        changedFields.size > 0 &&
        [...changedFields].every(f => f === "lifecycleState" || f === "status");
      const locationFields = new Set(["siteId", "cabinetId", "uPosition", "rackSide"]);
      const locationChanged = [...changedFields].some(f => locationFields.has(f));

      let action: string;
      let data: any;
      if (statusOnly && changedFields.has("lifecycleState")) {
        action = "STATUS_UPDATED";
        data = { from: asset.lifecycleState, to: updated.lifecycleState, changes };
      } else if (locationChanged) {
        action = "MOVED";
        data = { changes };
      } else {
        action = "UPDATED";
        data = { changes };
      }

      await this.prisma.auditEvent.create({
        data: {
          entityType: "Asset",
          entityId: updated.id,
          action,
          actorUserId,
          clientId: updated.clientId ?? requesterClientId,
          data,
        }
      });
    }

    return updated;
  }

  async importFromCsv(
    clientId: string,
    siteId: string,
    rows: any[],
    actorUserId: string
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    if (!clientId) throw new ForbiddenException("Missing client scope")

    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new BadRequestException("Site not found")

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] }

    for (const row of rows) {
      try {
        const hyperviewAssetId = row["Asset ID"] ?? row["AssetId"] ?? null
        const name = row["Name"] ?? row["name"] ?? ""
        const assetType = row["Type"] ?? row["AssetType"] ?? row["assetType"] ?? "Unknown"
        const manufacturer = row["Manufacturer"] ?? row["manufacturer"] ?? null
        const modelNumber = row["Model"] ?? row["model"] ?? null
        const serialNumber = row["Serial Number"] ?? row["SerialNumber"] ?? row["serialNumber"] ?? ""
        const locationPath: string = row["Asset Location"] ?? row["AssetLocation"] ?? ""
        const lifecycleRaw: string = row["LifecycleState"] ?? row["lifecycleState"] ?? "ACTIVE"
        const assetTag = row["AssetTag"] ?? row["assetTag"] ?? null

        if (!name) { results.skipped++; continue }

        const locationParts = locationPath.split("/").map((p: string) => p.trim()).filter(Boolean)
        const rackName = locationParts.length >= 1 ? locationParts[locationParts.length - 1] : null

        const lifecycleMap: Record<string, string> = {
          Active: "ACTIVE", active: "ACTIVE", ACTIVE: "ACTIVE",
          Planned: "PLANNED", planned: "PLANNED", PLANNED: "PLANNED",
          Procurement: "PROCUREMENT", procurement: "PROCUREMENT", PROCUREMENT: "PROCUREMENT",
          Staging: "STAGING", staging: "STAGING", STAGING: "STAGING",
          Retired: "RETIRED", retired: "RETIRED", RETIRED: "RETIRED"
        }
        const lifecycleState = lifecycleMap[lifecycleRaw] ?? "ACTIVE"

        let cabinetId: string | null = null
        if (rackName) {
          const cabinet = await this.prisma.cabinet.findFirst({
            where: { siteId, name: { equals: rackName, mode: "insensitive" } }
          })
          cabinetId = cabinet?.id ?? null
        }

        const existing = await this.prisma.asset.findFirst({
          where: {
            clientId,
            OR: [
              ...(hyperviewAssetId ? [{ hyperviewAssetId }] : []),
              ...(serialNumber ? [{ serialNumber }] : [])
            ].filter(Boolean)
          }
        })

        if (existing) {
          await this.prisma.asset.update({
            where: { id: existing.id },
            data: {
              name,
              manufacturer,
              modelNumber,
              cabinetId,
              siteId,
              lifecycleState: lifecycleState as any,
              hyperviewAssetId: hyperviewAssetId ?? existing.hyperviewAssetId,
              lastSyncedAt: new Date(),
              rackSide: existing.rackSide ?? "FRONT"
            }
          })
          results.updated++
        } else {
          const generatedTag = assetTag || `HV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
          await this.prisma.asset.create({
            data: {
              assetTag: generatedTag,
              name,
              assetType,
              ownerType: "CLIENT",
              clientId,
              siteId,
              cabinetId,
              manufacturer,
              modelNumber,
              serialNumber: serialNumber || null,
              lifecycleState: lifecycleState as any,
              hyperviewAssetId,
              lastSyncedAt: new Date(),
              status: "ACTIVE",
              rackSide: "FRONT"
            }
          })
          results.created++
        }
      } catch (e: any) {
        results.errors.push(`Row error: ${e?.message ?? "Unknown error"}`)
      }
    }

    return results
  }

  async exportToCsv(clientId: string, siteId: string): Promise<string> {
    if (!clientId) throw new ForbiddenException("Missing client scope")

    const assets = await this.prisma.asset.findMany({
      where: { clientId, siteId },
      include: { cabinet: true },
      orderBy: [{ cabinet: { name: "asc" } }, { uPosition: "asc" }]
    })

    const headers = [
      "Asset ID", "Name", "Asset Location", "Type",
      "Manufacturer", "Model", "Serial Number", "Status", "Monitoring State",
      "LifecycleState", "IPAddress", "UPosition", "UHeight", "PowerDrawW",
      "AssetTag", "Notes"
    ]

    const escapeCell = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return ""
      const str = String(val)
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = assets.map(a => [
      a.hyperviewAssetId ?? "",
      a.name,
      a.cabinet?.name ?? "",
      a.assetType,
      a.manufacturer ?? "",
      a.modelNumber ?? "",
      a.serialNumber ?? "",
      "Normal",
      "Off",
      a.lifecycleState,
      a.ipAddress ?? "",
      a.uPosition ?? "",
      a.uHeight ?? 1,
      a.powerDrawW ?? "",
      a.assetTag,
      a.notes ?? ""
    ].map(escapeCell).join(","))

    return [headers.join(","), ...rows].join("\n")
  }

  async getForSite(clientId: string, siteId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    await this.backfillRackSide(clientId)
    return this.prisma.asset.findMany({
      where: { clientId, siteId },
      include: { cabinet: true },
      orderBy: [{ cabinet: { name: "asc" } }, { uPosition: "asc" }]
    })
  }
}