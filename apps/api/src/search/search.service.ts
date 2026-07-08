import { ForbiddenException, Injectable } from "@nestjs/common"
import { PlatformModule, Prisma, Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import type { ScopeViewer } from "../auth/role-scope"

export type SearchResultType =
  | "sr" | "inc" | "chg" | "task" | "risk" | "issue"
  | "knowledge" | "asset" | "check" | "contact" | "opportunity" | "quote"

export type SearchResult = {
  type: SearchResultType
  id: string
  reference: string
  title: string
  status: string
  module: PlatformModule
  detailPath: string
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(clientId: string, viewer: ScopeViewer, rawQuery: string, perType = 6) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const term = (rawQuery ?? "").trim()
    if (term.length < 2) return { results: [], resultsByType: {}, count: 0 }

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { organizationId: true }
    })
    const organizationId = client?.organizationId
    if (!organizationId) throw new ForbiddenException("Missing organization scope")

    const enabled = await this.enabledModules(clientId)
    const like: Prisma.StringFilter = { contains: term, mode: "insensitive" }
    const take = Math.min(Math.max(perType, 1), 15)
    const viewerIsClient = viewer.role === Role.CLIENT_VIEWER

    const tasks: Promise<SearchResult[]>[] = []
    if (enabled.has(PlatformModule.SERVICE_DESK)) {
      tasks.push(
        this.serviceRequests(clientId, like, take),
        this.incidents(clientId, like, take),
        this.changes(clientId, like, take),
        this.tasks(clientId, like, take),
        this.risks(clientId, like, take),
        this.issues(clientId, like, take),
        this.knowledge(organizationId, clientId, viewerIsClient, like, take)
      )
    }
    if (enabled.has(PlatformModule.DCIM)) tasks.push(this.assets(clientId, like, take))
    if (enabled.has(PlatformModule.OPERATIONS)) tasks.push(this.checks(clientId, like, take))
    if (enabled.has(PlatformModule.CRM)) {
      tasks.push(
        this.contacts(clientId, like, take),
        this.opportunities(clientId, like, take),
        this.quotes(clientId, like, take)
      )
    }

    const groups = await Promise.all(tasks)
    const results = groups.flat()
    const resultsByType = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
      ;(acc[r.type] ||= []).push(r)
      return acc
    }, {})
    return { results, resultsByType, count: results.length }
  }

  private async enabledModules(clientId: string): Promise<Set<PlatformModule>> {
    const rows = await this.prisma.clientModuleEntitlement.findMany({
      where: { clientId, enabled: true },
      select: { module: true }
    })
    return new Set(rows.map((r) => r.module))
  }

  private async serviceRequests(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      where: { clientId, OR: [{ reference: like }, { subject: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, subject: true, status: true }
    })
    return rows.map((r) => ({ type: "sr", id: r.id, reference: r.reference, title: r.subject, status: r.status, module: PlatformModule.SERVICE_DESK, detailPath: `/service-desk/sr/${r.id}` }))
  }

  private async incidents(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.incident.findMany({
      where: { clientId, OR: [{ reference: like }, { title: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, status: true }
    })
    return rows.map((r) => ({ type: "inc", id: r.id, reference: r.reference, title: r.title, status: r.status, module: PlatformModule.SERVICE_DESK, detailPath: `/service-desk/inc/${r.id}` }))
  }

  private async changes(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.changeRequest.findMany({
      where: { clientId, OR: [{ reference: like }, { title: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, status: true }
    })
    return rows.map((r) => ({ type: "chg", id: r.id, reference: r.reference, title: r.title, status: r.status, module: PlatformModule.SERVICE_DESK, detailPath: `/service-desk/chg/${r.id}` }))
  }

  private async tasks(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.task.findMany({
      where: { clientId, OR: [{ reference: like }, { title: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, status: true }
    })
    return rows.map((r) => ({ type: "task", id: r.id, reference: r.reference, title: r.title, status: r.status, module: PlatformModule.SERVICE_DESK, detailPath: `/service-desk/task/${r.id}` }))
  }

  private async risks(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.risk.findMany({
      where: { clientId, OR: [{ reference: like }, { title: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, status: true }
    })
    return rows.map((r) => ({ type: "risk", id: r.id, reference: r.reference, title: r.title, status: r.status, module: PlatformModule.SERVICE_DESK, detailPath: `/service-desk/risk/${r.id}` }))
  }

  private async issues(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.issue.findMany({
      where: { clientId, OR: [{ reference: like }, { title: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, status: true }
    })
    return rows.map((r) => ({ type: "issue", id: r.id, reference: r.reference, title: r.title, status: r.status, module: PlatformModule.SERVICE_DESK, detailPath: `/service-desk/issue/${r.id}` }))
  }

  private async knowledge(organizationId: string, clientId: string, viewerIsClient: boolean, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.knowledgeArticle.findMany({
      where: {
        organizationId,
        AND: [
          { OR: [{ clientId: null }, { clientId }] },
          { OR: [{ reference: like }, { title: like }] }
        ],
        ...(viewerIsClient ? { status: "PUBLISHED" as const } : {})
      },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, status: true }
    })
    return rows.map((r) => ({ type: "knowledge", id: r.id, reference: r.reference, title: r.title, status: r.status, module: PlatformModule.SERVICE_DESK, detailPath: "/knowledge" }))
  }

  private async assets(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    // clientId non-null excludes INTERNAL assets (which have no clientId).
    const rows = await this.prisma.asset.findMany({
      where: { clientId, OR: [{ assetTag: like }, { name: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, assetTag: true, name: true, status: true }
    })
    return rows.map((r) => ({ type: "asset", id: r.id, reference: r.assetTag, title: r.name, status: r.status, module: PlatformModule.DCIM, detailPath: `/asset-register/assets/${r.id}` }))
  }

  private async checks(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.check.findMany({
      where: { clientId, OR: [{ reference: like }, { title: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, status: true }
    })
    return rows.map((r) => ({ type: "check", id: r.id, reference: r.reference, title: r.title, status: r.status, module: PlatformModule.OPERATIONS, detailPath: `/checks/${r.id}` }))
  }

  private async contacts(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.contact.findMany({
      where: { clientId, OR: [{ firstName: like }, { lastName: like }, { email: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, firstName: true, lastName: true, status: true }
    })
    return rows.map((r) => ({ type: "contact", id: r.id, reference: "", title: `${r.firstName} ${r.lastName}`.trim(), status: r.status, module: PlatformModule.CRM, detailPath: "/crm/contacts" }))
  }

  private async opportunities(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.opportunity.findMany({
      where: { clientId, OR: [{ reference: like }, { title: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, stage: true }
    })
    return rows.map((r) => ({ type: "opportunity", id: r.id, reference: r.reference, title: r.title, status: r.stage, module: PlatformModule.CRM, detailPath: `/crm/opportunities/${r.id}` }))
  }

  private async quotes(clientId: string, like: Prisma.StringFilter, take: number): Promise<SearchResult[]> {
    const rows = await this.prisma.quote.findMany({
      where: { clientId, OR: [{ reference: like }, { title: like }] },
      take, orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, title: true, status: true }
    })
    return rows.map((r) => ({ type: "quote", id: r.id, reference: r.reference, title: r.title, status: r.status, module: PlatformModule.CRM, detailPath: `/crm/quotes/${r.id}` }))
  }
}
