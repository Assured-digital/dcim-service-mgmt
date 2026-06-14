import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CreateMaintenanceDto, ListMaintenanceQueryDto, UpdateMaintenanceDto } from "./dto"
import { resolveAttachments } from "../attachments/resolve-attachments"
import { toUserDisplay, userDisplaySelect } from "../users/display"
import { diffRecord, type FieldSpec } from "../audit-events/diff-record"
import { emitAudit } from "../audit-events/emit-audit"

const WORK_TYPE_LABELS: Record<string, string> = {
  INSPECTION: "Inspection",
  PSU_REPLACEMENT: "PSU replacement",
  FIRMWARE_UPGRADE: "Firmware upgrade",
  PAT_INSPECTION: "PAT inspection",
  COOLING_CHECK: "Cooling check",
  CABLE_AUDIT: "Cable audit",
  REPAIR: "Repair",
  UPGRADE: "Upgrade",
  OTHER: "Other"
}

// Per-field humanisation for Maintenance updates. MaintenanceLog has no clientId (scoped via
// asset.clientId — the clientId param IS the asset's validated clientId) and no status field
// (so no STATUS_UPDATED). assetId + performedById are refs resolved from rows already in hand.
// performedAt/nextDueAt (dates) are omitted — diffRecord has no date kind.
const MAINTENANCE_FIELD_SPEC: FieldSpec = {
  assetId: { label: "Asset", kind: "ref" },
  workType: { label: "Work type", kind: "enum", labels: WORK_TYPE_LABELS },
  workTypeOther: { label: "Other work type", kind: "scalar" },
  performedById: { label: "Performed by", kind: "ref" },
  notes: { label: "Notes", kind: "scalar" }
}

