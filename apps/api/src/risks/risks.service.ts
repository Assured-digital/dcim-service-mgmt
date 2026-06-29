import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { resolveCreator } from "../users/creator"
import { toUserDisplay, userDisplaySelect } from "../users/display"
import { resolveLinkedRecords } from "../record-links/resolve-links"
import { resolveAttachments } from "../attachments/resolve-attachments"
import { diffRecord, type FieldSpec } from "../audit-events/diff-record"
import { emitAudit } from "../audit-events/emit-audit"
import { emitNotification } from "../notifications/emit-notification"
import { applyAssignedScope, type ScopeViewer } from "../auth/role-scope"
import { NotificationType, Role } from "@prisma/client"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `RSK-${y}-${n}`
}

const RISK_LEVEL_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High"
}

const RISK_STATUS_LABELS: Record<string, string> = {
  IDENTIFIED: "Identified",
  ASSESSED: "Assessed",
  MITIGATING: "Mitigating",
  ACCEPTED: "Accepted",
  CLOSED: "Closed"
}

// Per-field humanisation for Risk updates. likelihood/impact are enum strings (DTO @IsIn
// LOW/MEDIUM/HIGH). `status` changes via the status endpoint (STATUS_UPDATED). reviewDate
// (date) is omitted — diffRecord has no date kind. The dead linkedEntity* scalars are omitted
// (links live in the RecordLink join table now). assigneeId is a ref field — its resolver
// (id -> displayName) is supplied at the updateForClient call site.
const RISK_FIELD_SPEC: FieldSpec = {
  mitigationPlan: { label: "Mitigation plan", kind: "scalar" },
  likelihood: { label: "Likelihood", kind: "enum", labels: RISK_LEVEL_LABELS },
  impact: { label: "Impact", kind: "enum", labels: RISK_LEVEL_LABELS },
  assigneeId: { label: "Assignee", kind: "ref" }
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

  async listForClient(clientId: string, viewer: ScopeViewer, filters: {
    dateFrom?: string
    dateTo?: string
    linkedEntityType?: string
    linkedEntityId?: string
  } = {}) {
    this.assertClientScope(clientId)
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo)
    const rows = await this.prisma.risk.findMany({
      where: applyAssignedScope(
        {
          clientId,
          linkedEntityType: filters.linkedEntityType || undefined,
          linkedEntityId: filters.linkedEntityId || undefined,
          createdAt
        },
        viewer
      ),
      orderBy: { createdAt: "desc" },
      include: { assignee: { select: userDisplaySelect } }
    })
    return rows.map((r) => ({ ...r, assignee: toUserDisplay(r.assignee) }))
  }

  async getForClient(clientId: string, id: string, viewer: ScopeViewer) {
    this.assertClientScope(clientId)
    const risk = await this.prisma.risk.findFirst({
      where: applyAssignedScope({ id, clientId }, viewer),
      include: { assignee: { select: userDisplaySelect } }
    })
    if (!risk) throw new NotFoundException("Risk not found")
    const createdBy = await resolveCreator(this.prisma, risk.createdById)
    const links = await resolveLinkedRecords(this.prisma, clientId, "risk", risk.id)
    const attachments = await resolveAttachments(this.prisma, clientId, "risk", risk.id)
    return { ...risk, assignee: toUserDisplay(risk.assignee), createdBy, links, attachments }
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
            status: "IDENTIFIED",
            createdById: actorUserId
          }
        })
        await emitAudit(this.prisma, {
          entityType: "Risk",
          entityId: risk.id,
          action: "CREATED",
          actorUserId,
          clientId,
          reference: risk.reference,
          title: risk.title
        })
        return risk
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateStatusForClient(clientId: string, id: string, actorUserId: string, dto: {
    status: string
    acceptanceNote?: string
  }, viewer: ScopeViewer) {
    const risk = await this.getForClient(clientId, id, viewer)
    const updated = await this.prisma.risk.update({
      where: { id: risk.id },
      data: {
        status: dto.status,
        acceptanceNote: dto.acceptanceNote,
        closedAt: dto.status === "CLOSED" ? new Date() : undefined
      }
    })
    await emitAudit(this.prisma, {
      entityType: "Risk",
      entityId: risk.id,
      action: "STATUS_UPDATED",
      actorUserId,
      clientId,
      changes: [
        {
          field: "status",
          label: "Status",
          from: RISK_STATUS_LABELS[risk.status] ?? risk.status,
          to: RISK_STATUS_LABELS[dto.status] ?? dto.status
        }
      ],
      comment: dto.acceptanceNote?.trim() || null
    })

    // Notify the current assignee that the status moved. Best-effort; self-skip in helper.
    await emitNotification(this.prisma, {
      type: NotificationType.STATUS_CHANGED,
      recipientIds: [risk.assigneeId],
      actorId: actorUserId,
      clientId,
      sourceType: "Risk",
      sourceId: risk.id
    })

    return updated
  }

  async updateForClient(clientId: string, id: string, actorUserId: string, dto: {
    mitigationPlan?: string
    reviewDate?: string
    likelihood?: string
    impact?: string
    assigneeId?: string
    linkedEntityType?: string
    linkedEntityId?: string
  }, viewer: ScopeViewer) {
    const risk = await this.getForClient(clientId, id, viewer)

    // Assignee lock (rule B): an ENGINEER may edit other fields but never reassign.
    if (viewer.role === Role.ENGINEER && dto.assigneeId !== undefined && dto.assigneeId !== risk.assigneeId) {
      throw new ForbiddenException("Engineers cannot change the assignee")
    }

    const updated = await this.prisma.risk.update({
      where: { id: risk.id },
      data: {
        mitigationPlan: dto.mitigationPlan,
        likelihood: dto.likelihood,
        impact: dto.impact,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
        assigneeId: dto.assigneeId === "" ? null : dto.assigneeId ?? undefined,
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId
      },
      include: { assignee: { select: userDisplaySelect } }
    })

    const newAssignee = toUserDisplay(updated.assignee)
    // Resolve assignee ids -> display names from rows already in hand (old via getForClient,
    // new via the update include) — no extra lookup; humanised at emit time.
    const assigneeNames = new Map<string, string>()
    if (risk.assignee) assigneeNames.set(risk.assignee.id, risk.assignee.displayName)
    if (newAssignee) assigneeNames.set(newAssignee.id, newAssignee.displayName)

    const changes = diffRecord(risk, dto, RISK_FIELD_SPEC, {
      assigneeId: (id) => (id ? assigneeNames.get(id) ?? null : null)
    })
    if (changes.length) {
      await emitAudit(this.prisma, {
        entityType: "Risk",
        entityId: risk.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        changes
      })
    }

    // Notify the new assignee on a real (re)assignment. Best-effort; self-assign is
    // skipped inside the helper (recipient === actor).
    if (updated.assigneeId && updated.assigneeId !== risk.assigneeId) {
      await emitNotification(this.prisma, {
        type: NotificationType.ASSIGNED,
        recipientIds: [updated.assigneeId],
        actorId: actorUserId,
        clientId,
        sourceType: "Risk",
        sourceId: risk.id
      })
    }

    return { ...updated, assignee: newAssignee }
  }
}