import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `RSK-${y}-${n}`
}

@Injectable()
export class RisksService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string) {
    this.assertClientScope(clientId)
    return this.prisma.risk.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const risk = await this.prisma.risk.findFirst({
      where: { id, clientId }
    })
    if (!risk) throw new NotFoundException("Risk not found")
    return risk
  }

  async createForClient(clientId: string, actorUserId: string, dto: {
    title: string
    description: string
    likelihood?: string
    impact?: string
    mitigationPlan?: string
    source?: string
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
  }) {
    const risk = await this.getForClient(clientId, id)
    const updated = await this.prisma.risk.update({
      where: { id: risk.id },
      data: {
        mitigationPlan: dto.mitigationPlan,
        likelihood: dto.likelihood,
        impact: dto.impact,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined
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