@Injectable()
export class MaintenanceService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  private async ensureAssetInScope(clientId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, clientId }
    })
    if (!asset) throw new BadRequestException("Asset not found in selected client scope")
    return asset
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new BadRequestException("Performed-by user not found")
  }

  private async refreshLastMaintenance(assetId: string) {
    const latest = await this.prisma.maintenanceLog.findFirst({
      where: { assetId },
      orderBy: { performedAt: "desc" },
      select: { performedAt: true }
    })
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { lastMaintenanceAt: latest?.performedAt ?? null }
    })
  }

  async listForClient(clientId: string, query: ListMaintenanceQueryDto) {
    this.assertClientScope(clientId)

    const rows = await this.prisma.maintenanceLog.findMany({
      where: {
        asset: {
          clientId,
          id: query.assetId ?? undefined,
          siteId: query.siteId ?? undefined
        },
        performedById: query.performedById ?? undefined,
        workType: query.workType ?? undefined,
        performedAt: query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined
            }
          : undefined
      },
      include: {
        asset: {
          select: {
            id: true,
            assetTag: true,
            name: true,
            site: { select: { id: true, name: true } },
            cabinet: { select: { id: true, name: true } }
          }
        },
        performedBy: { select: userDisplaySelect }
      },
      orderBy: { performedAt: "desc" }
    })
    return rows.map((r) => ({ ...r, performedBy: toUserDisplay(r.performedBy) }))
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const record = await this.prisma.maintenanceLog.findFirst({
      where: { id, asset: { clientId } },
      include: {
        asset: {
          select: {
            id: true,
            assetTag: true,
            name: true,
            site: { select: { id: true, name: true } },
            cabinet: { select: { id: true, name: true } }
          }
        },
        performedBy: { select: userDisplaySelect }
      }
    })
    if (!record) throw new NotFoundException("Maintenance record not found")
    const attachments = await resolveAttachments(this.prisma, clientId, "maintenance", record.id)
    return { ...record, performedBy: toUserDisplay(record.performedBy), attachments }
  }

  async createForClient(clientId: string, actorUserId: string | null, dto: CreateMaintenanceDto) {
    this.assertClientScope(clientId)
    await this.ensureAssetInScope(clientId, dto.assetId)
    if (dto.performedById) await this.ensureUserExists(dto.performedById)

    const created = await this.prisma.maintenanceLog.create({
      data: {
        assetId: dto.assetId,
        workType: dto.workType ?? "OTHER",
        workTypeOther: dto.workTypeOther ?? null,
        performedAt: new Date(dto.performedAt),
        performedById: dto.performedById ?? actorUserId ?? undefined,
        notes: dto.notes ?? null,
        nextDueAt: dto.nextDueAt ? new Date(dto.nextDueAt) : null
      },
      include: {
        asset: {
          select: {
            id: true,
            assetTag: true,
            name: true,
            site: { select: { id: true, name: true } },
            cabinet: { select: { id: true, name: true } }
          }
        },
        performedBy: { select: userDisplaySelect }
      }
    })

    await this.refreshLastMaintenance(created.assetId)

    // Asset-scoped event — feeds the Asset detail History (entityType "Asset"/assetId). Kept as-is.
    if (actorUserId) {
      await this.prisma.auditEvent.create({
        data: {
          entityType: "Asset",
          entityId: created.assetId,
          action: "MAINTENANCE_LOGGED",
          actorUserId,
          clientId,
          data: {
            workType: created.workType,
            workTypeOther: created.workTypeOther ?? undefined,
            performedAt: created.performedAt.toISOString(),
            nextDueAt: created.nextDueAt ? created.nextDueAt.toISOString() : undefined
          }
        }
      })
    }

    // Maintenance-scoped event — feeds the Maintenance detail History (entityType "Maintenance"/log
    // id). clientId is the asset's validated clientId (ensureAssetInScope ran above). MaintenanceLog
    // has no reference/title, so the CREATED line renders as "created this maintenance".
    await emitAudit(this.prisma, {
      entityType: "Maintenance",
      entityId: created.id,
      action: "CREATED",
      actorUserId,
      clientId
    })

    return { ...created, performedBy: toUserDisplay(created.performedBy) }
  }

  async updateForClient(clientId: string, id: string, actorUserId: string | null, dto: UpdateMaintenanceDto) {
    this.assertClientScope(clientId)
    const existing = await this.getForClient(clientId, id)

    if (dto.assetId) await this.ensureAssetInScope(clientId, dto.assetId)
    if (dto.performedById) await this.ensureUserExists(dto.performedById)

    const updated = await this.prisma.maintenanceLog.update({
      where: { id: existing.id },
      data: {
        assetId: dto.assetId ?? existing.assetId,
        workType: dto.workType ?? existing.workType,
        workTypeOther: dto.workTypeOther ?? existing.workTypeOther,
        performedAt: dto.performedAt ? new Date(dto.performedAt) : existing.performedAt,
        performedById: dto.performedById ?? existing.performedById,
        notes: dto.notes ?? existing.notes,
        nextDueAt:
          dto.nextDueAt !== undefined
            ? dto.nextDueAt
              ? new Date(dto.nextDueAt)
              : null
            : existing.nextDueAt
      },
      include: {
        asset: {
          select: {
            id: true,
            assetTag: true,
            name: true,
            site: { select: { id: true, name: true } },
            cabinet: { select: { id: true, name: true } }
          }
        },
        performedBy: { select: userDisplaySelect }
      }
    })

    await this.refreshLastMaintenance(existing.assetId)
    if (updated.assetId !== existing.assetId) {
      await this.refreshLastMaintenance(updated.assetId)
    }

    const newPerformedBy = toUserDisplay(updated.performedBy)
    // Resolve asset + performedBy ids -> display from rows already loaded (existing via
    // getForClient, new via the update include) — no extra DB round-trip; humanised at emit time.
    const assetLabels = new Map<string, string>()
    if (existing.asset) assetLabels.set(existing.asset.id, existing.asset.assetTag ?? existing.asset.name)
    if (updated.asset) assetLabels.set(updated.asset.id, updated.asset.assetTag ?? updated.asset.name)
    const performerNames = new Map<string, string>()
    if (existing.performedBy) performerNames.set(existing.performedBy.id, existing.performedBy.displayName)
    if (newPerformedBy) performerNames.set(newPerformedBy.id, newPerformedBy.displayName)

    // Spread the DTO class instance into a plain object — diffRecord's dto param is an indexable
    // Record (a class type has no index signature; Risk/Issue pass anonymous object literals instead).
    const changes = diffRecord(existing, { ...dto }, MAINTENANCE_FIELD_SPEC, {
      assetId: (id) => (id ? assetLabels.get(id) ?? null : null),
      performedById: (id) => (id ? performerNames.get(id) ?? null : null)
    })
    if (changes.length) {
      await emitAudit(this.prisma, {
        entityType: "Maintenance",
        entityId: existing.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        changes
      })
    }

    return { ...updated, performedBy: newPerformedBy }
  }

  async removeForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const existing = await this.getForClient(clientId, id)
    const deleted = await this.prisma.maintenanceLog.delete({ where: { id: existing.id } })
    await this.refreshLastMaintenance(existing.assetId)
    return deleted
  }
}
