import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { emitAudit } from "../audit-events/emit-audit"
import { resolveCreator } from "../users/creator"
import { userDisplaySelect, computeDisplayName } from "../users/display"
import { WorkPackagesService } from "../work-packages/work-packages.service"
import {
  CreateOpportunityDto, CreateWorkPackageFromOpportunityDto, OPEN_STAGES, STAGE_PROBABILITIES, UpdateOpportunityDto
} from "./dto"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `OPP-${y}-${n}`
}

// Commercial figures are hidden from field roles (CRM_DESIGN.md decision 12):
// ENGINEER + SERVICE_DESK_ANALYST see deals exist (title/stage/contacts) but
// value/probability are omitted from their responses.
const COMMERCIAL_ROLES: Role[] = [Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER]
export function canSeeCommercial(role: Role | undefined | null) {
  return !!role && COMMERCIAL_ROLES.includes(role)
}

function stripCommercial<T extends { value?: number | null; probability?: number | null }>(row: T, allowed: boolean): T {
  if (allowed) return row
  const { value: _v, probability: _p, ...rest } = row
  return rest as unknown as T
}

const includeRefs = {
  contact: { select: { id: true, firstName: true, lastName: true } },
  workPackage: { select: { id: true, reference: true, title: true } },
  renewsWorkPackage: { select: { id: true, reference: true, title: true } }
} as const

@Injectable()
export class OpportunitiesService {
  constructor(private prisma: PrismaService, private workPackages: WorkPackagesService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string, viewerRole: Role | undefined, filters?: { stage?: string; type?: string; ownerId?: string }) {
    this.assertClientScope(clientId)
    const rows = await this.prisma.opportunity.findMany({
      where: {
        clientId,
        stage: filters?.stage || undefined,
        type: filters?.type || undefined,
        ownerId: filters?.ownerId || undefined
      },
      orderBy: [{ lastStageChangeAt: "desc" }],
      include: includeRefs
    })
    const allowed = canSeeCommercial(viewerRole)
    // Owner names batch-resolved (assignable-users display convention).
    const ownerIds = [...new Set(rows.map(r => r.ownerId).filter((v): v is string => !!v))]
    const owners = await this.prisma.user.findMany({ where: { id: { in: ownerIds } }, select: userDisplaySelect })
    const nameOf = new Map(owners.map(u => [u.id, computeDisplayName(u)]))
    return rows.map(r => stripCommercial(
      { ...r, owner: r.ownerId ? { id: r.ownerId, displayName: nameOf.get(r.ownerId) ?? null } : null },
      allowed
    ))
  }

