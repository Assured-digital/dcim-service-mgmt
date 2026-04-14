import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `ISS-${y}-${n}`
}

@Injectable()
export class IssuesService {
  constructor(private prisma: PrismaService) {}

  private getCreatedAtRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return undefined
    return {
      gte: dateFrom ? this.parseDate(dateFrom, "start") : undefined,
      lte: dateTo ? this.parseDate(dateTo, "end") : undefined
    }
  }

  private parseDate(value: string, boundary: "start" | "end") {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return undefined
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (boundary === "start") date.setUTCHours(0, 0, 0, 0)
      else date.setUTCHours(23, 59, 59, 999)
    }
    return date
  }

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string, filters: {
    dateFrom?: string
    dateTo?: string
    linkedEntityType?: string
    linkedEntityId?: string
  } = {}) {
    this.assertClientScope(clientId)
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo)
    return this.prisma.issue.findMany({
      where: {
        clientId,
        linkedEntityType: filters.linkedEntityType || undefined,
        linkedEntityId: filters.linkedEntityId || undefined,
        createdAt
      },
      orderBy: { createdAt: "desc" }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const issue = await this.prisma.issue.findFirst({
      where: { id, clientId }
    })
    if (!issue) throw new NotFoundException("Issue not found")
    return issue
  }

  async createForClient(clientId: string, actorUserId: string, dto: {
    title: string
    description: string
    severity?: string
    reviewDate?: string
    linkedEntityType?: string
    linkedEntityId?: string
  }) {
    this.assertClientScope(clientId)
    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      const exists = await this.prisma.issue.findUnique({ where: { reference } })
      if (!exists) {
        const issue = await this.prisma.issue.create({
          data: {
            reference,
            clientId,
            title: dto.title,
            description: dto.description,
            severity: dto.severity ?? "AMBER",
            reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
            linkedEntityType: dto.linkedEntityType,
            linkedEntityId: dto.linkedEntityId,
            status: "OPEN"
          }
        })
        await this.prisma.auditEvent.create({
          data: {
            entityType: "Issue",
            entityId: issue.id,
            action: "CREATED",
            actorUserId,
            clientId,
            data: { reference: issue.reference, title: issue.title }
          }
        })
        return issue
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateForClient(clientId: string, id: string, actorUserId: string, dto: {
    severity?: string
    reviewDate?: string
    linkedEntityType?: string
    linkedEntityId?: string
  }) {
    const issue = await this.getForClient(clientId, id)
    return this.prisma.issue.update({
      where: { id: issue.id },
      data: {
        severity: dto.severity,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId
      }
    })
  }

  async updateStatusForClient(clientId: string, id: string, actorUserId: string, dto: {
    status: string
    resolution?: string
  }) {
    const issue = await this.getForClient(clientId, id)
    const updated = await this.prisma.issue.update({
      where: { id: issue.id },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        closedAt: dto.status === "CLOSED" ? new Date() : undefined
      }
    })
    await this.prisma.auditEvent.create({
      data: {
        entityType: "Issue",
        entityId: issue.id,
        action: "STATUS_UPDATED",
        actorUserId,
        clientId,
        data: { from: issue.status, to: dto.status }
      }
    })
    return updated
  }
}