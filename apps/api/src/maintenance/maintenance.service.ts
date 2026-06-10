import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CreateMaintenanceDto, ListMaintenanceQueryDto, UpdateMaintenanceDto } from "./dto"
import { resolveAttachments } from "../attachments/resolve-attachments"

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

    return this.prisma.maintenanceLog.findMany({
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
        performedBy: { select: { id: true, email: true } }
      },
      orderBy: { performedAt: "desc" }
    })
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
        performedBy: { select: { id: true, email: true } }
      }
    })
    if (!record) throw new NotFoundException("Maintenance record not found")
    const attachments = await resolveAttachments(this.prisma, clientId, "maintenance", record.id)
    return { ...record, attachments }
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
        performedBy: { select: { id: true, email: true } }
      }
    })

    await this.refreshLastMaintenance(created.assetId)

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

    return created
  }

  async updateForClient(clientId: string, id: string, dto: UpdateMaintenanceDto) {
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
        performedBy: { select: { id: true, email: true } }
      }
    })

    await this.refreshLastMaintenance(existing.assetId)
    if (updated.assetId !== existing.assetId) {
      await this.refreshLastMaintenance(updated.assetId)
    }
    return updated
  }

  async removeForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const existing = await this.getForClient(clientId, id)
    const deleted = await this.prisma.maintenanceLog.delete({ where: { id: existing.id } })
    await this.refreshLastMaintenance(existing.assetId)
    return deleted
  }
}