  async getForClient(clientId: string, viewerRole: Role | undefined, id: string) {
    this.assertClientScope(clientId)
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, clientId },
      include: includeRefs
    })
    if (!opp) throw new NotFoundException("Opportunity not found")
    const createdBy = await resolveCreator(this.prisma, opp.createdById)
    const owner = opp.ownerId ? await resolveCreator(this.prisma, opp.ownerId) : null
    // The WON confirmation UI needs the client's lifecycle stage for the
    // "move to ONBOARDING" prompt (CRM_DESIGN.md §4).
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, lifecycleStage: true }
    })
    return stripCommercial({ ...opp, createdBy, owner, client }, canSeeCommercial(viewerRole))
  }

  async createForClient(clientId: string, actorUserId: string, dto: CreateOpportunityDto) {
    this.assertClientScope(clientId)
    await this.assertRefsInScope(clientId, dto.contactId, dto.renewsWorkPackageId)

    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      const exists = await this.prisma.opportunity.findUnique({ where: { reference } })
      if (!exists) {
        const opp = await this.prisma.opportunity.create({
          data: {
            reference,
            clientId,
            title: dto.title.trim(),
            type: dto.type ?? "NEW_BUSINESS",
            stage: "DISCOVERY",
            probability: STAGE_PROBABILITIES.DISCOVERY,
            value: dto.value,
            expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
            nextStep: dto.nextStep,
            nextStepDate: dto.nextStepDate ? new Date(dto.nextStepDate) : undefined,
            ownerId: dto.ownerId,
            contactId: dto.contactId,
            renewsWorkPackageId: dto.renewsWorkPackageId,
            notes: dto.notes,
            createdById: actorUserId
          },
          include: includeRefs
        })

        await emitAudit(this.prisma, {
          entityType: "Opportunity",
          entityId: opp.id,
          action: "CREATED",
          actorUserId,
          clientId,
          reference: opp.reference,
          title: opp.title
        })

        return opp
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateForClient(clientId: string, actorUserId: string, id: string, dto: UpdateOpportunityDto) {
    this.assertClientScope(clientId)
    const existing = await this.prisma.opportunity.findFirst({ where: { id, clientId } })
    if (!existing) throw new NotFoundException("Opportunity not found")
    if (dto.contactId !== undefined) await this.assertRefsInScope(clientId, dto.contactId ?? undefined, undefined)

    // ── Stage machine (CRM_DESIGN.md §4) ──────────────────────────────────
    let stagePatch: { stage?: string; lastStageChangeAt?: Date; probability?: number; lostReason?: string; lostDetail?: string } = {}
    if (dto.stage && dto.stage !== existing.stage) {
      const from = existing.stage
      const to = dto.stage
      const openOrder = OPEN_STAGES as readonly string[]
      if (from === "WON" || from === "LOST") {
        throw new BadRequestException(`Cannot change stage of a ${from} opportunity`)
      }
      if (to === "LOST") {
        if (!dto.lostReason) throw new BadRequestException("A loss reason is required to mark an opportunity LOST")
        stagePatch = { stage: to, lostReason: dto.lostReason, lostDetail: dto.lostDetail }
      } else if (to === "WON") {
        stagePatch = { stage: to }
      } else {
        // Forward-only among open stages (no skipping restriction; no regression).
        if (openOrder.indexOf(to) < openOrder.indexOf(from)) {
          throw new BadRequestException(`Cannot move stage backwards (${from} → ${to})`)
        }
        stagePatch = { stage: to }
      }
      stagePatch.lastStageChangeAt = new Date()
      // Re-default probability from the stage map unless explicitly provided.
      stagePatch.probability = dto.probability ?? STAGE_PROBABILITIES[to]
    }

    const opp = await this.prisma.opportunity.update({
      where: { id: existing.id },
      data: {
        title: dto.title?.trim(),
        type: dto.type,
        value: dto.value,
        probability: stagePatch.probability ?? dto.probability,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        nextStep: dto.nextStep,
        nextStepDate: dto.nextStepDate ? new Date(dto.nextStepDate) : undefined,
        ownerId: dto.ownerId,
        contactId: dto.contactId,
        notes: dto.notes,
        ...stagePatch
      },
      include: includeRefs
    })

    await emitAudit(this.prisma, {
      entityType: "Opportunity",
      entityId: opp.id,
      action: stagePatch.stage ? `STAGE_${stagePatch.stage}` : "UPDATED",
      actorUserId,
      clientId,
      reference: opp.reference,
      title: opp.title
    })

    return opp
  }

  // WON → create the engagement (CRM_DESIGN.md §4). Human-driven: the UI offers
  // this after the WON confirmation; the client ONBOARDING flip is a separate
  // prompted action, never automatic.
  async createWorkPackage(clientId: string, actorUserId: string, id: string, dto: CreateWorkPackageFromOpportunityDto) {
    this.assertClientScope(clientId)
    const opp = await this.prisma.opportunity.findFirst({ where: { id, clientId } })
    if (!opp) throw new NotFoundException("Opportunity not found")
    if (opp.stage !== "WON") throw new BadRequestException("Only a WON opportunity can create a work package")
    if (opp.workPackageId) throw new BadRequestException("This opportunity already has a work package")

    const wp = await this.workPackages.createForClient(clientId, actorUserId, {
      title: dto.title ?? opp.title,
      type: dto.type,
      description: `Created from opportunity ${opp.reference}`,
      startDate: dto.startDate,
      endDate: dto.endDate,
      value: opp.value ?? undefined
    })

    await this.prisma.opportunity.update({ where: { id: opp.id }, data: { workPackageId: wp.id } })
    return { ...wp, opportunityId: opp.id }
  }

  private async assertRefsInScope(clientId: string, contactId?: string, renewsWorkPackageId?: string) {
    if (contactId) {
      const c = await this.prisma.contact.findFirst({ where: { id: contactId, clientId }, select: { id: true } })
      if (!c) throw new BadRequestException("Contact is invalid for this client scope")
    }
    if (renewsWorkPackageId) {
      const wp = await this.prisma.workPackage.findFirst({ where: { id: renewsWorkPackageId, clientId }, select: { id: true } })
      if (!wp) throw new BadRequestException("Work package is invalid for this client scope")
    }
  }
}
