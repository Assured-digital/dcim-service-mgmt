import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class SitesService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string) {
    this.assertClientScope(clientId)
    return this.prisma.site.findMany({
      where: { clientId },
      orderBy: { name: "asc" },
      include: {
        cabinets: true,
        _count: { select: { assets: true, checks: true } }
      }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const site = await this.prisma.site.findFirst({
      where: { id, clientId },
      include: {
        cabinets: true,
        assets: { orderBy: { name: "asc" } },
        checks: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            assignee: { select: { id: true, email: true } }
          }
        }
      }
    })
    if (!site) throw new NotFoundException("Site not found")
    return site
  }

  async createForClient(clientId: string, actorUserId: string, dto: {
    name: string
    address?: string
    city?: string
    postcode?: string
    country?: string
    notes?: string
  }) {
    this.assertClientScope(clientId)
    const site = await this.prisma.site.create({
      data: {
        clientId,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        postcode: dto.postcode,
        country: dto.country ?? "UK",
        notes: dto.notes
      }
    })

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Site",
        entityId: site.id,
        action: "CREATED",
        actorUserId,
        clientId,
        data: { name: site.name }
      }
    })

    return site
  }

  async updateForClient(clientId: string, id: string, actorUserId: string, dto: {
    name?: string
    address?: string
    city?: string
    postcode?: string
    country?: string
    notes?: string
  }) {
    this.assertClientScope(clientId)
    const site = await this.getForClient(clientId, id)

    const updated = await this.prisma.site.update({
      where: { id: site.id },
      data: dto
    })

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Site",
        entityId: site.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        data: dto
      }
    })

    return updated
  }

  async removeForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const site = await this.getForClient(clientId, id)

    const [roomCount, cabinetCount, assetCount, checkCount] = await Promise.all([
      this.prisma.room.count({ where: { siteId: site.id } }),
      this.prisma.cabinet.count({ where: { siteId: site.id } }),
      this.prisma.asset.count({ where: { siteId: site.id } }),
      this.prisma.check.count({ where: { siteId: site.id } })
    ])

    if (roomCount > 0 || cabinetCount > 0 || assetCount > 0 || checkCount > 0) {
      throw new BadRequestException("Cannot delete site while rooms, racks, assets, or checks exist")
    }

    return this.prisma.site.delete({ where: { id: site.id } })
  }
}