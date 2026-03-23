import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `WP-${y}-${n}`
}

@Injectable()
export class WorkPackagesService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string) {
    this.assertClientScope(clientId)
    return this.prisma.workPackage.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: {
        sites: { include: { site: { select: { id: true, name: true } } } }
      }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const wp = await this.prisma.workPackage.findFirst({
      where: { id, clientId },
      include: {
        sites: { include: { site: true } }
      }
    })
    if (!wp) throw new NotFoundException("Work package not found")
    return wp
  }

  async createForClient(clientId: string, actorUserId: string, dto: {
    title: string
    type?: string
    description?: string
    startDate?: string
    endDate?: string
    value?: number
    siteIds?: string[]
  }) {
    this.assertClientScope(clientId)

    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      const exists = await this.prisma.workPackage.findUnique({ where: { reference } })
      if (!exists) {
        const wp = await this.prisma.workPackage.create({
          data: {
            reference,
            clientId,
            title: dto.title,
            type: dto.type ?? "MANAGED_SERVICE",
            description: dto.description,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
            value: dto.value,
            status: "ACTIVE",
            sites: dto.siteIds ? {
              create: dto.siteIds.map(siteId => ({ siteId }))
            } : undefined
          }
        })

        await this.prisma.auditEvent.create({
          data: {
            entityType: "WorkPackage",
            entityId: wp.id,
            action: "CREATED",
            actorUserId,
            clientId,
            data: { reference: wp.reference, title: wp.title }
          }
        })

        return wp
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }
}