import { Controller, Get, Headers, Param, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { CapacityService } from "./capacity.service"

const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const

// Read-only capacity surfaces (spec §4.3). Scope resolves through the standard
// chokepoint; the site endpoint additionally validates site→client in the service.
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("capacity")
@ApiBearerAuth()
@Controller()
export class CapacityController {
  constructor(private capacity: CapacityService, private prisma: PrismaService) {}

  @Get("capacity/overview")
  @Roles(...READ_ROLES)
  async overview(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.capacity.getOverview(clientId)
  }

  @Get("sites/:siteId/capacity")
  @Roles(...READ_ROLES)
  async site(@Req() req: any, @Param("siteId") siteId: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.capacity.getSiteCapacity(clientId, siteId)
  }
}
