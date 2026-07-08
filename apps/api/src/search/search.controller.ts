import { Controller, Get, Headers, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { SearchService } from "./search.service"

// Global search is platform-level (not a single module) — any authed member of
// the scoped client can search. Per-type results are filtered to the client's
// licensed modules inside the service.
const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER
]

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("search")
@ApiBearerAuth()
@Controller("search")
export class SearchController {
  constructor(private search: SearchService, private prisma: PrismaService) {}

  @Get()
  @Roles(...READ_ROLES)
  async global(@Req() req: any, @Query("q") q: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.search.search(clientId, user, q ?? "")
  }
}
