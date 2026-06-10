import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { resolveLinkedRecords } from "../record-links/resolve-links"
import { resolveAttachments } from "../attachments/resolve-attachments"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `RSK-${y}-${n}`
}

@Injectable()
export class RisksService {
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
    return this.prisma.risk.findMany({
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
    const risk = await this.prisma.risk.findFirst({
      where: { id, clientId }
    })
    if (!risk) throw new NotFoundException("Risk not found")
    const links = await resolveLinkedRecords(this.prisma, clientId, "risk", risk.id)
    const attachments = await resolveAttachments(this.prisma, clientId, "risk", risk.id)
    return { ...risk, links, attachments }
  }

  async createForClient(clientId: string, actorUserId: string, dto: {
    title: string
    description: string
    likelihood?: string
    impact?: string
    mitigationPlan?: string
    source?: string
    linkedEntityType?: string
    linkedEntityId?: string
  }) {
    this.assertClientScope(clientId)
    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      const exists = await this.prisma.risk.findUnique({ where: { reference } })
      if (!exists) {
        const risk = await this.prisma.risk.create({
          data: {
            reference,
            clientId,
            title: dto.title,
            description: dto.description,
            likelihood: dto.likelihood ?? "MEDIUM",
            impact: dto.impact ?? "MEDIUM",
            mitigationPlan: dto.mitigationPlan,
            source: dto.source ?? "MANUAL",
            linkedEntityType: dto.linkedEntityType,
            linkedEntityId: dto.linkedEntityId,
            status: "IDENTIFIED"
          }
        })
        await this.prisma.auditEvent.create({
          data: {
            entityType: "Risk",
            entityId: risk.id,
            action: "CREATED",
            actorUserId,
            clientId,
            data: { reference: risk.reference, title: risk.title }
          }
        })
        return risk
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateStatusForClient(clientId: string, id: string, actorUserId: string, dto: {
    status: string
    acceptanceNote?: string
  }) {
    const risk = await this.getForClient(clientId, id)
    const updated = await this.prisma.risk.update({
      where: { id: risk.id },
      data: {
        status: dto.status,
        acceptanceNote: dto.acceptanceNote,
        closedAt: dto.status === "CLOSED" ? new Date() : undefined
      }
    })
    await this.prisma.auditEvent.create({
      data: {
        entityType: "Risk",
        entityId: risk.id,
        action: "STATUS_UPDATED",
        actorUserId,
        clientId,
        data: { from: risk.status, to: dto.status }
      }
    })
    return updated
  }

  async updateForClient(clientId: string, id: string, actorUserId: string, dto: {
    mitigationPlan?: string
    reviewDate?: string
    likelihood?: string
    impact?: string
    linkedEntityType?: string
    linkedEntityId?: string
  }) {
    const risk = await this.getForClient(clientId, id)
    const updated = await this.prisma.risk.update({
      where: { id: risk.id },
      data: {
        mitigationPlan: dto.mitigationPlan,
        likelihood: dto.likelihood,
        impact: dto.impact,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId
      }
    })
    await this.prisma.auditEvent.create({
      data: {
        entityType: "Risk",
        entityId: risk.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        data: { fields: Object.keys(dto).filter(k => (dto as any)[k] !== undefined) }
      }
    })
    return updated
  }
}