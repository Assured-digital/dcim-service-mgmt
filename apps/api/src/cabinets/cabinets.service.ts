import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { resolveAttachmentsForRecords } from "../attachments/resolve-attachments"

@Injectable()
export class CabinetsService {
  constructor(private prisma: PrismaService) {}

  async listForSite(clientId: string, siteId: string, roomId?: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new NotFoundException("Site not found")
    await this.prisma.asset.updateMany({
      where: { clientId, siteId, rackSide: null },
      data: { rackSide: "FRONT" }
    })
    const cabinets = await this.prisma.cabinet.findMany({
      where: {
        siteId,
        ...(roomId ? { roomId } : {})
      },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { assets: true } },
        assets: {
          orderBy: { uPosition: "asc" },
          select: {
            id: true, name: true, assetTag: true, assetType: true,
            uPosition: true, uHeight: true, status: true,
            lifecycleState: true, manufacturer: true, modelNumber: true,
            serialNumber: true, ipAddress: true, powerDrawW: true,
            rackSide: true, isFullDepth: true, isZeroU: true,
            budgetedDrawW: true, weightKg: true,
            disposalStatus: true, physicallyRemoved: true,
            pendingOp: true, pendingWorkOrderType: true, pendingWorkOrderId: true,
            deviceType: { select: { excludeFromUtilization: true } }
          }
        },
        // ALL reservations (incl. expired — the panel greys them); collision
        // filtering to active-only happens server-side in the write paths.
        reservations: { orderBy: { uStart: "asc" } }
      }
    })

    // Documents per cabinet (Hyperview pattern) — batched (one query for the
    // whole site) to avoid an N+1 of per-cabinet resolver calls.
    const attachmentsByCabinet = await resolveAttachmentsForRecords(
      this.prisma, clientId, "cabinet", cabinets.map((c) => c.id)
    )

    // usedU is COMPUTED on read (DCIM spec §2.2): unique occupied units across
    // both faces, excluding zero-U kit and excludeFromUtilization types (blanking
    // panels occupy slots for collision but don't count toward fill %). The
    // stored Cabinet.usedU column is legacy and no longer written.
    return cabinets.map((cabinet) => {
      const occupied = new Set<number>()
      for (const a of cabinet.assets) {
        if (a.uPosition == null || a.isZeroU) continue
        if (a.deviceType?.excludeFromUtilization) continue
        // Retired-but-racked kit is DRAWN (greyed) but not COUNTED — capacity
        // frees the moment an asset retires (DCIM_SCHEMA_SPEC §4.1).
        if (a.lifecycleState === "RETIRED") continue
        const h = Math.max(1, Math.ceil(a.uHeight ?? 1))
        for (let u = a.uPosition; u < a.uPosition + h; u++) occupied.add(u)
      }
      return { ...cabinet, usedU: occupied.size, attachments: attachmentsByCabinet.get(cabinet.id) ?? [] }
    })
  }

  async createForSite(clientId: string, siteId: string, actorUserId: string, dto: {
    name: string
    type?: string
    totalU?: number
    powerKw?: number
    notes?: string
    roomId?: string
  }) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new NotFoundException("Site not found")

    const cabinet = await this.prisma.cabinet.create({
      data: {
        siteId,
        roomId: dto.roomId ?? null,
        name: dto.name,
        type: dto.type ?? "RACK",
        totalU: dto.totalU,
        powerKw: dto.powerKw,
        notes: dto.notes
      }
    })

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Cabinet",
        entityId: cabinet.id,
        action: "CREATED",
        actorUserId,
        clientId,
        data: { name: cabinet.name, siteId, roomId: dto.roomId }
      }
    })

    return cabinet
  }

  async assignRoom(clientId: string, siteId: string, cabinetId: string, roomId: string | null) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const cabinet = await this.prisma.cabinet.findFirst({ where: { id: cabinetId, siteId } })
    if (!cabinet) throw new NotFoundException("Cabinet not found")
    return this.prisma.cabinet.update({ where: { id: cabinetId }, data: { roomId } })
  }

  async updateForSite(clientId: string, siteId: string, cabinetId: string, dto: {
    name?: string
    type?: string
    totalU?: number
    powerKw?: number
    notes?: string
    roomId?: string | null
  }) {
    if (!clientId) throw new ForbiddenException("Missing client scope")

    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, siteId, site: { clientId } }
    })
    if (!cabinet) throw new NotFoundException("Cabinet not found")

    if (dto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: dto.roomId, siteId }
      })
      if (!room) throw new NotFoundException("Room not found")
    }

    return this.prisma.cabinet.update({
      where: { id: cabinetId },
      data: {
        name: dto.name ?? cabinet.name,
        type: dto.type ?? cabinet.type,
        totalU: dto.totalU ?? cabinet.totalU,
        powerKw: dto.powerKw ?? cabinet.powerKw,
        notes: dto.notes ?? cabinet.notes,
        roomId: dto.roomId !== undefined ? dto.roomId : cabinet.roomId
      }
    })
  }

  async removeForSite(clientId: string, siteId: string, cabinetId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")

    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, siteId, site: { clientId } },
      include: { _count: { select: { assets: true } } }
    })
    if (!cabinet) throw new NotFoundException("Cabinet not found")
    if (cabinet._count.assets > 0) throw new BadRequestException("Cannot delete rack with assets assigned")

    return this.prisma.cabinet.delete({ where: { id: cabinetId } })
  }
}