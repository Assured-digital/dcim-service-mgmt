import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { resolveCreator } from "../users/creator"
import { toUserDisplay, userDisplaySelect } from "../users/display"
import { resolveLinkedRecords } from "../record-links/resolve-links"
import { resolveAttachments } from "../attachments/resolve-attachments"
import { diffRecord, type FieldSpec } from "../audit-events/diff-record"
import { emitAudit } from "../audit-events/emit-audit"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `CHG-${y}-${n}`
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
}

const CHANGE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled"
}

const DECISION_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DEFERRED: "Deferred"
}

// Per-field humanisation for ChangeRequest updates (UpdateChangeDto). `status` is NOT here — it
// changes via the status endpoint (STATUS_UPDATED). Date fields (scheduledStart/scheduledEnd) are
// omitted: the shared diffRecord has no date kind, and a Date-vs-ISO-string compare mis-renders.
const CHANGE_FIELD_SPEC: FieldSpec = {
  title: { label: "Title", kind: "scalar" },
  description: { label: "Description", kind: "scalar" },
  reason: { label: "Reason", kind: "scalar" },
  impactAssessment: { label: "Impact assessment", kind: "scalar" },
  rollbackPlan: { label: "Rollback plan", kind: "scalar" },
  implementationNotes: { label: "Implementation notes", kind: "scalar" },
  postImplReview: { label: "Post-implementation review", kind: "scalar" },
  priority: { label: "Priority", kind: "enum", labels: PRIORITY_LABELS },
  assigneeId: { label: "Assignee", kind: "ref" }
}

@Injectable()
export class ChangesService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string) {
    this.assertClientScope(clientId)
    const rows = await this.prisma.changeRequest.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: userDisplaySelect },
        approvals: { orderBy: { decidedAt: "desc" }, take: 1 }
      }
    })
    return rows.map((r) => ({ ...r, assignee: toUserDisplay(r.assignee) }))
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const change = await this.prisma.changeRequest.findFirst({
      where: { id, clientId },
      include: {
        assignee: { select: userDisplaySelect },
        approvals: {
          orderBy: { decidedAt: "desc" },
          include: { approver: { select: userDisplaySelect } }
        }
      }
    })
    if (!change) throw new NotFoundException("Change request not found")
    const createdBy = await resolveCreator(this.prisma, change.createdById)
    const links = await resolveLinkedRecords(this.prisma, clientId, "change", change.id)
    const attachments = await resolveAttachments(this.prisma, clientId, "change", change.id)
    return {
      ...change,
      assignee: toUserDisplay(change.assignee),
      approvals: change.approvals.map((a) => ({ ...a, approver: toUserDisplay(a.approver) })),
      createdBy,
      links,
      attachments
    }
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

        await emitAudit(this.prisma, {
          entityType: "ChangeRequest",
          entityId: change.id,
          action: "CREATED",
          actorUserId,
          clientId,
          reference: change.reference,
          title: change.title
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

    await emitAudit(this.prisma, {
      entityType: "ChangeRequest",
      entityId: change.id,
      action: "STATUS_UPDATED",
      actorUserId,
      clientId,
      changes: [
        {
          field: "status",
          label: "Status",
          from: CHANGE_STATUS_LABELS[change.status] ?? change.status,
          to: CHANGE_STATUS_LABELS[dto.status] ?? dto.status
        }
      ]
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

    await emitAudit(this.prisma, {
      entityType: "ChangeRequest",
      entityId: change.id,
      action: "APPROVAL_RECORDED",
      actorUserId,
      clientId,
      changes: [
        {
          field: "decision",
          label: "Decision",
          from: null,
          to: DECISION_LABELS[dto.decision] ?? dto.decision
        }
      ]
    })

    return approval
  }

  async updateForClient(clientId: string, id: string, actorUserId: string, dto: {
    title?: string
    description?: string
    reason?: string
    impactAssessment?: string
    rollbackPlan?: string
    implementationNotes?: string
    postImplReview?: string
    priority?: string
    assigneeId?: string
    scheduledStart?: string
    scheduledEnd?: string
  }) {
    const change = await this.getForClient(clientId, id)

    const updated = await this.prisma.changeRequest.update({
      where: { id: change.id },
      data: {
        title: dto.title,
        description: dto.description,
        reason: dto.reason,
        impactAssessment: dto.impactAssessment,
        rollbackPlan: dto.rollbackPlan,
        implementationNotes: dto.implementationNotes,
        postImplReview: dto.postImplReview,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : undefined,
        scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : undefined
      },
      include: { assignee: { select: userDisplaySelect } }
    })

    const newAssignee = toUserDisplay(updated.assignee)
    // Resolve assignee ids -> display names from rows already in hand (old via getForClient, new
    // via the update include) — no extra lookup; humanised at emit time.
    const assigneeNames = new Map<string, string>()
    if (change.assignee) assigneeNames.set(change.assignee.id, change.assignee.displayName)
    if (newAssignee) assigneeNames.set(newAssignee.id, newAssignee.displayName)

    const changes = diffRecord(change, dto, CHANGE_FIELD_SPEC, {
      assigneeId: (id) => (id ? assigneeNames.get(id) ?? null : null)
    })

    if (changes.length) {
      await emitAudit(this.prisma, {
        entityType: "ChangeRequest",
        entityId: change.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        changes
      })
    }

    return { ...updated, assignee: newAssignee }
  }
}