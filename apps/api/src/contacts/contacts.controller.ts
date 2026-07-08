import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { PlatformModule, Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { ModuleEntitlementGuard } from "../auth/module-entitlement.guard"
import { RequiresModule } from "../auth/module-entitlement.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { ContactsService } from "./contacts.service"
import { CreateContactDto, UpdateContactDto } from "./dto"

// CRM contacts (CRM_DESIGN.md §6) — AD-staff only, no CLIENT_VIEWER.
const AD_STAFF = [
  Role.ORG_OWNER,
  Role.ORG_ADMIN,
  Role.ADMIN,
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST,
  Role.ENGINEER
] as const

@UseGuards(JwtAuthGuard, RolesGuard, ModuleEntitlementGuard)
@RequiresModule(PlatformModule.CRM)
@ApiTags("contacts")
@ApiBearerAuth()
@Controller("contacts")
export class ContactsController {
  constructor(private contacts: ContactsService, private prisma: PrismaService) {}

  @Get()
  @Roles(...AD_STAFF)
  async list(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("siteId") siteId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.contacts.listForClient(clientId, { status, category, siteId })
  }

  @Get(":id")
  @Roles(...AD_STAFF)
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.contacts.getForClient(clientId, id)
  }

  @Post()
  @Roles(...AD_STAFF)
  async create(@Req() req: any, @Body() dto: CreateContactDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.contacts.createForClient(clientId, user.userId, dto)
  }

  @Patch(":id")
  @Roles(...AD_STAFF)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateContactDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.contacts.updateForClient(clientId, user.userId, id, dto)
  }
}
