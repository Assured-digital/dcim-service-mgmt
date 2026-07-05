import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { AssetCustomFieldsService, CUSTOM_FIELD_TYPES } from "./asset-custom-fields.service"

// Everyone reads the field schema (to render values); managing it is org-super
// or service-manager only (the estate-config gate, mirrors user management).
const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const
const MANAGE_ROLES = [Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER] as const

class CreateFieldDto {
  @IsString() @MinLength(1) @MaxLength(60) label!: string
  @IsIn(CUSTOM_FIELD_TYPES as unknown as string[]) type!: string
  @IsOptional() @IsArray() options?: string[]
}
class UpdateFieldDto {
  @IsOptional() @IsString() @MaxLength(60) label?: string
  @IsOptional() @IsArray() options?: string[]
  @IsOptional() @IsInt() order?: number
}

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("asset-custom-fields")
@ApiBearerAuth()
@Controller("asset-custom-fields")
export class AssetCustomFieldsController {
  constructor(private fields: AssetCustomFieldsService, private prisma: PrismaService) {}

  private scope(req: any, cid?: string) {
    return resolveClientScope(getJwtUser(req), cid, this.prisma)
  }

  @Get()
  @Roles(...READ_ROLES)
  async list(@Req() req: any, @Headers("x-client-id") cid?: string) {
    return this.fields.list(await this.scope(req, cid))
  }

  @Post()
  @Roles(...MANAGE_ROLES)
  async create(@Req() req: any, @Body() dto: CreateFieldDto, @Headers("x-client-id") cid?: string) {
    return this.fields.create(await this.scope(req, cid), dto)
  }

  @Put(":id")
  @Roles(...MANAGE_ROLES)
  async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateFieldDto, @Headers("x-client-id") cid?: string) {
    return this.fields.update(await this.scope(req, cid), id, dto)
  }

  @Delete(":id")
  @Roles(...MANAGE_ROLES)
  async remove(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") cid?: string) {
    return this.fields.remove(await this.scope(req, cid), id)
  }
}
