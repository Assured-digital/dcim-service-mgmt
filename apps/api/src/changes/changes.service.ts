import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `CHG-${y}-${n}`
}

@Injectable()
export class ChangesService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string) {
    this.assertClientScope(clientId)
    return this.prisma.changeRequest.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: { id: true, email: true } },
        approvals: { orderBy: { decidedAt: "desc" }, take: 1 }
      }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const change = await this.prisma.changeRequest.findFirst({
      where: { id, clientId },
      include: {
        assignee: { select: { id: true, email: true } },
        approvals: {
          orderBy: { decidedAt: "desc" },
          include: { approver: { select: { id: true, email: true } } }
        }
      }
    })
    if (!change) throw new NotFoundException("Change request not found")
    return change
  }

  async createForClient(clientId: string, actorUserId: string, dto: {
    title: string
    description: string
    changeType?: string
    priority?: string
    reason?: string
    impactAssessment?: string
    rollbackPlan?: string
    scheduledStart?: string
    scheduledEnd?: string
    assigneeId?: string
  }) {
    this.assertClientScope(clientId)

    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      const exists = await this.prisma.changeRequest.findUnique({ where: { reference } })
      if (!exists) {
        const change = await this.prisma.changeRequest.create({
          data: {
            reference,
            clientId,
            title: dto.title,
            description: dto.description,
            changeType: dto.changeType ?? "NORMAL",
            priority: dto.priority ?? "medium",
            reason: dto.reason,
            impactAssessment: dto.impactAssessment,
            rollbackPlan: dto.rollbackPlan,
            scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : undefined,
            scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : undefined,
            assigneeId: dto.assigneeId,
            createdById: actorUserId,
            status: "DRAFT"
          }
        })

        await this.prisma.auditEvent.create({
          data: {
            entityType: "ChangeRequest",
            entityId: change.id,
            action: "CREATED",
            actorUserId,
            clientId,
            data: { reference: change.reference, title: change.title }
          }
        })

        return change
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateStatusForClient(clientId: string, id: string, actorUserId: string, dto: {
    status: string
    implementationNotes?: string
    postImplReview?: string
  }) {
    const change = await this.getForClient(clientId, id)

    const updated = await this.prisma.changeRequest.update({
      where: { id: change.id },
      data: {
        status: dto.status,
        implementationNotes: dto.implementationNotes,
        postImplReview: dto.postImplReview,
        actualStart: dto.status === "IN_PROGRESS" ? new Date() : undefined,
        actualEnd: dto.status === "COMPLETED" ? new Date() : undefined,
        closedAt: dto.status === "CLOSED" ? new Date() : undefined
      }
    })

    await this.prisma.auditEvent.create({
      data: {
        entityType: "ChangeRequest",
        entityId: change.id,
        action: "STATUS_UPDATED",
        actorUserId,
        clientId,
        data: { from: change.status, to: dto.status }
      }
    })

    return updated
  }

  async addApproval(clientId: string, id: string, actorUserId: string, dto: {
    decision: string
    notes?: string
  }) {
    const change = await this.getForClient(clientId, id)

    const approval = await this.prisma.changeApproval.create({
      data: {
        changeRequestId: change.id,
        approverId: actorUserId,
        decision: dto.decision,
        notes: dto.notes
      }
    })

    const newStatus = dto.decision === "APPROVED" ? "APPROVED"
      : dto.decision === "REJECTED" ? "REJECTED"
      : change.status

    await this.prisma.changeRequest.update({
      where: { id: change.id },
      data: { status: newStatus }
    })

    await this.prisma.auditEvent.create({
      data: {
        entityType: "ChangeRequest",
        entityId: change.id,
        action: "APPROVAL_RECORDED",
        actorUserId,
        clientId,
        data: { decision: dto.decision }
      }
    })

    return approval
  }

  async updateForClient(clientId: string, id: string, actorUserId: string, dto: {
    priority?: string
    assigneeId?: string
    scheduledStart?: string
    scheduledEnd?: string
  }) {
    const change = await this.getForClient(clientId, id)

    return this.prisma.changeRequest.update({
      where: { id: change.id },
      data: {
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : undefined,
        scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : undefined
      }
    })
  }
}