import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { resolveCreator } from "../users/creator"
import { toUserDisplay, userDisplaySelect } from "../users/display"
import { resolveLinkedRecords } from "../record-links/resolve-links"
import { resolveAttachments } from "../attachments/resolve-attachments"
import { diffRecord, type FieldSpec } from "../audit-events/diff-record"
import { emitAudit } from "../audit-events/emit-audit"
import { applyAssignedScope, type ScopeViewer } from "../auth/role-scope"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `ISS-${y}-${n}`
}

const ISSUE_SEVERITY_LABELS: Record<string, string> = {
  RED: "Red",
  AMBER: "Amber",
  GREEN: "Green"
}

const ISSUE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
}

// Per-field humanisation for Issue updates. severity is an enum string (DTO @IsIn
// RED/AMBER/GREEN). assigneeId is a ref field — its resolver (id -> displayName) is supplied at
// the updateForClient call site. `status` changes via the status endpoint (STATUS_UPDATED).
// reviewDate (date) + the dead linkedEntity* scalars are omitted.
const ISSUE_FIELD_SPEC: FieldSpec = {
  severity: { label: "Severity", kind: "enum", labels: ISSUE_SEVERITY_LABELS },
  assigneeId: { label: "Assignee", kind: "ref" }
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

  async listForClient(clientId: string, viewer: ScopeViewer, filters: {
    dateFrom?: string
    dateTo?: string
    linkedEntityType?: string
    linkedEntityId?: string
  } = {}) {
    this.assertClientScope(clientId)
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo)
    const rows = await this.prisma.issue.findMany({
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
    const issue = await this.prisma.issue.findFirst({
      where: applyAssignedScope({ id, clientId }, viewer),
      include: { assignee: { select: userDisplaySelect } }
    })
    if (!issue) throw new NotFoundException("Issue not found")
    const createdBy = await resolveCreator(this.prisma, issue.createdById)
    const links = await resolveLinkedRecords(this.prisma, clientId, "issue", issue.id)
    const attachments = await resolveAttachments(this.prisma, clientId, "issue", issue.id)
    return { ...issue, assignee: toUserDisplay(issue.assignee), createdBy, links, attachments }
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
            status: "OPEN",
            createdById: actorUserId
          }
        })
        await emitAudit(this.prisma, {
          entityType: "Issue",
          entityId: issue.id,
          action: "CREATED",
          actorUserId,
          clientId,
          reference: issue.reference,
          title: issue.title
        })
        return issue
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateForClient(clientId: string, id: string, actorUserId: string, dto: {
    severity?: string
    reviewDate?: string
    assigneeId?: string
    linkedEntityType?: string
    linkedEntityId?: string
  }, viewer: ScopeViewer) {
    const issue = await this.getForClient(clientId, id, viewer)
    const updated = await this.prisma.issue.update({
      where: { id: issue.id },
      data: {
        severity: dto.severity,
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
    if (issue.assignee) assigneeNames.set(issue.assignee.id, issue.assignee.displayName)
    if (newAssignee) assigneeNames.set(newAssignee.id, newAssignee.displayName)

    const changes = diffRecord(issue, dto, ISSUE_FIELD_SPEC, {
      assigneeId: (id) => (id ? assigneeNames.get(id) ?? null : null)
    })
    if (changes.length) {
      await emitAudit(this.prisma, {
        entityType: "Issue",
        entityId: issue.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        changes
      })
    }

    return { ...updated, assignee: newAssignee }
  }

  async updateStatusForClient(clientId: string, id: string, actorUserId: string, dto: {
    status: string
    resolution?: string
  }, viewer: ScopeViewer) {
    const issue = await this.getForClient(clientId, id, viewer)
    const updated = await this.prisma.issue.update({
      where: { id: issue.id },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        closedAt: dto.status === "CLOSED" ? new Date() : undefined
      }
    })
    await emitAudit(this.prisma, {
      entityType: "Issue",
      entityId: issue.id,
      action: "STATUS_UPDATED",
      actorUserId,
      clientId,
      changes: [
        {
          field: "status",
          label: "Status",
          from: ISSUE_STATUS_LABELS[issue.status] ?? issue.status,
          to: ISSUE_STATUS_LABELS[dto.status] ?? dto.status
        }
      ],
      comment: dto.resolution?.trim() || null
    })
    return updated
  }
}