import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

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
    return this.prisma.cabinet.findMany({
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
            rackSide: true
          }
        }
      }
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