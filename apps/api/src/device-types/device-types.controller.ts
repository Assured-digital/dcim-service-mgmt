import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { DeviceTypesService } from "./device-types.service"

// DTO kept inline (this is a compact two-endpoint module — no separate dto.ts).
export class CreateDeviceTypeDto {
  // Either manufacturerId (existing) or manufacturerName (find-or-create).
  @IsOptional()
  @IsString()
  manufacturerId?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  manufacturerName?: string

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model!: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  uHeight?: number

  @IsOptional()
  @IsBoolean()
  isFullDepth?: boolean

  @IsOptional()
  @IsNumber()
  @Min(0)
  powerDrawW?: number

  @IsOptional()
  @IsString()
  @MaxLength(120)
  partNumber?: string
}

// The catalogue is GLOBAL, not tenant-scoped: no x-client-id / resolveClientScope
// here. Auth still applies — any authenticated user may read; creating a type is
// barred for view-only (CLIENT_VIEWER) and PUBLIC_USER roles.
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("device-types")
@ApiBearerAuth()
@Controller("device-types")
export class DeviceTypesController {
  constructor(private deviceTypes: DeviceTypesService) {}

  @Get()
  @Roles(
    Role.ORG_OWNER,
    Role.ORG_ADMIN,
    Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER,
  )
  async list(@Query("search") search?: string) {
    return this.deviceTypes.search(search)
  }

  @Post()
  @Roles(
    Role.ORG_OWNER,
    Role.ORG_ADMIN,
    Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
  )
  async create(@Body() dto: CreateDeviceTypeDto) {
    return this.deviceTypes.create(dto)
  }
}
