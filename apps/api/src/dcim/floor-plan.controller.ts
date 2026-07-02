import {
  Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Req, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { memoryStorage } from "multer"
import type { Response } from "express"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import {
  IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from "class-validator"
import { Type } from "class-transformer"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { FloorPlanService } from "./floor-plan.service"
import { MAX_ATTACHMENT_BYTES } from "../attachments/content-policy"

const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const
const EDIT_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.ENGINEER,
] as const

class RoomSettingsDto {
  @IsOptional() @IsInt() @Min(0) widthMm?: number | null
  @IsOptional() @IsInt() @Min(0) depthMm?: number | null
  @IsOptional() @IsInt() @Min(1) gridCols?: number | null
  @IsOptional() @IsInt() @Min(1) gridRows?: number | null
  @IsOptional() @IsIn(["IMAGE", "DRAWN"]) shellType?: string | null
  @IsOptional() @IsNumber() backgroundOpacity?: number | null
  @IsOptional() @IsObject() shellShape?: any
}
class PlacementDto {
  @IsOptional() @IsNumber() posX?: number | null
  @IsOptional() @IsNumber() posY?: number | null
  @IsOptional() @IsInt() orientation?: number
  @IsOptional() @IsString() @MaxLength(20) row?: string | null
  @IsOptional() @IsInt() @Min(1) positionInRow?: number | null
  @IsOptional() @IsIn(["ACTIVE", "PLANNED", "DECOMMISSIONING", "RETIRED"]) status?: string
}
class FloorObjectDto {
  @IsIn(["CRAC", "UPS", "PDU", "COLUMN", "DOOR"]) objectType!: string
  @IsNumber() posX!: number
  @IsNumber() posY!: number
  @IsOptional() @IsNumber() width?: number
  @IsOptional() @IsNumber() depth?: number
  @IsOptional() @IsInt() orientation?: number
  @IsOptional() @IsString() @MaxLength(80) label?: string
  @IsOptional() @IsString() assetId?: string
}
class FloorObjectPatchDto {
  @IsOptional() @IsNumber() posX?: number
  @IsOptional() @IsNumber() posY?: number
  @IsOptional() @IsNumber() width?: number
  @IsOptional() @IsNumber() depth?: number
  @IsOptional() @IsInt() orientation?: number
  @IsOptional() @IsString() @MaxLength(80) label?: string
}
class AisleZoneDto {
  @IsIn(["HOT", "COLD"]) type!: string
  @IsObject() geometry!: any
  @IsOptional() @IsString() @MaxLength(80) label?: string
}
class AisleZonePatchDto {
  @IsOptional() @IsIn(["HOT", "COLD"]) type?: string
  @IsOptional() @IsObject() geometry?: any
  @IsOptional() @IsString() @MaxLength(80) label?: string
}
class ImportRowDto {
  @IsString() @MaxLength(120) name!: string
  @IsOptional() @IsString() @MaxLength(20) row?: string
  @IsOptional() @IsInt() @Min(1) positionInRow?: number
  @IsOptional() @IsInt() @Min(1) totalU?: number
  @IsOptional() @IsNumber() @Min(0) powerKw?: number
  @IsOptional() @IsNumber() posX?: number
  @IsOptional() @IsNumber() posY?: number
}
class CabinetImportDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ImportRowDto)
  rows!: ImportRowDto[]
  @IsOptional() @IsString() @MaxLength(80) mappingName?: string
  @IsOptional() @IsObject() columnMap?: Record<string, string>
}

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("floor-plan")
@ApiBearerAuth()
@Controller()
export class FloorPlanController {
  constructor(private fp: FloorPlanService, private prisma: PrismaService) {}

  private async scope(req: any, requestedClientId?: string) {
    return resolveClientScope(getJwtUser(req), requestedClientId, this.prisma)
  }

  @Get("rooms/:roomId/floor-plan")
  @Roles(...READ_ROLES)
  async get(@Req() req: any, @Param("roomId") roomId: string, @Headers("x-client-id") cid?: string) {
    return this.fp.getFloorPlan(await this.scope(req, cid), roomId)
  }

