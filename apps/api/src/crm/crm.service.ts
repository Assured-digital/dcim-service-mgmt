import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common"
import { Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { canSeeCommercial } from "../auth/role-scope"
import { OpportunitiesService } from "../opportunities/opportunities.service"
import { TasksService } from "../tasks/tasks.service"
import { MsGraphService, type DriveItem } from "../msgraph/msgraph.service"

const DAY = 86_400_000
const RENEWAL_BUFFER_DAYS = 14 // sweep fires at renewalDate − noticePeriodDays − buffer
const STAGE_ROT_DAYS: Record<string, number> = { DISCOVERY: 21, QUALIFIED: 21, PROPOSAL: 14, NEGOTIATION: 14 }
const OPEN_STAGES = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION"]

@Injectable()
export class CrmService {
  constructor(
    private prisma: PrismaService,
    private opportunities: OpportunitiesService,
    private tasks: TasksService,
    private graph: MsGraphService
  ) {}

  // ── SharePoint documents (CRM_DESIGN.md §8, Phase 7a app-only) ────────────
  // Browse/search the client's SharePoint folder. Returns a discriminated
  // status so the UI can distinguish "integration off", "no folder mapped"
  // and results — without throwing.
  async listDocuments(clientId: string, subPath?: string): Promise<
    | { status: "disabled" }
    | { status: "unmapped" }
    | { status: "ok"; folderPath: string; subPath: string; items: DriveItem[] }
  > {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    if (!this.graph.isConfigured()) return { status: "disabled" }
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { sharePointFolderPath: true } })
    const base = client?.sharePointFolderPath?.trim()
    if (!base) return { status: "unmapped" }
    const rel = this.safeSubPath(subPath)
    const fullPath = rel ? `${base.replace(/\/+$/g, "")}/${rel}` : base
    const items = await this.graph.listChildren(fullPath)
    return { status: "ok", folderPath: base, subPath: rel, items }
  }

  async searchDocuments(clientId: string, query: string): Promise<
    | { status: "disabled" }
    | { status: "unmapped" }
    | { status: "ok"; items: DriveItem[] }
  > {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    if (!this.graph.isConfigured()) return { status: "disabled" }
    if (!query?.trim()) throw new BadRequestException("A search term is required")
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { sharePointFolderPath: true } })
    const base = client?.sharePointFolderPath?.trim()
    if (!base) return { status: "unmapped" }
    const items = await this.graph.searchInFolder(base, query.trim())
    return { status: "ok", items }
  }

  // Reject traversal and absolute paths — the browse can never escape the
  // client's mapped folder (the tenant-scope boundary for documents).
  private safeSubPath(subPath?: string): string {
    const s = (subPath ?? "").replace(/^\/+|\/+$/g, "")
    if (!s) return ""
    if (s.split("/").some(seg => seg === "." || seg === "..")) {
      throw new BadRequestException("Invalid path")
    }
    return s
  }


  // ── Account overview (CRM_DESIGN.md §7) — the /crm landing for one client ──
  async getAccountOverview(clientId: string, viewerRole: Role | undefined) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const allowed = canSeeCommercial(viewerRole)
    const now = new Date()

    const [client, primaryContact, openOpps, recentActivity, openQuotes, nextRenewal,
           openIncidents, openSRs, lastActivityRow] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, lifecycleStage: true } }),
      this.prisma.contact.findFirst({
        where: { clientId, isPrimary: true, status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true, jobTitle: true, email: true, phone: true, mobile: true }
      }),
      this.prisma.opportunity.findMany({
        where: { clientId, stage: { in: OPEN_STAGES } },
        orderBy: { lastStageChangeAt: "desc" },
        select: { id: true, reference: true, title: true, stage: true, value: true, probability: true, expectedCloseDate: true }
      }),
      this.prisma.activity.findMany({
        where: { clientId },
        orderBy: { occurredAt: "desc" },
        take: 5,
        select: { id: true, type: true, subject: true, occurredAt: true }
      }),
      this.prisma.quote.findMany({
        where: { clientId, status: { in: ["DRAFT", "SENT"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, reference: true, title: true, status: true, value: true, validUntil: true }
      }),
      this.prisma.workPackage.findFirst({
        where: { clientId, renewalDate: { not: null, gte: now } },
        orderBy: { renewalDate: "asc" },
        select: { id: true, reference: true, title: true, renewalDate: true, noticePeriodDays: true }
      }),
      this.prisma.incident.count({ where: { clientId, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
      this.prisma.serviceRequest.count({ where: { clientId, status: { notIn: ["COMPLETED", "CLOSED"] } } }),
      // Most recent CRM touch across activities (the relationship-recency signal).
      this.prisma.activity.findFirst({ where: { clientId }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } })
    ])

    const daysSinceLastActivity = lastActivityRow
      ? Math.floor((now.getTime() - new Date(lastActivityRow.occurredAt).getTime()) / DAY)
      : null

    const weightedPipeline = allowed
      ? Math.round(openOpps.reduce((s, o) => s + (o.value ?? 0) * ((o.probability ?? 0) / 100), 0))
      : undefined

    // Strip commercial figures for field roles (decision 12).
    const oppView = openOpps.map(o => (allowed ? o : (({ value: _v, probability: _p, ...rest }) => rest)(o)))
    const quoteView = openQuotes.map(q => (allowed ? q : (({ value: _v, ...rest }) => rest)(q)))

    return {
      client,
      primaryContact,
      pipeline: { open: oppView, count: openOpps.length, weightedValue: weightedPipeline },
      recentActivity,
      quotes: quoteView,
      nextRenewal,
      // Raw health signals (NOT a composite score — CRM_DESIGN.md §7).
      health: { daysSinceLastActivity, openIncidents, openServiceRequests: openSRs }
    }
  }

  // ── Reports (CRM_DESIGN.md §7 "the reporting five") — commercial-gated at
  // the controller, so figures are always present here. Client-scoped.
  async getReports(clientId: string, months = 6) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const now = new Date()
    const since = new Date(now.getTime() - months * 30 * DAY)

    const [openOpps, decidedOpps] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: { clientId, stage: { in: OPEN_STAGES } },
        select: { id: true, reference: true, title: true, stage: true, value: true, probability: true, expectedCloseDate: true, lastStageChangeAt: true, nextStepDate: true }
      }),
      this.prisma.opportunity.findMany({
        where: { clientId, stage: { in: ["WON", "LOST"] }, lastStageChangeAt: { gte: since } },
        select: { stage: true, value: true, lostReason: true }
      })
    ])

    // 1. Pipeline by stage (count / value / weighted)
    const pipeline = OPEN_STAGES.map(stage => {
      const rows = openOpps.filter(o => o.stage === stage)
      const value = rows.reduce((s, o) => s + (o.value ?? 0), 0)
      const weighted = rows.reduce((s, o) => s + (o.value ?? 0) * ((o.probability ?? 0) / 100), 0)
      return { stage, count: rows.length, value, weighted: Math.round(weighted) }
    })

    // 2. Forecast by expected-close month (open, weighted)
    const byMonth = new Map<string, { value: number; weighted: number; count: number }>()
    for (const o of openOpps) {
      if (!o.expectedCloseDate) continue
      const d = new Date(o.expectedCloseDate)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const cur = byMonth.get(key) ?? { value: 0, weighted: 0, count: 0 }
      cur.value += o.value ?? 0
      cur.weighted += (o.value ?? 0) * ((o.probability ?? 0) / 100)
      cur.count += 1
      byMonth.set(key, cur)
    }
    const forecast = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, count: v.count, value: v.value, weighted: Math.round(v.weighted) }))

    // 3. Win/loss (period): win rate + loss-reason breakdown
    const won = decidedOpps.filter(o => o.stage === "WON")
    const lost = decidedOpps.filter(o => o.stage === "LOST")
    const lossReasons: Record<string, number> = {}
    for (const o of lost) {
      const r = o.lostReason ?? "UNKNOWN"
      lossReasons[r] = (lossReasons[r] ?? 0) + 1
    }
    const winLoss = {
      periodMonths: months,
      won: won.length,
      lost: lost.length,
      winRate: won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
      wonValue: won.reduce((s, o) => s + (o.value ?? 0), 0),
      lossReasons
    }

    // 4. Stalled deals (open, past stage threshold OR next step overdue)
    const stalled = openOpps
      .filter(o => {
        const limit = STAGE_ROT_DAYS[o.stage]
        const ageDays = (now.getTime() - new Date(o.lastStageChangeAt).getTime()) / DAY
        return (limit && ageDays > limit) || (!!o.nextStepDate && new Date(o.nextStepDate) < now)
      })
      .map(o => ({
        id: o.id, reference: o.reference, title: o.title, stage: o.stage, value: o.value ?? null,
        daysInStage: Math.floor((now.getTime() - new Date(o.lastStageChangeAt).getTime()) / DAY),
        nextStepOverdue: !!o.nextStepDate && new Date(o.nextStepDate) < now
      }))

    return { pipeline, forecast, winLoss, stalled }
  }

  // ── Renewals due across the scoped client (CRM_DESIGN.md §7 renewals panel) ──
  async getRenewals(clientId: string, withinDays = 90) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const cutoff = new Date(Date.now() + withinDays * DAY)
    return this.prisma.workPackage.findMany({
      where: { clientId, renewalDate: { not: null, lte: cutoff } },
      orderBy: { renewalDate: "asc" },
      select: { id: true, reference: true, title: true, renewalDate: true, noticePeriodDays: true, autoRenews: true, status: true }
    })
  }

  // ── The CRM sweep (CRM_DESIGN.md §6) — ONE idempotent pass, triggered by an
  // external schedule (Azure Container Apps job), not an in-process cron. Runs
  // across every client in the actor's organisation. Re-running is safe:
  // renewal opps dedupe on renewsWorkPackageId; nudge tasks dedupe on an open
  // task already linked to the same opportunity/quote.
  async runSweep(organizationId: string, actorUserId: string) {
    const now = new Date()
    const clients = await this.prisma.client.findMany({
      where: { organizationId, lifecycleStage: { not: "FORMER" } },
      select: { id: true }
    })

    let renewalOppsCreated = 0
    let stalledNudges = 0
    let staleQuoteNudges = 0

    for (const { id: clientId } of clients) {
      // (a) Due renewals → RENEWAL opportunity + follow-up task, deduped.
      const dueRenewals = await this.prisma.workPackage.findMany({
        where: { clientId, renewalDate: { not: null }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
        select: { id: true, reference: true, title: true, renewalDate: true, noticePeriodDays: true }
      })
      for (const wp of dueRenewals) {
        const fireAt = new Date(new Date(wp.renewalDate!).getTime() - ((wp.noticePeriodDays ?? 0) + RENEWAL_BUFFER_DAYS) * DAY)
        if (fireAt > now) continue
        const existing = await this.prisma.opportunity.findFirst({
          where: { clientId, renewsWorkPackageId: wp.id, stage: { notIn: ["WON", "LOST"] } },
          select: { id: true }
        })
        if (existing) continue
        const opp = await this.opportunities.createForClient(clientId, actorUserId, {
          title: `Renewal — ${wp.title}`,
          type: "RENEWAL",
          renewsWorkPackageId: wp.id
        })
        await this.tasks.createForClient(clientId, actorUserId, {
          title: `Prepare renewal for ${wp.reference}`,
          description: `Auto-raised by the CRM sweep — renewal window reached for ${wp.reference} (${wp.title}).`,
          linkedEntityType: "opportunity",
          linkedEntityId: opp.id
        })
        renewalOppsCreated++
      }

      // (b) Stalled opportunities → nudge task, deduped on an open linked task.
      const openOpps = await this.prisma.opportunity.findMany({
        where: { clientId, stage: { in: OPEN_STAGES } },
        select: { id: true, reference: true, title: true, stage: true, lastStageChangeAt: true, nextStepDate: true, ownerId: true }
      })
      for (const o of openOpps) {
        const limit = STAGE_ROT_DAYS[o.stage]
        const ageDays = (now.getTime() - new Date(o.lastStageChangeAt).getTime()) / DAY
        const overdueNextStep = !!o.nextStepDate && new Date(o.nextStepDate) < now
        if (ageDays <= limit && !overdueNextStep) continue
        if (await this.hasOpenNudge(clientId, "opportunity", o.id)) continue
        await this.tasks.createForClient(clientId, actorUserId, {
          title: `Stalled deal — ${o.reference}`,
          description: `${o.title} has been in ${o.stage} too long${overdueNextStep ? " and its next step is overdue" : ""}. Move it forward or update the next step.`,
          assigneeId: o.ownerId ?? undefined,
          linkedEntityType: "opportunity",
          linkedEntityId: o.id
        })
        stalledNudges++
      }

      // (c) SENT quotes past validUntil → nudge task, deduped.
      const staleQuotes = await this.prisma.quote.findMany({
        where: { clientId, status: "SENT", validUntil: { not: null, lt: now } },
        select: { id: true, reference: true, title: true }
      })
      for (const q of staleQuotes) {
        if (await this.hasOpenNudge(clientId, "quote", q.id)) continue
        await this.tasks.createForClient(clientId, actorUserId, {
          title: `Quote unanswered — ${q.reference}`,
          description: `${q.title} was sent and is now past its valid-until date with no decision. Chase it or mark it expired.`,
          linkedEntityType: "quote",
          linkedEntityId: q.id
        })
        staleQuoteNudges++
      }
    }

    return { clientsSwept: clients.length, renewalOppsCreated, stalledNudges, staleQuoteNudges }
  }

  private async hasOpenNudge(clientId: string, linkedEntityType: string, linkedEntityId: string) {
    const existing = await this.prisma.task.findFirst({
      where: { clientId, linkedEntityType, linkedEntityId, status: { not: "DONE" } },
      select: { id: true }
    })
    return !!existing
  }
}
