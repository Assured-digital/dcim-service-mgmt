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
