import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class CabinetsService {
  constructor(private prisma: PrismaService) {}

  async listForSite(clientId: string, siteId: string, roomId?: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new NotFoundException("Site not found")
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
            serialNumber: true, ipAddress: true, powerDrawW: true
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
}