import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { emitAudit } from "../audit-events/emit-audit"
import { resolveCreator } from "../users/creator"
import { resolveAttachments } from "../attachments/resolve-attachments"
import { WorkPackagesService } from "../work-packages/work-packages.service"
import { canSeeCommercial } from "../auth/role-scope"
import {
  CreateQuoteDto, CreateWorkPackageFromQuoteDto, QUOTE_TRANSITIONS, QuoteLineItemDto, ReplaceLineItemsDto, UpdateQuoteDto
} from "./dto"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `QUO-${y}-${n}`
}

function sumLines(lines: QuoteLineItemDto[]) {
  return lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
}

// Commercial-figure RBAC (decision 12): field roles see quotes exist but not
// the money — value + line-item prices are omitted.
function stripCommercial<T extends { value?: number; lineItems?: Array<{ quantity: number; unitPrice?: number }> }>(row: T, allowed: boolean): T {
  if (allowed) return row
  const { value: _v, ...rest } = row
  return {
    ...rest,
    lineItems: row.lineItems?.map(({ unitPrice: _p, ...line }) => line)
  } as unknown as T
}

const includeRefs = {
  contact: { select: { id: true, firstName: true, lastName: true } },
  opportunity: { select: { id: true, reference: true, title: true, stage: true } },
  workPackage: { select: { id: true, reference: true, title: true } },
  lineItems: { orderBy: { sortOrder: "asc" as const } }
} as const

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService, private workPackages: WorkPackagesService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string, viewerRole: Role | undefined, filters?: { status?: string; opportunityId?: string }) {
    this.assertClientScope(clientId)
    const rows = await this.prisma.quote.findMany({
      where: {
        clientId,
        status: filters?.status || undefined,
        opportunityId: filters?.opportunityId || undefined
      },
      orderBy: [{ createdAt: "desc" }],
      include: includeRefs
    })
    const allowed = canSeeCommercial(viewerRole)
    return rows.map(r => stripCommercial(r, allowed))
  }

  async getForClient(clientId: string, viewerRole: Role | undefined, id: string) {
    this.assertClientScope(clientId)
    const quote = await this.prisma.quote.findFirst({
      where: { id, clientId },
      include: includeRefs
    })
    if (!quote) throw new NotFoundException("Quote not found")
    const createdBy = await resolveCreator(this.prisma, quote.createdById)
    const attachments = await resolveAttachments(this.prisma, clientId, "quote", quote.id)
    // Version chain (same reference, all versions) for the detail page.
    const versions = await this.prisma.quote.findMany({
      where: { clientId, reference: quote.reference },
      select: { id: true, version: true, status: true },
      orderBy: { version: "asc" }
    })
    return stripCommercial({ ...quote, createdBy, attachments, versions }, canSeeCommercial(viewerRole))
  }

  async createForClient(clientId: string, actorUserId: string, dto: CreateQuoteDto) {
    this.assertClientScope(clientId)
    await this.assertRefsInScope(clientId, dto.contactId, dto.opportunityId)
    const lines = dto.lineItems ?? []

    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      const exists = await this.prisma.quote.findFirst({ where: { reference } })
      if (!exists) {
        const quote = await this.prisma.$transaction(async tx => {
          // One primary quote per opportunity: a new quote takes primacy.
          if (dto.opportunityId) {
            await tx.quote.updateMany({ where: { opportunityId: dto.opportunityId, isPrimary: true }, data: { isPrimary: false } })
          }
          return tx.quote.create({
            data: {
              reference,
              clientId,
              title: dto.title.trim(),
              description: dto.description,
              value: sumLines(lines),
              validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
              contactId: dto.contactId,
              opportunityId: dto.opportunityId,
              notes: dto.notes,
              createdById: actorUserId,
              lineItems: lines.length
                ? { create: lines.map((l, idx) => ({ ...l, sortOrder: idx })) }
                : undefined
            },
            include: includeRefs
          })
        })

        await emitAudit(this.prisma, {
          entityType: "Quote",
          entityId: quote.id,
          action: "CREATED",
          actorUserId,
          clientId,
          reference: quote.reference,
          title: quote.title
        })

        return quote
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateForClient(clientId: string, actorUserId: string, id: string, dto: UpdateQuoteDto) {
    this.assertClientScope(clientId)
    const existing = await this.prisma.quote.findFirst({ where: { id, clientId } })
    if (!existing) throw new NotFoundException("Quote not found")

    const contentKeys: Array<keyof UpdateQuoteDto> = ["title", "description", "validUntil", "contactId", "opportunityId", "notes"]
    const hasContentEdit = contentKeys.some(k => dto[k] !== undefined)
    if (hasContentEdit && existing.status !== "DRAFT") {
      throw new BadRequestException("Only DRAFT quotes are editable — use revise to issue a new version")
    }
    if (dto.contactId !== undefined || dto.opportunityId !== undefined) {
      await this.assertRefsInScope(clientId, dto.contactId ?? undefined, dto.opportunityId ?? undefined)
    }

    // ── Status machine ────────────────────────────────────────────────────
    let statusPatch: { status?: string; sentAt?: Date; decidedAt?: Date } = {}
    if (dto.status && dto.status !== existing.status) {
      const legal = QUOTE_TRANSITIONS[existing.status] ?? []
      if (!legal.includes(dto.status)) {
        throw new BadRequestException(`Illegal quote transition ${existing.status} → ${dto.status}`)
      }
      statusPatch.status = dto.status
      if (dto.status === "SENT") statusPatch.sentAt = new Date()
      if (["ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"].includes(dto.status)) statusPatch.decidedAt = new Date()
    }

    const quote = await this.prisma.quote.update({
      where: { id: existing.id },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        contactId: dto.contactId,
        opportunityId: dto.opportunityId,
        notes: dto.notes,
        ...statusPatch
      },
      include: includeRefs
    })

    await emitAudit(this.prisma, {
      entityType: "Quote",
      entityId: quote.id,
      action: statusPatch.status ? `STATUS_${statusPatch.status}` : "UPDATED",
      actorUserId,
      clientId,
      reference: quote.reference,
      title: quote.title
    })

    return quote
  }

  // Replace-set of line items while DRAFT; value recomputed on every write.
  async replaceLineItems(clientId: string, actorUserId: string, id: string, dto: ReplaceLineItemsDto) {
    this.assertClientScope(clientId)
    const existing = await this.prisma.quote.findFirst({ where: { id, clientId } })
    if (!existing) throw new NotFoundException("Quote not found")
    if (existing.status !== "DRAFT") throw new BadRequestException("Line items can only change while DRAFT")

    const quote = await this.prisma.$transaction(async tx => {
      await tx.quoteLineItem.deleteMany({ where: { quoteId: existing.id } })
      return tx.quote.update({
        where: { id: existing.id },
        data: {
          value: sumLines(dto.lineItems),
          lineItems: { create: dto.lineItems.map((l, idx) => ({ ...l, sortOrder: idx })) }
        },
        include: includeRefs
      })
    })

    await emitAudit(this.prisma, {
      entityType: "Quote",
      entityId: quote.id,
      action: "LINE_ITEMS_UPDATED",
      actorUserId,
      clientId,
      reference: quote.reference,
      title: quote.title
    })

    return quote
  }

  // Revise-as-new-version (Dynamics pattern): withdraw the live version, clone a
  // DRAFT v+1 with the same reference + line items. One live version at a time.
  async revise(clientId: string, actorUserId: string, id: string) {
    this.assertClientScope(clientId)
    const existing = await this.prisma.quote.findFirst({
      where: { id, clientId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } }
    })
    if (!existing) throw new NotFoundException("Quote not found")
    if (!["SENT", "REJECTED", "EXPIRED"].includes(existing.status)) {
      throw new BadRequestException("Only a SENT, REJECTED or EXPIRED quote can be revised")
    }

    const next = await this.prisma.$transaction(async tx => {
      if (existing.status === "SENT") {
        await tx.quote.update({ where: { id: existing.id }, data: { status: "WITHDRAWN", decidedAt: new Date(), isPrimary: false } })
      } else {
        await tx.quote.update({ where: { id: existing.id }, data: { isPrimary: false } })
      }
      return tx.quote.create({
        data: {
          reference: existing.reference,
          version: existing.version + 1,
          revisedFromId: existing.id,
          clientId,
          title: existing.title,
          description: existing.description,
          value: existing.value,
          currency: existing.currency,
          validUntil: existing.validUntil,
          contactId: existing.contactId,
          opportunityId: existing.opportunityId,
          notes: existing.notes,
          isPrimary: true,
          createdById: actorUserId,
          lineItems: { create: existing.lineItems.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, sortOrder: l.sortOrder })) }
        },
        include: includeRefs
      })
    })

    await emitAudit(this.prisma, {
      entityType: "Quote",
      entityId: next.id,
      action: "REVISED",
      actorUserId,
      clientId,
      reference: next.reference,
      title: next.title
    })

    return next
  }

  // ACCEPTED → create the engagement (mirrors the opportunity WON path).
  async createWorkPackage(clientId: string, actorUserId: string, id: string, dto: CreateWorkPackageFromQuoteDto) {
    this.assertClientScope(clientId)
    const quote = await this.prisma.quote.findFirst({ where: { id, clientId } })
    if (!quote) throw new NotFoundException("Quote not found")
    if (quote.status !== "ACCEPTED") throw new BadRequestException("Only an ACCEPTED quote can create a work package")
    if (quote.workPackageId) throw new BadRequestException("This quote already has a work package")

    const wp = await this.workPackages.createForClient(clientId, actorUserId, {
      title: dto.title ?? quote.title,
      type: dto.type,
      description: `Created from quote ${quote.reference} v${quote.version}`,
      startDate: dto.startDate,
      endDate: dto.endDate,
      value: quote.value
    })

    await this.prisma.quote.update({ where: { id: quote.id }, data: { workPackageId: wp.id } })
    return { ...wp, quoteId: quote.id }
  }

  private async assertRefsInScope(clientId: string, contactId?: string, opportunityId?: string) {
    if (contactId) {
      const c = await this.prisma.contact.findFirst({ where: { id: contactId, clientId }, select: { id: true } })
      if (!c) throw new BadRequestException("Contact is invalid for this client scope")
    }
    if (opportunityId) {
      const o = await this.prisma.opportunity.findFirst({ where: { id: opportunityId, clientId }, select: { id: true } })
      if (!o) throw new BadRequestException("Opportunity is invalid for this client scope")
    }
  }
}
