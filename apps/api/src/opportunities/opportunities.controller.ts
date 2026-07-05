import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { OpportunitiesService } from "./opportunities.service"
import { CreateOpportunityDto, CreateWorkPackageFromOpportunityDto, UpdateOpportunityDto } from "./dto"

// CRM pipeline (CRM_DESIGN.md §6). Reads: AD-staff (values stripped for field
// roles in the service). Writes: ORG_SUPER + SERVICE_MANAGER (commercial tier).
const AD_STAFF = [
  Role.ORG_OWNER,
  Role.ORG_ADMIN,
  Role.ADMIN,
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST,
  Role.ENGINEER
] as const

const COMMERCIAL_WRITERS = [Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER] as const

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("opportunities")
@ApiBearerAuth()
@Controller("opportunities")
export class OpportunitiesController {
  constructor(private opportunities: OpportunitiesService, private prisma: PrismaService) {}

  @Get()
  @Roles(...AD_STAFF)
  async list(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("stage") stage?: string,
    @Query("type") type?: string,
    @Query("ownerId") ownerId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.opportunities.listForClient(clientId, user.role, { stage, type, ownerId })
  }

  @Get(":id")
  @Roles(...AD_STAFF)
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.opportunities.getForClient(clientId, user.role, id)
  }

  @Post()
  @Roles(...COMMERCIAL_WRITERS)
  async create(@Req() req: any, @Body() dto: CreateOpportunityDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.opportunities.createForClient(clientId, user.userId, dto)
  }

  @Patch(":id")
  @Roles(...COMMERCIAL_WRITERS)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateOpportunityDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.opportunities.updateForClient(clientId, user.userId, id, dto)
  }

  @Post(":id/work-package")
  @Roles(...COMMERCIAL_WRITERS)
  async createWorkPackage(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: CreateWorkPackageFromOpportunityDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.opportunities.createWorkPackage(clientId, user.userId, id, dto)
  }
}
