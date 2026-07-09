import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { ModuleEntitlementGuard } from "../auth/module-entitlement.guard"
import { RequiresModule } from "../auth/module-entitlement.decorator"
import { PlatformModule } from "@prisma/client"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { CapacityService } from "./capacity.service"

const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const

class FindSpaceDto {
  @IsInt() @Min(1) @Max(60) uSize!: number
  @IsOptional() @IsNumber() @Min(0) budgetW?: number
  @IsOptional() @IsNumber() @Min(0) weightKg?: number
  @IsOptional() @IsString() siteId?: string
}

// Read-only capacity surfaces (spec §4.3). Scope resolves through the standard
// chokepoint; the site endpoint additionally validates site→client in the service.
@UseGuards(JwtAuthGuard, RolesGuard, ModuleEntitlementGuard)
@RequiresModule(PlatformModule.DCIM)
@ApiTags("capacity")
@ApiBearerAuth()
@Controller()
export class CapacityController {
  constructor(private capacity: CapacityService, private prisma: PrismaService) {}

  @Get("capacity/overview")
  @Roles(...READ_ROLES)
  async overview(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.capacity.getOverview(clientId)
  }

  @Get("sites/:siteId/capacity")
  @Roles(...READ_ROLES)
  async site(@Req() req: any, @Param("siteId") siteId: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.capacity.getSiteCapacity(clientId, siteId)
  }

  // Capacity search for Place-or-Reserve. POST for the constraint body; still a
  // pure read (no writes) — the write happens via reservations/assets afterwards.
  @Post("capacity/find-space")
  @Roles(...READ_ROLES)
  async findSpace(@Req() req: any, @Body() dto: FindSpaceDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.capacity.findSpace(clientId, dto)
  }
}
