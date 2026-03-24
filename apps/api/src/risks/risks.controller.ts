import { Body, Controller, Get, Headers, Param, Post, Put, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { RisksService } from "./risks.service"
import { CreateRiskDto, UpdateRiskStatusDto, UpdateRiskDto } from "./dto"

const ALL_INTERNAL = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER
]

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("risks")
@ApiBearerAuth()
@Controller("risks")
export class RisksController {
  constructor(private risks: RisksService, private prisma: PrismaService) {}

  @Get()
  @Roles(...ALL_INTERNAL, Role.CLIENT_VIEWER)
  async list(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.risks.listForClient(clientId)
  }

  @Get(":id")
  @Roles(...ALL_INTERNAL, Role.CLIENT_VIEWER)
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.risks.getForClient(clientId, id)
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async create(@Req() req: any, @Body() dto: CreateRiskDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.risks.createForClient(clientId, user.userId, dto)
  }

  @Post(":id/status")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async updateStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateRiskStatusDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.risks.updateStatusForClient(clientId, id, user.userId, dto)
  }

  @Put(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateRiskDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.risks.updateForClient(clientId, id, user.userId, dto)
  }
}