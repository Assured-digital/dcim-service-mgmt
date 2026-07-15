import { ForbiddenException, Injectable } from "@nestjs/common"
import { PlatformModule } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { MetricsService } from "../metrics/metrics.service"
import { CrmService } from "../crm/crm.service"
import { CapacityService } from "../dcim/capacity.service"
import { canSeeCommercial, type ScopeViewer } from "../auth/role-scope"
import { TERMINAL_STATUSES } from "../common/list-scope"

// D3 — cross-module Reporting. This service does NOT compute new metrics; it COMPOSES
// the existing per-module engines (MetricsService MTTR/SLA, CrmService commercial
// report, CapacityService DCIM overview) into one client-scoped model that also feeds
// the PDF + CSV exports (mirroring infrastructure-report's one-model-two-renders shape).
//
// Section gating is per-client entitlement (the same ClientModuleEntitlement source the
// ModuleEntitlementGuard reads), so a client only gets reports for modules they're
// licensed for. The CRM section additionally requires a commercial-capable role. The
// surface itself is role-gated at the controller (management/AD-staff, not ENGINEER),
// so the composed aggregates are never exposed to an assigned-scope-only viewer.

const DAY_MS = 86_400_000

// Exact section shapes are the underlying services' own return types — zero drift.
type MttrResult = Awaited<ReturnType<MetricsService["mttr"]>>
type SlaResult = Awaited<ReturnType<MetricsService["slaCompliance"]>>
type CrmReports = Awaited<ReturnType<CrmService["getReports"]>>
type DcimOverview = Awaited<ReturnType<CapacityService["getOverview"]>>

export type ReportingSummaryModel = {
  generatedAt: string
  clientId: string
  clientName: string
  range: { from: string; to: string; months: number }
  enabledModules: PlatformModule[]
  sections: {
    serviceDesk?: {
      mttr: MttrResult
      sla: SlaResult
      volumes: { openIncidents: number; openServiceRequests: number; openTasks: number }
    }
    dcim?: DcimOverview
    crm?: CrmReports
  }
}

@Injectable()
export class ReportingService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private crm: CrmService,
    private capacity: CapacityService
  ) {}

  async getSummary(
    clientId: string,
    viewer: ScopeViewer,
    opts: { months?: number } = {}
  ): Promise<ReportingSummaryModel> {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const months = Math.min(Math.max(opts.months ?? 6, 1), 24)
    const now = new Date()
    const from = new Date(now.getTime() - months * 30 * DAY_MS)
    const range = { from: from.toISOString(), to: now.toISOString(), months }

    const [client, entRows] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }),
      this.prisma.clientModuleEntitlement.findMany({
        where: { clientId, enabled: true },
        select: { module: true }
      })
    ])
    const enabled = new Set(entRows.map((r) => r.module))

    const sections: ReportingSummaryModel["sections"] = {}

    if (enabled.has(PlatformModule.SERVICE_DESK)) {
      const q = { from: range.from, to: range.to, bucket: "month" as const }
      const [mttr, sla, openIncidents, openServiceRequests, openTasks] = await Promise.all([
        this.metrics.mttr(clientId, viewer, q),
        this.metrics.slaCompliance(clientId, viewer, q),
        this.prisma.incident.count({ where: { clientId, status: { notIn: TERMINAL_STATUSES.incident as unknown as never } } }),
        this.prisma.serviceRequest.count({ where: { clientId, status: { notIn: TERMINAL_STATUSES.serviceRequest as unknown as never } } }),
        this.prisma.task.count({ where: { clientId, status: { notIn: TERMINAL_STATUSES.task as unknown as never } } })
      ])
      sections.serviceDesk = { mttr, sla, volumes: { openIncidents, openServiceRequests, openTasks } }
    }

    if (enabled.has(PlatformModule.DCIM)) {
      sections.dcim = await this.capacity.getOverview(clientId)
    }

    if (enabled.has(PlatformModule.CRM) && canSeeCommercial(viewer.role)) {
      sections.crm = await this.crm.getReports(clientId, months)
    }

    return {
      generatedAt: now.toISOString(),
      clientId,
      clientName: client?.name ?? "",
      range,
      enabledModules: [...enabled],
      sections
    }
  }
}
