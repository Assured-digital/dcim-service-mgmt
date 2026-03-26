import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CheckStatus } from "@prisma/client"

function makeRef(prefix: string) {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}-${y}-${n}`
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
    return this.prisma.check.findMany({
      where: {
        clientId,
        status: filters.status ? filters.status : undefined,
        assigneeId: filters.assigneeId ?? undefined,
        siteId: filters.siteId ?? undefined
      },
      include: {
        site: { select: { id: true, name: true } },
        assignee: { select: { id: true, email: true } },
        template: { select: { id: true, name: true, checkType: true } },
        items: { select: { id: true, response: true, isRequired: true, isCritical: true } }
      },
      orderBy: { updatedAt: "desc" }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const check = await this.prisma.check.findFirst({
      where: { id, clientId },
      include: {
        site: { select: { id: true, name: true } },
        assignee: { select: { id: true, email: true } },
        reviewer: { select: { id: true, email: true } },
        template: { select: { id: true, name: true, checkType: true, estimatedMinutes: true } },
        items: {
          orderBy: { sortOrder: "asc" },
          include: { followOns: true }
        }
      }
    })
    if (!check) throw new NotFoundException("Check not found")
    return check
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
        assignee: { select: { id: true, email: true } },
        template: { select: { id: true, name: true } }
      }
    })

    return check
  }

  async startCheck(clientId: string, id: string, actorUserId: string) {
    const check = await this.getForClient(clientId, id)
    if (check.status === CheckStatus.IN_PROGRESS) return check
    if (!["DRAFT", "SCHEDULED", "ASSIGNED"].includes(check.status)) {
      throw new BadRequestException("Check cannot be started from its current status")
    }
    return this.prisma.check.update({
      where: { id: check.id },
      data: { status: CheckStatus.IN_PROGRESS, startedAt: new Date() }
    })
  }

  async updateItem(clientId: string, checkId: string, itemId: string, dto: any, actorUserId: string) {
    const check = await this.getForClient(clientId, checkId)
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

    return this.prisma.check.update({
      where: { id: check.id },
      data: {
        status: CheckStatus.PENDING_REVIEW,
        submittedAt: new Date(),
        engineerSummary: dto.engineerSummary,
        passRate
      }
    })
  }

  async approveCheck(clientId: string, id: string, dto: any, actorUserId: string) {
    const check = await this.getForClient(clientId, id)
    if (check.status !== CheckStatus.PENDING_REVIEW) {
      throw new BadRequestException("Only checks pending review can be approved")
    }
    return this.prisma.check.update({
      where: { id: check.id },
      data: {
        status: CheckStatus.COMPLETED,
        completedAt: new Date(),
        reviewerId: actorUserId,
        reviewerNotes: dto.reviewerNotes
      }
    })
  }

  async returnForRework(clientId: string, id: string, dto: any, actorUserId: string) {
    const check = await this.getForClient(clientId, id)
    if (check.status !== CheckStatus.PENDING_REVIEW) {
      throw new BadRequestException("Only checks pending review can be returned for rework")
    }
    return this.prisma.check.update({
      where: { id: check.id },
      data: {
        status: CheckStatus.ASSIGNED,
        reviewerId: actorUserId,
        reviewerNotes: dto.reviewerNotes
      }
    })
  }

  async cancelCheck(clientId: string, id: string, dto: any) {
    const check = await this.getForClient(clientId, id)
    if (["COMPLETED", "CLOSED", "CANCELLED"].includes(check.status)) {
      throw new BadRequestException("This check cannot be cancelled")
    }
    return this.prisma.check.update({
      where: { id: check.id },
      data: {
        status: CheckStatus.CANCELLED,
        cancellationReason: dto.cancellationReason
      }
    })
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
}