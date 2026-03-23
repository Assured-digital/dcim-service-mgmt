import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { CabinetsService } from "./cabinets.service"
import { CreateCabinetDto } from "./dto"

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("cabinets")
@ApiBearerAuth()
@Controller("sites/:siteId/cabinets")
export class CabinetsController {
  constructor(private cabinets: CabinetsService, private prisma: PrismaService) {}

  @Get()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async list(@Req() req: any, @Param("siteId") siteId: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.cabinets.listForSite(clientId, siteId)
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.ENGINEER)
  async create(@Req() req: any, @Param("siteId") siteId: string, @Body() dto: CreateCabinetDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.cabinets.createForSite(clientId, siteId, user.userId, dto)
  }
}