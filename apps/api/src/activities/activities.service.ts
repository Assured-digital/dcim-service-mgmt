import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { emitAudit } from "../audit-events/emit-audit"
import { resolveCreator } from "../users/creator"
import { isOrgSuperRole } from "../auth/role-scope"
import { TasksService } from "../tasks/tasks.service"
import { CreateActivityDto, CreateFollowOnTaskDto, UpdateActivityDto } from "./dto"

const contactSelect = { select: { contact: { select: { id: true, firstName: true, lastName: true } } } }

function flattenContacts<T extends { contacts: Array<{ contact: { id: string; firstName: string; lastName: string } }> }>(a: T) {
  const { contacts, ...rest } = a
  return { ...rest, contacts: contacts.map(c => c.contact) }
}

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService, private tasks: TasksService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string, filters?: { type?: string; contactId?: string; from?: string; to?: string }) {
    this.assertClientScope(clientId)
    const rows = await this.prisma.activity.findMany({
      where: {
        clientId,
        type: filters?.type || undefined,
        contacts: filters?.contactId ? { some: { contactId: filters.contactId } } : undefined,
        occurredAt: {
          gte: filters?.from ? new Date(filters.from) : undefined,
          lte: filters?.to ? new Date(filters.to) : undefined
        }
      },
      orderBy: { occurredAt: "desc" },
      include: { contacts: contactSelect }
    })
    // Timeline "logged by" names resolve in one batch (not N resolveCreator calls).
    const creatorIds = [...new Set(rows.map(r => r.createdById).filter((v): v is string => !!v))]
    const creators = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, knownAs: true, firstName: true, lastName: true, email: true }
    })
    const nameOf = new Map(creators.map(u => [
      u.id,
      u.knownAs || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email
    ]))
    return rows.map(r => ({
      ...flattenContacts(r),
      createdBy: r.createdById ? { id: r.createdById, displayName: nameOf.get(r.createdById) ?? null } : null
    }))
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const activity = await this.prisma.activity.findFirst({
      where: { id, clientId },
      include: { contacts: contactSelect }
    })
    if (!activity) throw new NotFoundException("Activity not found")
    const createdBy = await resolveCreator(this.prisma, activity.createdById)
    return { ...flattenContacts(activity), createdBy }
  }

  async createForClient(clientId: string, actorUserId: string, dto: CreateActivityDto) {
    this.assertClientScope(clientId)
    await this.assertContactsInScope(clientId, dto.contactIds)

    const activity = await this.prisma.activity.create({
      data: {
        clientId,
        type: dto.type,
        subject: dto.subject.trim(),
        body: dto.body,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        createdById: actorUserId,
        contacts: dto.contactIds?.length
          ? { create: dto.contactIds.map(contactId => ({ contactId })) }
          : undefined
      },
      include: { contacts: contactSelect }
    })

    await emitAudit(this.prisma, {
      entityType: "Activity",
      entityId: activity.id,
      action: "CREATED",
      actorUserId,
      clientId,
      title: activity.subject
    })

    return flattenContacts(activity)
  }

  // Edit policy (CRM_DESIGN.md §4): author or org-super only; NO delete endpoint.
  async updateForClient(clientId: string, actor: { userId: string; role?: Role | null }, id: string, dto: UpdateActivityDto) {
    this.assertClientScope(clientId)
    const existing = await this.prisma.activity.findFirst({ where: { id, clientId } })
    if (!existing) throw new NotFoundException("Activity not found")
    if (existing.source !== "MANUAL") throw new BadRequestException("Synced activities cannot be edited")
    if (existing.createdById !== actor.userId && !isOrgSuperRole(actor.role)) {
      throw new ForbiddenException("Only the author or an org admin can edit an activity")
    }
    if (dto.contactIds) await this.assertContactsInScope(clientId, dto.contactIds)

    const activity = await this.prisma.activity.update({
      where: { id: existing.id },
      data: {
        type: dto.type,
        subject: dto.subject?.trim(),
        body: dto.body,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        contacts: dto.contactIds
          ? { deleteMany: {}, create: dto.contactIds.map(contactId => ({ contactId })) }
          : undefined
      },
      include: { contacts: contactSelect }
    })

    await emitAudit(this.prisma, {
      entityType: "Activity",
      entityId: activity.id,
      action: "UPDATED",
      actorUserId: actor.userId,
      clientId,
      title: activity.subject
    })

    return flattenContacts(activity)
  }

  // Follow-up = a real Task carrying the generic parent-context pointer
  // (linkedEntityType "crm_activity" — CRM_DESIGN.md decision 7).
  async createFollowOn(clientId: string, actorUserId: string, activityId: string, dto: CreateFollowOnTaskDto) {
    this.assertClientScope(clientId)
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, clientId }, select: { id: true, subject: true } })
    if (!activity) throw new NotFoundException("Activity not found")

    return this.tasks.createForClient(clientId, actorUserId, {
      title: dto.title,
      description: dto.description ?? `Follow-up from CRM activity: ${activity.subject}`,
      dueAt: dto.dueAt,
      assigneeId: dto.assigneeId,
      linkedEntityType: "crm_activity",
      linkedEntityId: activity.id
    })
  }

  // Every referenced contact must belong to the SAME resolved client (the
  // record-links both-endpoints rule, CRM_DESIGN.md §5).
  private async assertContactsInScope(clientId: string, contactIds?: string[]) {
    if (!contactIds?.length) return
    const found = await this.prisma.contact.count({ where: { id: { in: contactIds }, clientId } })
    if (found !== new Set(contactIds).size) throw new BadRequestException("One or more contacts are invalid for this client scope")
  }
}
