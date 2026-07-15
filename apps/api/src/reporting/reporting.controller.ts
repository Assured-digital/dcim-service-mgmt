import { Controller, Get, Headers, Query, Req, Res, UseGuards } from "@nestjs/common"
import type { Response } from "express"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { contentDispositionHeader } from "../attachments/content-policy"
import { renderToBuffer } from "../common/reporting/assemble-photos"
import { PrismaService } from "../prisma/prisma.service"
import { ReportingService } from "./reporting.service"
import { buildReportingSummaryPdf } from "./reporting-pdf"
import { buildReportingSummaryCsv } from "./reporting-csv"

// D3 — cross-module Reporting surface. Role-gated to management / AD-staff (NOT ENGINEER
// or CLIENT_VIEWER): the summary composes CLIENT-WIDE aggregates, so it must not reach an
// assigned-scope-only viewer. Per-section entitlement + commercial gating is enforced in
// the service. clientId is resolved at the edge via resolveClientScope (same chokepoint).
const REPORTING_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST
]

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("reporting")
@ApiBearerAuth()
@Controller("reporting")
export class ReportingController {
  constructor(private reporting: ReportingService, private prisma: PrismaService) {}

  private months(raw?: string): number | undefined {
    if (raw == null) return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }

  private slug(model: { clientName: string; generatedAt: string }): string {
    const name = (model.clientName || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    return `${name || "report"}-${model.generatedAt.slice(0, 10)}`
  }

  @Get("summary")
  @Roles(...REPORTING_ROLES)
  async summary(
    @Req() req: any,
    @Query("months") months?: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.reporting.getSummary(clientId, user, { months: this.months(months) })
  }

  @Get("summary.pdf")
  @Roles(...REPORTING_ROLES)
  async summaryPdf(
    @Req() req: any,
    @Res() res: Response,
    @Query("months") months?: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    const model = await this.reporting.getSummary(clientId, user, { months: this.months(months) })
    const buffer = await renderToBuffer(buildReportingSummaryPdf(model))
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Content-Length", String(buffer.length))
    res.setHeader("Content-Disposition", contentDispositionHeader("attachment", `${this.slug(model)}.pdf`))
    res.send(buffer)
  }

  @Get("summary.csv")
  @Roles(...REPORTING_ROLES)
  async summaryCsv(
    @Req() req: any,
    @Res() res: Response,
    @Query("months") months?: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    const model = await this.reporting.getSummary(clientId, user, { months: this.months(months) })
    const csv = buildReportingSummaryCsv(model)
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Content-Disposition", contentDispositionHeader("attachment", `${this.slug(model)}.csv`))
    res.send(csv)
  }
}
