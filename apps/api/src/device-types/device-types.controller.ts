import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { memoryStorage } from "multer"
import type { Response } from "express"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { DeviceAirflow, Role } from "@prisma/client"
import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from "class-validator"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { DeviceTypesService, ImageFace } from "./device-types.service"
import { MAX_ATTACHMENT_BYTES } from "../attachments/content-policy"

// Read = every operational role incl. view-only (the picker consumes it too).
const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const
// Create = field-callable (keeps DeviceTypePicker's in-flow creation working).
const CREATE_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER,
] as const
// Manage (edit/delete/images) = SERVICE_MANAGER and up only (spec §0.1 flag 3).
const MANAGE_ROLES = [Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER] as const

export class CreateDeviceTypeDto {
  @IsOptional() @IsString() manufacturerId?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) manufacturerName?: string
  @IsString() @MinLength(1) @MaxLength(200) model!: string
  @IsOptional() @IsNumber() @Min(0) uHeight?: number
  @IsOptional() @IsBoolean() isFullDepth?: boolean
  @IsOptional() @IsNumber() @Min(0) powerDrawW?: number
  @IsOptional() @IsString() @MaxLength(120) partNumber?: string
  @IsOptional() @IsNumber() @Min(0) weightKg?: number
  @IsOptional() @IsEnum(DeviceAirflow) airflow?: DeviceAirflow
  @IsOptional() @IsString() @MaxLength(60) category?: string
  @IsOptional() @IsBoolean() excludeFromUtilization?: boolean
  @IsOptional() @IsInt() @Min(1) @Max(100) deratePct?: number
}

export class UpdateDeviceTypeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) model?: string
  @IsOptional() @IsNumber() @Min(0) uHeight?: number | null
  @IsOptional() @IsBoolean() isFullDepth?: boolean
  @IsOptional() @IsNumber() @Min(0) powerDrawW?: number | null
  @IsOptional() @IsString() @MaxLength(120) partNumber?: string | null
  @IsOptional() @IsNumber() @Min(0) weightKg?: number | null
  @IsOptional() @IsEnum(DeviceAirflow) airflow?: DeviceAirflow | null
  @IsOptional() @IsString() @MaxLength(60) category?: string | null
  @IsOptional() @IsBoolean() excludeFromUtilization?: boolean
  @IsOptional() @IsInt() @Min(1) @Max(100) deratePct?: number | null
}

// The catalogue is GLOBAL, not tenant-scoped: no x-client-id / resolveClientScope
// here. Auth still applies (see role sets above).
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("device-types")
@ApiBearerAuth()
@Controller("device-types")
export class DeviceTypesController {
  constructor(private deviceTypes: DeviceTypesService) {}

  @Get()
  @Roles(...READ_ROLES)
  async list(@Query("search") search?: string, @Query("manufacturerId") manufacturerId?: string) {
    return this.deviceTypes.search(search, manufacturerId)
  }

  @Post()
  @Roles(...CREATE_ROLES)
  async create(@Body() dto: CreateDeviceTypeDto) {
    return this.deviceTypes.create(dto)
  }

  @Get(":id")
  @Roles(...READ_ROLES)
  async getOne(@Param("id") id: string) {
    return this.deviceTypes.getOne(id)
  }

  @Patch(":id")
  @Roles(...MANAGE_ROLES)
  async update(@Param("id") id: string, @Body() dto: UpdateDeviceTypeDto) {
    return this.deviceTypes.update(id, dto)
  }

  @Delete(":id")
  @Roles(...MANAGE_ROLES)
  async remove(@Param("id") id: string) {
    return this.deviceTypes.remove(id)
  }

  @Put(":id/images/:face")
  @Roles(...MANAGE_ROLES)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  async setImage(
    @Param("id") id: string,
    @Param("face") face: ImageFace,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.deviceTypes.setImage(id, face === "rear" ? "rear" : "front", file)
  }

  // Global read — bytes stream THROUGH the API (no presigned URLs), same posture
  // as attachments. nosniff always; images are inline-safe (raster only).
  @Get(":id/images/:face")
  @Roles(...READ_ROLES)
  async getImage(@Param("id") id: string, @Param("face") face: ImageFace, @Res() res: Response) {
    const { stream, contentType } = await this.deviceTypes.openImage(id, face === "rear" ? "rear" : "front")
    res.setHeader("Content-Type", contentType)
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Content-Disposition", "inline")
    res.setHeader("Cache-Control", "private, max-age=300")
    stream.on("error", () => { if (!res.headersSent) res.status(500); res.end() })
    stream.pipe(res)
  }
}

// The manufacturer rail (spec §3.1). Separate controller so the route is a clean
// GET /manufacturers rather than nesting under /device-types.
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("device-types")
@ApiBearerAuth()
@Controller("manufacturers")
export class ManufacturersController {
  constructor(private deviceTypes: DeviceTypesService) {}

  @Get()
  @Roles(...READ_ROLES)
  async list() {
    return this.deviceTypes.listManufacturers()
  }
}
