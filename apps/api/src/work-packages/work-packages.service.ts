import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { emitAudit } from "../audit-events/emit-audit"
import { canSeeCommercial } from "../auth/role-scope"
import { UpdateWorkPackageDto } from "./dto"

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `WP-${y}-${n}`
}

// Commercial figures (value + commercialNotes) hidden from field roles
// (CRM_DESIGN.md decision 12).
function stripCommercial<T extends { value?: number | null; commercialNotes?: string | null }>(row: T, allowed: boolean): T {
  if (allowed) return row
  const { value: _v, commercialNotes: _c, ...rest } = row
  return rest as unknown as T
}

@Injectable()
export class WorkPackagesService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string, viewerRole?: Role, filters?: { renewingBefore?: string }) {
    this.assertClientScope(clientId)
    const rows = await this.prisma.workPackage.findMany({
      where: {
        clientId,
        ...(filters?.renewingBefore
          ? { renewalDate: { not: null, lte: new Date(filters.renewingBefore) } }
          : {})
      },
      orderBy: { createdAt: "desc" },
      include: {
        sites: { include: { site: { select: { id: true, name: true } } } }
      }
    })
    const allowed = canSeeCommercial(viewerRole)
    return rows.map(r => stripCommercial(r, allowed))
  }

  async getForClient(clientId: string, id: string, viewerRole?: Role) {
    this.assertClientScope(clientId)
    const wp = await this.prisma.workPackage.findFirst({
      where: { id, clientId },
      include: {
        sites: { include: { site: true } }
      }
    })
    if (!wp) throw new NotFoundException("Work package not found")

    // Task rollup via the generic parent-context pointer (CRM_DESIGN.md §3 /
    // decision 6): tasks link to a WP with linkedEntityType "work_package".
    const tasks = await this.prisma.task.findMany({
      where: { clientId, linkedEntityType: "work_package", linkedEntityId: id },
      select: { id: true, reference: true, title: true, status: true, priority: true, dueAt: true },
      orderBy: { createdAt: "desc" }
    })
    const done = tasks.filter(t => t.status === "DONE").length
    const percentComplete = tasks.length ? Math.round((done / tasks.length) * 100) : null

    return stripCommercial({ ...wp, tasks, taskSummary: { total: tasks.length, done, percentComplete } }, canSeeCommercial(viewerRole))
  }

  async createForClient(clientId: string, actorUserId: string, dto: {
    title: string
    type?: string
    description?: string
    startDate?: string
    endDate?: string
    value?: number
    siteIds?: string[]
  }) {
    this.assertClientScope(clientId)

    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      const exists = await this.prisma.workPackage.findUnique({ where: { reference } })
      if (!exists) {
        const wp = await this.prisma.workPackage.create({
          data: {
            reference,
            clientId,
            title: dto.title,
            type: dto.type ?? "MANAGED_SERVICE",
            description: dto.description,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
            value: dto.value,
            status: "ACTIVE",
            sites: dto.siteIds ? {
              create: dto.siteIds.map(siteId => ({ siteId }))
            } : undefined
          }
        })

        await emitAudit(this.prisma, {
          entityType: "WorkPackage",
          entityId: wp.id,
          action: "CREATED",
          actorUserId,
          clientId,
          reference: wp.reference,
          title: wp.title
        })

        return wp
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateForClient(clientId: string, actorUserId: string, id: string, dto: UpdateWorkPackageDto) {
    this.assertClientScope(clientId)
    const existing = await this.prisma.workPackage.findFirst({ where: { id, clientId } })
    if (!existing) throw new NotFoundException("Work package not found")

    const wp = await this.prisma.workPackage.update({
      where: { id: existing.id },
      data: {
        title: dto.title?.trim(),
        type: dto.type,
        status: dto.status,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        value: dto.value,
        renewalDate: dto.renewalDate ? new Date(dto.renewalDate) : undefined,
        noticePeriodDays: dto.noticePeriodDays,
        autoRenews: dto.autoRenews,
        commercialNotes: dto.commercialNotes
      }
    })

    await emitAudit(this.prisma, {
      entityType: "WorkPackage",
      entityId: wp.id,
      action: "UPDATED",
      actorUserId,
      clientId,
      reference: wp.reference,
      title: wp.title
    })

    return wp
  }
}
