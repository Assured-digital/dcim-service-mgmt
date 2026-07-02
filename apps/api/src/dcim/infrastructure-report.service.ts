import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CapacityService } from "./capacity.service"
import {
  InfrastructureReportModel, buildInfrastructureReportPdf,
} from "../common/reporting/infrastructure-report-pdf"
import { renderToBuffer } from "../common/reporting/assemble-photos"

const UPCOMING_WINDOW_DAYS = 30

// Client-facing infrastructure report (DCIM_DESIGN_SPEC.md §5). Mirrors the
// ChecksReportService pattern: the model is assembled through clientId-scoped
// reads ONLY (site where {id, clientId}, capacity via CapacityService's scoped
// path, maintenance via site-scoped assets), so a spoofed x-client-id can never
// surface another tenant's estate. One JSON model feeds both the PDF and the
// web report page.
@Injectable()
export class InfrastructureReportService {
  constructor(private prisma: PrismaService, private capacity: CapacityService) {}

  async getModel(clientId: string, siteId: string): Promise<InfrastructureReportModel> {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, clientId },
      include: { client: { select: { name: true } } },
    })
    if (!site) throw new NotFoundException("Site not found")

    const cap = await this.capacity.getSiteCapacity(clientId, siteId)

    const now = new Date()
    const d90 = new Date(now.getTime() - 90 * 86400_000)
    const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86400_000)

    const [lifecycleGroups, typeGroups, last90Days, overdue, upcoming, reservations] = await Promise.all([
      this.prisma.asset.groupBy({ by: ["lifecycleState"], where: { clientId, siteId }, _count: true }),
      this.prisma.asset.groupBy({ by: ["assetType"], where: { clientId, siteId }, _count: true }),
      this.prisma.maintenanceLog.count({ where: { asset: { clientId, siteId }, performedAt: { gte: d90 } } }),
      this.prisma.maintenanceLog.count({ where: { asset: { clientId, siteId }, nextDueAt: { lt: now } } }),
      this.prisma.maintenanceLog.findMany({
        where: { asset: { clientId, siteId }, nextDueAt: { gte: now, lte: upcomingCutoff } },
        orderBy: { nextDueAt: "asc" }, take: 8,
        select: { workType: true, nextDueAt: true, asset: { select: { name: true } } },
      }),
      this.prisma.cabinetReservation.findMany({
        where: { clientId, cabinet: { siteId }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { uStart: "asc" },
        select: { name: true, uStart: true, uHeight: true, expiresAt: true, cabinet: { select: { name: true } } },
      }),
    ])

    return {
      clientName: site.client?.name ?? "—",
      siteName: site.name,
      generatedAt: now.toISOString(),
      contracted: { kw: site.contractedKw, u: site.contractedU },
      totals: cap.totals,
      cabinets: cap.cabinets.map((c) => ({
        name: c.name, usedU: c.space.usedU, totalU: c.totalU,
        budgetedKw: c.power.value, powerPct: c.power.pct,
        activeAssets: c.activeAssets, stranded: c.stranded,
      })),
      lifecycle: lifecycleGroups
        .map((g) => ({ state: g.lifecycleState as string, count: g._count }))
        .sort((a, b) => b.count - a.count),
      assetTypes: typeGroups
        .map((g) => ({ type: g.assetType, count: g._count }))
        .sort((a, b) => b.count - a.count),
      maintenance: {
        last90Days, overdue,
        upcoming: upcoming.map((m) => ({
          assetName: m.asset.name, workType: m.workType, dueAt: m.nextDueAt!.toISOString(),
        })),
      },
      reservations: reservations.map((r) => ({
        cabinetName: r.cabinet.name,
        range: r.uHeight > 1 ? `U${r.uStart}–${r.uStart + r.uHeight - 1}` : `U${r.uStart}`,
        name: r.name, expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      })),
    }
  }

  async generatePdf(clientId: string, siteId: string): Promise<{ filename: string; buffer: Buffer }> {
    const model = await this.getModel(clientId, siteId)
    const buffer = await renderToBuffer(buildInfrastructureReportPdf(model))
    const slug = model.siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    return { filename: `infrastructure-${slug}.pdf`, buffer }
  }
}
