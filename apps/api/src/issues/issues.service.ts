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

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string) {
    this.assertClientScope(clientId)
    return this.prisma.issue.findMany({
      where: { clientId },
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
  }) {
    const issue = await this.getForClient(clientId, id)
    return this.prisma.issue.update({
      where: { id: issue.id },
      data: {
        severity: dto.severity,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined
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