import { Body, Controller, Delete, Get, Headers, Post, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { WatchService } from "./watch.service"
import { WatchTargetDto } from "./dto"

// Any authenticated user can watch records they can access (scope is validated in
// the service). Watching is the user's own state — read/write is their own.
const ALL_AUTHED = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER
]

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("watch")
@ApiBearerAuth()
@Controller("watch")
export class WatchController {
  constructor(private watch: WatchService, private prisma: PrismaService) {}

  @Get()
  @Roles(...ALL_AUTHED)
  async status(
    @Req() req: any,
    @Query("recordType") recordType: string,
    @Query("recordId") recordId: string,
    @Headers("x-client-id") cid?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, cid, this.prisma)
    return this.watch.getStatus(clientId, user.userId, recordType, recordId)
  }

  @Post()
  @Roles(...ALL_AUTHED)
  async watchIt(@Req() req: any, @Body() dto: WatchTargetDto, @Headers("x-client-id") cid?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, cid, this.prisma)
    return this.watch.watch(clientId, user.userId, dto.recordType, dto.recordId)
  }

  @Delete()
  @Roles(...ALL_AUTHED)
  async unwatch(
    @Req() req: any,
    @Query("recordType") recordType: string,
    @Query("recordId") recordId: string,
    @Headers("x-client-id") cid?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, cid, this.prisma)
    return this.watch.unwatch(clientId, user.userId, recordType, recordId)
  }
}
