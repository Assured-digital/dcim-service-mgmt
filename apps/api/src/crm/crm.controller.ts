import { BadRequestException, Controller, Get, Headers, Post, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { CrmService } from "./crm.service"

const AD_STAFF = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER
] as const

// Reports are all-about-money → commercial roles only (decision 12).
const COMMERCIAL = [Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER] as const

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("crm")
@ApiBearerAuth()
@Controller("crm")
export class CrmController {
  constructor(private crm: CrmService, private prisma: PrismaService) {}

  @Get("overview")
  @Roles(...AD_STAFF)
  async overview(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.crm.getAccountOverview(clientId, user.role)
  }

  @Get("renewals")
  @Roles(...AD_STAFF)
  async renewals(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("withinDays") withinDays?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.crm.getRenewals(clientId, withinDays ? Number(withinDays) : 90)
  }

  @Get("reports")
  @Roles(...COMMERCIAL)
  async reports(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("months") months?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.crm.getReports(clientId, months ? Number(months) : 6)
  }

  // SharePoint document browse/search (CRM_DESIGN.md §8 Phase 7a). AD-staff
  // gated; the app-only Graph access is scoped to the client's mapped folder.
  @Get("documents")
  @Roles(...AD_STAFF)
  async documents(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("subPath") subPath?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.crm.listDocuments(clientId, subPath)
  }

  @Get("documents/search")
  @Roles(...AD_STAFF)
  async searchDocuments(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("q") q?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.crm.searchDocuments(clientId, q ?? "")
  }

  // The CRM sweep (CRM_DESIGN.md §6). Idempotent; runs across the actor's org.
  // Triggered by an external schedule (Azure Container Apps job) — NOT an
  // in-process cron. Org-super only (it is a system-level maintenance action).
  @Post("sweep")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async sweep(@Req() req: any) {
    const user = getJwtUser(req)
    const organizationId = user.organizationId
      ?? (await this.prisma.user.findUnique({ where: { id: user.userId }, select: { organizationId: true } }))?.organizationId
    if (!organizationId) throw new BadRequestException("Missing organization scope")
    return this.crm.runSweep(organizationId, user.userId)
  }
}
