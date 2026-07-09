import { Controller, Get, Headers, Query, Req, Res, UseGuards } from "@nestjs/common"
import type { Response } from "express"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { ModuleEntitlementGuard } from "../auth/module-entitlement.guard"
import { RequiresModule } from "../auth/module-entitlement.decorator"
import { PlatformModule } from "@prisma/client"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { InfrastructureReportService } from "./infrastructure-report.service"
import { contentDispositionHeader } from "../attachments/content-policy"

// CLIENT_VIEWER included by design — this report IS the client-facing surface
// (DCIM spec §5 / the Hyperview "Reporting role" gap).
const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const

@UseGuards(JwtAuthGuard, RolesGuard, ModuleEntitlementGuard)
@RequiresModule(PlatformModule.DCIM)
@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
export class InfrastructureReportController {
  constructor(private report: InfrastructureReportService, private prisma: PrismaService) {}

  // JSON model — feeds the web report page (same model the PDF renders).
  @Get("infrastructure")
  @Roles(...READ_ROLES)
  async json(@Req() req: any, @Query("siteId") siteId: string, @Headers("x-client-id") cid?: string) {
    const clientId = await resolveClientScope(getJwtUser(req), cid, this.prisma)
    return this.report.getModel(clientId, siteId)
  }

  @Get("infrastructure.pdf")
  @Roles(...READ_ROLES)
  async pdf(@Req() req: any, @Query("siteId") siteId: string, @Res() res: Response, @Headers("x-client-id") cid?: string) {
    const clientId = await resolveClientScope(getJwtUser(req), cid, this.prisma)
    const { filename, buffer } = await this.report.generatePdf(clientId, siteId)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Content-Length", String(buffer.length))
    res.setHeader("Content-Disposition", contentDispositionHeader("attachment", filename))
    res.send(buffer)
  }
}
