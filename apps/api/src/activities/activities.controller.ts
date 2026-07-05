import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { ActivitiesService } from "./activities.service"
import { CreateActivityDto, CreateFollowOnTaskDto, UpdateActivityDto } from "./dto"

// CRM activity log (CRM_DESIGN.md §6) — AD-staff only, no CLIENT_VIEWER.
const AD_STAFF = [
  Role.ORG_OWNER,
  Role.ORG_ADMIN,
  Role.ADMIN,
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST,
  Role.ENGINEER
] as const

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("activities")
@ApiBearerAuth()
@Controller("activities")
export class ActivitiesController {
  constructor(private activities: ActivitiesService, private prisma: PrismaService) {}

  @Get()
  @Roles(...AD_STAFF)
  async list(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("type") type?: string,
    @Query("contactId") contactId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.activities.listForClient(clientId, { type, contactId, from, to })
  }

  @Get(":id")
  @Roles(...AD_STAFF)
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.activities.getForClient(clientId, id)
  }

  @Post()
  @Roles(...AD_STAFF)
  async create(@Req() req: any, @Body() dto: CreateActivityDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.activities.createForClient(clientId, user.userId, dto)
  }

  @Patch(":id")
  @Roles(...AD_STAFF)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateActivityDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.activities.updateForClient(clientId, { userId: user.userId, role: user.role }, id, dto)
  }

  @Post(":id/follow-up")
  @Roles(...AD_STAFF)
  async followUp(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: CreateFollowOnTaskDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.activities.createFollowOn(clientId, user.userId, id, dto)
  }
}