  @Patch("rooms/:roomId/floor-plan/settings")
  @Roles(...EDIT_ROLES)
  async settings(@Req() req: any, @Param("roomId") roomId: string, @Body() dto: RoomSettingsDto, @Headers("x-client-id") cid?: string) {
    return this.fp.updateRoomSettings(await this.scope(req, cid), roomId, dto)
  }

  @Patch("cabinets/:cabinetId/placement")
  @Roles(...EDIT_ROLES)
  async place(@Req() req: any, @Param("cabinetId") cabinetId: string, @Body() dto: PlacementDto, @Headers("x-client-id") cid?: string) {
    return this.fp.placeCabinet(await this.scope(req, cid), cabinetId, dto)
  }

  @Post("rooms/:roomId/floor-objects")
  @Roles(...EDIT_ROLES)
  async createObject(@Req() req: any, @Param("roomId") roomId: string, @Body() dto: FloorObjectDto, @Headers("x-client-id") cid?: string) {
    return this.fp.createFloorObject(await this.scope(req, cid), roomId, dto)
  }

  @Patch("rooms/:roomId/floor-objects/:id")
  @Roles(...EDIT_ROLES)
  async updateObject(@Req() req: any, @Param("roomId") roomId: string, @Param("id") id: string, @Body() dto: FloorObjectPatchDto, @Headers("x-client-id") cid?: string) {
    return this.fp.updateFloorObject(await this.scope(req, cid), roomId, id, dto)
  }

  @Delete("rooms/:roomId/floor-objects/:id")
  @Roles(...EDIT_ROLES)
  async deleteObject(@Req() req: any, @Param("roomId") roomId: string, @Param("id") id: string, @Headers("x-client-id") cid?: string) {
    return this.fp.deleteFloorObject(await this.scope(req, cid), roomId, id)
  }

  @Post("rooms/:roomId/aisle-zones")
  @Roles(...EDIT_ROLES)
  async createAisle(@Req() req: any, @Param("roomId") roomId: string, @Body() dto: AisleZoneDto, @Headers("x-client-id") cid?: string) {
    return this.fp.createAisleZone(await this.scope(req, cid), roomId, dto)
  }

  @Patch("rooms/:roomId/aisle-zones/:id")
  @Roles(...EDIT_ROLES)
  async updateAisle(@Req() req: any, @Param("roomId") roomId: string, @Param("id") id: string, @Body() dto: AisleZonePatchDto, @Headers("x-client-id") cid?: string) {
    return this.fp.updateAisleZone(await this.scope(req, cid), roomId, id, dto)
  }

  @Delete("rooms/:roomId/aisle-zones/:id")
  @Roles(...EDIT_ROLES)
  async deleteAisle(@Req() req: any, @Param("roomId") roomId: string, @Param("id") id: string, @Headers("x-client-id") cid?: string) {
    return this.fp.deleteAisleZone(await this.scope(req, cid), roomId, id)
  }

  @Post("rooms/:roomId/cabinet-import")
  @Roles(...EDIT_ROLES)
  async importCabinets(@Req() req: any, @Param("roomId") roomId: string, @Body() dto: CabinetImportDto, @Headers("x-client-id") cid?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, cid, this.prisma)
    return this.fp.importCabinets(clientId, roomId, user.userId, dto)
  }

  @Get("import-mappings")
  @Roles(...EDIT_ROLES)
  async mappings(@Req() req: any, @Headers("x-client-id") cid?: string) {
    return this.fp.listImportMappings(await this.scope(req, cid))
  }

  @Put("rooms/:roomId/floor-plan/background")
  @Roles(...EDIT_ROLES)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  async setBackground(@Req() req: any, @Param("roomId") roomId: string, @UploadedFile() file: Express.Multer.File, @Headers("x-client-id") cid?: string) {
    return this.fp.setBackground(await this.scope(req, cid), roomId, file)
  }

  @Get("rooms/:roomId/floor-plan/background")
  @Roles(...READ_ROLES)
  async getBackground(@Req() req: any, @Param("roomId") roomId: string, @Res() res: Response, @Headers("x-client-id") cid?: string) {
    const { stream, contentType } = await this.fp.openBackground(await this.scope(req, cid), roomId)
    res.setHeader("Content-Type", contentType)
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Cache-Control", "private, max-age=300")
    stream.on("error", () => { if (!res.headersSent) res.status(500); res.end() })
    stream.pipe(res)
  }
}
