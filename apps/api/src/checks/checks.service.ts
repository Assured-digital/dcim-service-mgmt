import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CheckStatus } from "@prisma/client"
import { resolveAttachments, resolveAttachmentsForRecords } from "../attachments/resolve-attachments"
import { toUserDisplay, userDisplaySelect } from "../users/display"
import { emitAudit } from "../audit-events/emit-audit"

function makeRef(prefix: string) {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}-${y}-${n}`
}

// Humanised CheckStatus values for audit STATUS_UPDATED `changes` (raw enum as fallback). Check has
// no History tab yet (CheckDetailPage is custom); these emits feed the future admin audit view (#95)
// and a later History tab needs zero backend work. The status transitions (not per-item responses)
// are the audit-worthy lifecycle.
const CHECK_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  PENDING_REVIEW: "Pending review",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled"
}

function calcPassRate(items: { response: string | null; isRequired: boolean }[]): number {
  const answered = items.filter(i => i.response !== null)
  if (answered.length === 0) return 0
  const passed = answered.filter(i => i.response === "PASS" || i.response === "NA")
  const countable = answered.filter(i => i.response !== "NA")
  if (countable.length === 0) return 100
  const passCount = countable.filter(i => i.response === "PASS").length
  return Math.round((passCount / countable.length) * 100)
}

@Injectable()
export class ChecksService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  // Single-writer status-transition emit for a Check. `from`/`to` are raw CheckStatus values,
  // humanised here; `comment` carries the transition note (summary / reviewer notes / reason).
  private async emitCheckStatus(
    clientId: string,
    checkId: string,
    actorUserId: string | null,
    from: string,
    to: string,
    comment?: string | null
  ) {
    await emitAudit(this.prisma, {
      entityType: "Check",
      entityId: checkId,
      action: "STATUS_UPDATED",
      actorUserId,
      clientId,
      changes: [
        {
          field: "status",
          label: "Status",
          from: CHECK_STATUS_LABELS[from] ?? from,
          to: CHECK_STATUS_LABELS[to] ?? to
        }
      ],
      comment: comment?.trim() || null
    })
  }

  // ── Templates ──────────────────────────────────────────────────────

  async listTemplates(clientId: string) {
    this.assertClientScope(clientId)
    return this.prisma.checkTemplate.findMany({
      where: {
        isActive: true,
        OR: [
          { clientId: null },
          { clientId }
        ]
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" }
    })
  }

  async getTemplate(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const template = await this.prisma.checkTemplate.findFirst({
      where: {
        id,
        isActive: true,
        OR: [{ clientId: null }, { clientId }]
      },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    })
    if (!template) throw new NotFoundException("Template not found")
    return template
  }

  async createTemplate(clientId: string, actorUserId: string | null, dto: any) {
    this.assertClientScope(clientId)
    return this.prisma.checkTemplate.create({
      data: {
        reference: makeRef("TPL"),
        name: dto.name,
        checkType: dto.checkType,
        description: dto.description,
        clientId: dto.clientId ?? clientId,
        siteId: dto.siteId ?? undefined,
        estimatedMinutes: dto.estimatedMinutes,
        createdById: actorUserId ?? undefined
      },
      include: { items: true }
    })
  }

  async addTemplateItem(clientId: string, templateId: string, dto: any) {
    this.assertClientScope(clientId)
    const template = await this.getTemplate(clientId, templateId)
    return this.prisma.checkTemplateItem.create({
      data: {
        templateId: template.id,
        sortOrder: dto.sortOrder,
        label: dto.label,
        section: dto.section,
        guidance: dto.guidance,
        responseType: dto.responseType ?? "PASS_FAIL",
        isRequired: dto.isRequired ?? true,
        isCritical: dto.isCritical ?? false
      }
    })
  }

  async updateTemplateItem(clientId: string, templateId: string, itemId: string, dto: any) {
    this.assertClientScope(clientId)
    await this.getTemplate(clientId, templateId)
    const item = await this.prisma.checkTemplateItem.findFirst({
      where: { id: itemId, templateId }
    })
    if (!item) throw new NotFoundException("Template item not found")
    return this.prisma.checkTemplateItem.update({
      where: { id: itemId },
      data: {
        label: dto.label ?? item.label,
        section: dto.section ?? item.section,
        guidance: dto.guidance ?? item.guidance,
        responseType: dto.responseType ?? item.responseType,
        isRequired: dto.isRequired ?? item.isRequired,
        isCritical: dto.isCritical ?? item.isCritical,
        sortOrder: dto.sortOrder ?? item.sortOrder
      }
    })
  }

  async deleteTemplateItem(clientId: string, templateId: string, itemId: string) {
    this.assertClientScope(clientId)
    await this.getTemplate(clientId, templateId)
    const item = await this.prisma.checkTemplateItem.findFirst({
      where: { id: itemId, templateId }
    })
    if (!item) throw new NotFoundException("Template item not found")
    return this.prisma.checkTemplateItem.delete({ where: { id: itemId } })
  }

  async deactivateTemplate(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const template = await this.getTemplate(clientId, id)
    return this.prisma.checkTemplate.update({
      where: { id: template.id },
      data: { isActive: false }
    })
  }

  // ── Checks ─────────────────────────────────────────────────────────

  async listForClient(clientId: string, filters: any = {}) {
    this.assertClientScope(clientId)
    const rows = await this.prisma.check.findMany({
      where: {
        clientId,
        status: filters.status ? filters.status : undefined,
        assigneeId: filters.assigneeId ?? undefined,
        siteId: filters.siteId ?? undefined
      },
      include: {
        site: { select: { id: true, name: true } },
        assignee: { select: userDisplaySelect },
        template: { select: { id: true, name: true, checkType: true } },
        items: { select: { id: true, response: true, isRequired: true, isCritical: true } }
      },
      orderBy: { updatedAt: "desc" }
    })
    // Evidence presence/thumbnails for the queue landing (review cards). Batch-resolve
    // check-level AND per-item attachments across ALL rows — two queries regardless of
    // row count (no N+1), mirroring getForClient's per-record resolve. Metadata only
    // (no bytes); merged newest-first per check.
    const checkIds = rows.map((r) => r.id)
    const allItemIds = rows.flatMap((r) => r.items.map((i) => i.id))
    const [checkAtt, itemAtt] = await Promise.all([
      resolveAttachmentsForRecords(this.prisma, clientId, "check", checkIds),
      resolveAttachmentsForRecords(this.prisma, clientId, "check-item", allItemIds)
    ])
    return rows.map((r) => {
      const itemEvidence = r.items.flatMap((i) => itemAtt.get(i.id) ?? [])
      const evidence = [...(checkAtt.get(r.id) ?? []), ...itemEvidence].sort((a, b) =>
        b.uploadedAt.localeCompare(a.uploadedAt)
      )
      return { ...r, assignee: toUserDisplay(r.assignee), evidence }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const check = await this.prisma.check.findFirst({
      where: { id, clientId },
      include: {
        site: { select: { id: true, name: true } },
        assignee: { select: userDisplaySelect },
        reviewer: { select: userDisplaySelect },
        template: { select: { id: true, name: true, checkType: true, estimatedMinutes: true } },
        items: {
          orderBy: { sortOrder: "asc" },
          include: { followOns: true }
        }
      }
    })
    if (!check) throw new NotFoundException("Check not found")
    const attachments = await resolveAttachments(this.prisma, clientId, "check", check.id)
    // Per-item field-evidence photos: batch-resolve check-item attachments (scoped
    // indirectly via the parent check) and graft onto each item, mirroring the
    // check-level resolver above.
    const itemAttachments = await resolveAttachmentsForRecords(
      this.prisma,
      clientId,
      "check-item",
      check.items.map((i) => i.id)
    )
    return {
      ...check,
      assignee: toUserDisplay(check.assignee),
      reviewer: toUserDisplay(check.reviewer),
      items: check.items.map((i) => ({ ...i, attachments: itemAttachments.get(i.id) ?? [] })),
      attachments
    }
  }

  async createForClient(clientId: string, actorUserId: string | null, dto: any) {
    this.assertClientScope(clientId)

    const template = await this.getTemplate(clientId, dto.templateId)

    const title = dto.title ?? `${template.name} — ${new Date().toLocaleDateString("en-GB")}`

    const check = await this.prisma.check.create({
      data: {
        reference: makeRef("CHK"),
        clientId,
        siteId: dto.siteId,
        templateId: template.id,
        checkType: template.checkType,
        title,
        status: dto.scheduledAt ? CheckStatus.SCHEDULED : CheckStatus.DRAFT,
        priority: dto.priority ?? "medium",
        assigneeId: dto.assigneeId ?? undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        scopeNotes: dto.scopeNotes,
        createdById: actorUserId ?? undefined,
        items: {
          create: template.items.map((item) => ({
            templateItemId: item.id,
            sortOrder: item.sortOrder,
            section: item.section,
            label: item.label,
            guidance: item.guidance,
            responseType: item.responseType,
            isRequired: item.isRequired,
            isCritical: item.isCritical
          }))
        }
      },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        site: { select: { id: true, name: true } },
        assignee: { select: userDisplaySelect },
        template: { select: { id: true, name: true } }
      }
    })

    await emitAudit(this.prisma, {
      entityType: "Check",
      entityId: check.id,
      action: "CREATED",
      actorUserId,
      clientId,
      reference: check.reference,
      title: check.title
    })

    return { ...check, assignee: toUserDisplay(check.assignee) }
  }

  async startCheck(clientId: string, id: string, actorUserId: string) {
    const check = await this.getForClient(clientId, id)
    if (check.status === CheckStatus.IN_PROGRESS) return check
    if (!["DRAFT", "SCHEDULED", "ASSIGNED"].includes(check.status)) {
      throw new BadRequestException("Check cannot be started from its current status")
    }
    const updated = await this.prisma.check.update({
      where: { id: check.id },
      data: { status: CheckStatus.IN_PROGRESS, startedAt: new Date() }
    })
    await this.emitCheckStatus(clientId, check.id, actorUserId, check.status, CheckStatus.IN_PROGRESS)
    return updated
  }

  async updateItem(clientId: string, checkId: string, itemId: string, dto: any, actorUserId: string) {
    const check = await this.getForClient(clientId, checkId)
    if (check.status === CheckStatus.PENDING_REVIEW) {
      throw new BadRequestException("Cannot update items while the check is under review")
    }
    if (check.status === CheckStatus.COMPLETED || check.status === CheckStatus.CLOSED) {
      throw new BadRequestException("Cannot update items on a completed check")
    }

    const item = await this.prisma.checkItem.findFirst({
      where: { id: itemId, checkId: check.id }
    })
    if (!item) throw new NotFoundException("Check item not found")

    return this.prisma.checkItem.update({
      where: { id: itemId },
      data: {
        response: dto.response ?? item.response,
        notes: dto.notes ?? item.notes,
        respondedAt: dto.response ? new Date() : item.respondedAt,
        respondedById: dto.response ? actorUserId : item.respondedById
      }
    })
  }

  async addAdHocItem(clientId: string, checkId: string, dto: any) {
    const check = await this.getForClient(clientId, checkId)
    if (!["IN_PROGRESS", "DRAFT", "SCHEDULED", "ASSIGNED"].includes(check.status)) {
      throw new BadRequestException("Cannot add items to this check")
    }
    const maxOrder = check.items.reduce((max, i) => Math.max(max, i.sortOrder), 0)
    return this.prisma.checkItem.create({
      data: {
        checkId: check.id,
        sortOrder: maxOrder + 1,
        label: dto.label,
        section: dto.section,
        responseType: dto.responseType ?? "PASS_FAIL",
        isRequired: dto.isRequired ?? true,
        isCritical: false,
        isAdHoc: true
      }
    })
  }

  async submitForReview(clientId: string, id: string, dto: any, actorUserId: string) {
    const check = await this.getForClient(clientId, id)
    if (check.status !== CheckStatus.IN_PROGRESS) {
      throw new BadRequestException("Only in-progress checks can be submitted for review")
    }

    const requiredUnanswered = check.items.filter(
      i => i.isRequired && i.response === null
    )
    if (requiredUnanswered.length > 0) {
      throw new BadRequestException(
        `${requiredUnanswered.length} required item(s) still need a response before submitting`
      )
    }

    const passRate = calcPassRate(check.items)

    const updated = await this.prisma.check.update({
      where: { id: check.id },
      data: {
        status: CheckStatus.PENDING_REVIEW,
        submittedAt: new Date(),
        engineerSummary: dto.engineerSummary,
        passRate
      }
    })
    await this.emitCheckStatus(clientId, check.id, actorUserId, check.status, CheckStatus.PENDING_REVIEW, dto.engineerSummary)
    return updated
  }

  async approveCheck(clientId: string, id: string, dto: any, actorUserId: string) {
    const check = await this.getForClient(clientId, id)
    if (check.status !== CheckStatus.PENDING_REVIEW) {
      throw new BadRequestException("Only checks pending review can be approved")
    }
    const updated = await this.prisma.check.update({
      where: { id: check.id },
      data: {
        status: CheckStatus.COMPLETED,
        completedAt: new Date(),
        reviewerId: actorUserId,
        reviewerNotes: dto.reviewerNotes
      }
    })
    await this.emitCheckStatus(clientId, check.id, actorUserId, check.status, CheckStatus.COMPLETED, dto.reviewerNotes)
    return updated
  }

  async returnForRework(clientId: string, id: string, dto: any, actorUserId: string) {
    const check = await this.getForClient(clientId, id)
    if (check.status !== CheckStatus.PENDING_REVIEW) {
      throw new BadRequestException("Only checks pending review can be returned for rework")
    }
    const updated = await this.prisma.check.update({
      where: { id: check.id },
      data: {
        status: CheckStatus.ASSIGNED,
        reviewerId: actorUserId,
        reviewerNotes: dto.reviewerNotes
      }
    })
    await this.emitCheckStatus(clientId, check.id, actorUserId, check.status, CheckStatus.ASSIGNED, dto.reviewerNotes)
    return updated
  }

  async cancelCheck(clientId: string, id: string, dto: any, actorUserId: string | null) {
    const check = await this.getForClient(clientId, id)
    if (["COMPLETED", "CLOSED", "CANCELLED"].includes(check.status)) {
      throw new BadRequestException("This check cannot be cancelled")
    }
    const updated = await this.prisma.check.update({
      where: { id: check.id },
      data: {
        status: CheckStatus.CANCELLED,
        cancellationReason: dto.cancellationReason
      }
    })
    await this.emitCheckStatus(clientId, check.id, actorUserId, check.status, CheckStatus.CANCELLED, dto.cancellationReason)
    return updated
  }

  async createFollowOn(
    clientId: string,
    checkId: string,
    itemId: string,
    dto: any,
    actorUserId: string | null
  ) {
    const check = await this.getForClient(clientId, checkId)
    const item = await this.prisma.checkItem.findFirst({
      where: { id: itemId, checkId: check.id }
    })
    if (!item) throw new NotFoundException("Check item not found")

    let entityId: string

    if (dto.entityType === "Task") {
      const task = await this.prisma.task.create({
        data: {
          reference: makeRef("TSK"),
          clientId,
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? "medium",
          linkedEntityType: "Check",
          linkedEntityId: checkId,
          createdById: actorUserId ?? undefined
        }
      })
      entityId = task.id
    } else if (dto.entityType === "Risk") {
      const risk = await this.prisma.risk.create({
        data: {
          reference: makeRef("RSK"),
          clientId,
          title: dto.title,
          description: dto.description ?? dto.title,
          likelihood: dto.likelihood ?? "MEDIUM",
          impact: dto.impact ?? "MEDIUM",
          source: "SURVEY",
          status: "IDENTIFIED"
        }
      })
      entityId = risk.id
    } else if (dto.entityType === "Issue") {
      const issue = await this.prisma.issue.create({
        data: {
          reference: makeRef("ISS"),
          clientId,
          title: dto.title,
          description: dto.description ?? dto.title,
          severity: dto.severity ?? "AMBER",
          status: "OPEN"
        }
      })
      entityId = issue.id
    } else {
      throw new BadRequestException("Invalid entity type")
    }

    const followOn = await this.prisma.checkItemFollowOn.create({
      data: {
        checkItemId: item.id,
        entityType: dto.entityType,
        entityId,
        note: dto.note,
        createdById: actorUserId ?? undefined
      }
    })

    return { followOn, entityId, entityType: dto.entityType }
  }

  async listFollowOns(clientId: string, checkId: string) {
    const check = await this.getForClient(clientId, checkId)
    return this.prisma.checkItemFollowOn.findMany({
      where: { checkItem: { checkId: check.id } },
      include: { checkItem: { select: { id: true, label: true, section: true } } },
      orderBy: { createdAt: "asc" }
    })
  }

  async updateTemplate(clientId: string, id: string, dto: any) {
    this.assertClientScope(clientId)
    const template = await this.getTemplate(clientId, id)
    return this.prisma.checkTemplate.update({
      where: { id: template.id },
      data: {
        name: dto.name ?? template.name,
        description: dto.description ?? template.description,
        estimatedMinutes: dto.estimatedMinutes ?? template.estimatedMinutes
      },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    })
  }

}