import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { WorkPackagesService } from "./work-packages.service"
import { CreateWorkPackageDto, UpdateWorkPackageDto } from "./dto"

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("work-packages")
@ApiBearerAuth()
@Controller("work-packages")
export class WorkPackagesController {
  constructor(private workPackages: WorkPackagesService, private prisma: PrismaService) {}

  @Get()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async list(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("renewingBefore") renewingBefore?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.workPackages.listForClient(clientId, user.role, { renewingBefore })
  }

  @Get(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.workPackages.getForClient(clientId, id, user.role)
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async create(@Req() req: any, @Body() dto: CreateWorkPackageDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.workPackages.createForClient(clientId, user.userId, dto)
  }

  @Patch(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateWorkPackageDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.workPackages.updateForClient(clientId, user.userId, id, dto)
  }
}