import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { IsArray, IsNumber, IsOptional, IsString } from "class-validator"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { ModuleEntitlementGuard } from "../auth/module-entitlement.guard"
import { RequiresModule } from "../auth/module-entitlement.decorator"
import { PlatformModule } from "@prisma/client"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { SensorReadingsService } from "./sensor-readings.service"

const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const
// Field ops record readings — engineers and up (not read-only viewers).
const WRITE_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER,
] as const

class RecordReadingDto {
  @IsString() metric!: string
  @IsNumber() value!: number
  @IsOptional() @IsString() readAt?: string
}

class ImportRowDto {
  @IsOptional() @IsString() assetTag?: string
  @IsOptional() @IsString() assetId?: string
  @IsString() metric!: string
  @IsNumber() value!: number
  @IsOptional() @IsString() readAt?: string
}
class ImportReadingsDto {
  @IsArray() rows!: ImportRowDto[]
}

@UseGuards(JwtAuthGuard, RolesGuard, ModuleEntitlementGuard)
@RequiresModule(PlatformModule.DCIM)
@ApiTags("sensor-readings")
@ApiBearerAuth()
@Controller()
export class SensorReadingsController {
  constructor(private readings: SensorReadingsService, private prisma: PrismaService) {}

  private scope(req: any, cid?: string) {
    return resolveClientScope(getJwtUser(req), cid, this.prisma)
  }

  @Get("assets/:assetId/readings")
  @Roles(...READ_ROLES)
  async list(@Req() req: any, @Param("assetId") assetId: string, @Query("metric") metric?: string, @Headers("x-client-id") cid?: string) {
    return this.readings.listForAsset(await this.scope(req, cid), assetId, metric)
  }

  @Post("assets/:assetId/readings")
  @Roles(...WRITE_ROLES)
  async record(@Req() req: any, @Param("assetId") assetId: string, @Body() dto: RecordReadingDto, @Headers("x-client-id") cid?: string) {
    const user = getJwtUser(req)
    return this.readings.record(await this.scope(req, cid), user.userId, assetId, dto)
  }

  @Post("sensor-readings/import")
  @Roles(...WRITE_ROLES)
  async importCsv(@Req() req: any, @Body() dto: ImportReadingsDto, @Headers("x-client-id") cid?: string) {
    const user = getJwtUser(req)
    return this.readings.importCsv(await this.scope(req, cid), user.userId, dto.rows)
  }
}
