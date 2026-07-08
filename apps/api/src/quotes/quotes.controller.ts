import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { PlatformModule, Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { ModuleEntitlementGuard } from "../auth/module-entitlement.guard"
import { RequiresModule } from "../auth/module-entitlement.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { QuotesService } from "./quotes.service"
import { CreateQuoteDto, CreateWorkPackageFromQuoteDto, ReplaceLineItemsDto, UpdateQuoteDto } from "./dto"

// CRM quotes (CRM_DESIGN.md §6). Reads: AD-staff (value + line prices stripped
// for field roles in the service). Writes: ORG_SUPER + SERVICE_MANAGER.
const AD_STAFF = [
  Role.ORG_OWNER,
  Role.ORG_ADMIN,
  Role.ADMIN,
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST,
  Role.ENGINEER
] as const

const COMMERCIAL_WRITERS = [Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER] as const

@UseGuards(JwtAuthGuard, RolesGuard, ModuleEntitlementGuard)
@RequiresModule(PlatformModule.CRM)
@ApiTags("quotes")
@ApiBearerAuth()
@Controller("quotes")
export class QuotesController {
  constructor(private quotes: QuotesService, private prisma: PrismaService) {}

  @Get()
  @Roles(...AD_STAFF)
  async list(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("status") status?: string,
    @Query("opportunityId") opportunityId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.quotes.listForClient(clientId, user.role, { status, opportunityId })
  }

  @Get(":id")
  @Roles(...AD_STAFF)
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.quotes.getForClient(clientId, user.role, id)
  }

  @Post()
  @Roles(...COMMERCIAL_WRITERS)
  async create(@Req() req: any, @Body() dto: CreateQuoteDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.quotes.createForClient(clientId, user.userId, dto)
  }

  @Patch(":id")
  @Roles(...COMMERCIAL_WRITERS)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateQuoteDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.quotes.updateForClient(clientId, user.userId, id, dto)
  }

  @Put(":id/line-items")
  @Roles(...COMMERCIAL_WRITERS)
  async replaceLineItems(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: ReplaceLineItemsDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.quotes.replaceLineItems(clientId, user.userId, id, dto)
  }

  @Post(":id/revise")
  @Roles(...COMMERCIAL_WRITERS)
  async revise(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.quotes.revise(clientId, user.userId, id)
  }

  @Post(":id/work-package")
  @Roles(...COMMERCIAL_WRITERS)
  async createWorkPackage(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: CreateWorkPackageFromQuoteDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.quotes.createWorkPackage(clientId, user.userId, id, dto)
  }
}
