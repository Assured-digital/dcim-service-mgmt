import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { ModuleEntitlementGuard } from "../auth/module-entitlement.guard"
import { RequiresModule } from "../auth/module-entitlement.decorator"
import { PlatformModule } from "@prisma/client"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { RoomsService } from "./rooms.service"

@UseGuards(JwtAuthGuard, RolesGuard, ModuleEntitlementGuard)
@RequiresModule(PlatformModule.DCIM)
@ApiTags("rooms")
@ApiBearerAuth()
@Controller("sites/:siteId/rooms")
export class RoomsController {
  constructor(private rooms: RoomsService, private prisma: PrismaService) {}

  @Get()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async list(@Req() req: any, @Param("siteId") siteId: string, @Headers("x-client-id") clientHeader?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, clientHeader, this.prisma)
    return this.rooms.listForSite(clientId, siteId)
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async create(@Req() req: any, @Param("siteId") siteId: string, @Body() dto: any, @Headers("x-client-id") clientHeader?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, clientHeader, this.prisma)
    return this.rooms.createForSite(clientId, siteId, dto)
  }

  @Put(":roomId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.ENGINEER)
  async update(@Req() req: any, @Param("siteId") siteId: string, @Param("roomId") roomId: string, @Body() dto: any, @Headers("x-client-id") clientHeader?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, clientHeader, this.prisma)
    return this.rooms.update(clientId, siteId, roomId, dto)
  }

  @Delete(":roomId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async remove(@Req() req: any, @Param("siteId") siteId: string, @Param("roomId") roomId: string, @Headers("x-client-id") clientHeader?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, clientHeader, this.prisma)
    return this.rooms.remove(clientId, siteId, roomId)
  }
}