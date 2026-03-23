import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class CabinetsService {
  constructor(private prisma: PrismaService) {}

  async listForSite(clientId: string, siteId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new NotFoundException("Site not found")
    return this.prisma.cabinet.findMany({
      where: { siteId },
      orderBy: { name: "asc" },
      include: { _count: { select: { assets: true } } }
    })
  }

  async createForSite(clientId: string, siteId: string, actorUserId: string, dto: {
    name: string
    type?: string
    totalU?: number
    powerKw?: number
    notes?: string
  }) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new NotFoundException("Site not found")

    const cabinet = await this.prisma.cabinet.create({
      data: {
        siteId,
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
        data: { name: cabinet.name, siteId }
      }
    })

    return cabinet
  }
}