import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  private async assertSite(clientId: string, siteId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new NotFoundException("Site not found")
    return site
  }

  async listForSite(clientId: string, siteId: string) {
    await this.assertSite(clientId, siteId)
    return this.prisma.room.findMany({
      where: { siteId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { cabinets: true } },
        cabinets: {
          include: { _count: { select: { assets: true } } },
          select: {
            id: true, name: true, type: true,
            totalU: true, usedU: true, powerKw: true,
            _count: true
          }
        }
      }
    })
  }

  async createForSite(clientId: string, siteId: string, dto: {
    name: string; type?: string; floor?: string; notes?: string
  }) {
    await this.assertSite(clientId, siteId)
    return this.prisma.room.create({
      data: {
        siteId,
        name: dto.name,
        type: dto.type ?? "DATA_HALL",
        floor: dto.floor,
        notes: dto.notes
      }
    })
  }

  async update(clientId: string, siteId: string, roomId: string, dto: {
    name?: string; type?: string; floor?: string; notes?: string
  }) {
    await this.assertSite(clientId, siteId)
    const room = await this.prisma.room.findFirst({ where: { id: roomId, siteId } })
    if (!room) throw new NotFoundException("Room not found")
    return this.prisma.room.update({
      where: { id: roomId },
      data: { name: dto.name ?? room.name, type: dto.type ?? room.type, floor: dto.floor, notes: dto.notes }
    })
  }

  async remove(clientId: string, siteId: string, roomId: string) {
    await this.assertSite(clientId, siteId)
    const room = await this.prisma.room.findFirst({ where: { id: roomId, siteId } })
    if (!room) throw new NotFoundException("Room not found")
    return this.prisma.room.delete({ where: { id: roomId } })
  }
}