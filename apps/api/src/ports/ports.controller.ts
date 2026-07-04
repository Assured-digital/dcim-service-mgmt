import { Body, Controller, Delete, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Max, Min, MinLength } from "class-validator"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { PORT_TYPES, PortType, PortsService } from "./ports.service"

const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const
const WRITE_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.ENGINEER,
] as const

class CreatePortDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string
  @IsIn(PORT_TYPES as unknown as string[]) portType!: PortType
  @IsOptional() @IsInt() @Min(1) position?: number
  @IsOptional() @IsInt() @Min(1) @Max(96) count?: number
}

class SetPassThroughDto {
  @IsString() @MinLength(1) peerPortId!: string
}

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("ports")
@ApiBearerAuth()
@Controller()
export class PortsController {
  constructor(private ports: PortsService, private prisma: PrismaService) {}

  private scope(req: any, cid?: string) {
    return resolveClientScope(getJwtUser(req), cid, this.prisma)
  }

  @Get("assets/:assetId/ports")
  @Roles(...READ_ROLES)
  async list(@Req() req: any, @Param("assetId") assetId: string, @Headers("x-client-id") cid?: string) {
    return this.ports.listForAsset(await this.scope(req, cid), assetId)
  }

  @Post("assets/:assetId/ports")
  @Roles(...WRITE_ROLES)
  async create(@Req() req: any, @Param("assetId") assetId: string, @Body() dto: CreatePortDto, @Headers("x-client-id") cid?: string) {
    return this.ports.create(await this.scope(req, cid), assetId, dto)
  }

  @Delete("ports/:id")
  @Roles(...WRITE_ROLES)
  async remove(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") cid?: string) {
    return this.ports.remove(await this.scope(req, cid), id)
  }

  // Pass-through pairing (patch-panel front↔rear) + end-to-end cable trace.
  @Post("ports/:id/through")
  @Roles(...WRITE_ROLES)
  async setThrough(@Req() req: any, @Param("id") id: string, @Body() dto: SetPassThroughDto, @Headers("x-client-id") cid?: string) {
    return this.ports.setPassThrough(await this.scope(req, cid), id, dto.peerPortId)
  }

  @Delete("ports/:id/through")
  @Roles(...WRITE_ROLES)
  async clearThrough(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") cid?: string) {
    return this.ports.clearPassThrough(await this.scope(req, cid), id)
  }

  @Get("ports/:id/trace")
  @Roles(...READ_ROLES)
  async trace(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") cid?: string) {
    return this.ports.trace(await this.scope(req, cid), id)
  }
}
