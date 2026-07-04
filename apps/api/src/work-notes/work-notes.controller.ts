import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { IsIn, IsString, MaxLength, MinLength } from "class-validator"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { WORK_NOTE_ENTITY_TYPES, WorkNoteEntityType, WorkNotesService } from "./work-notes.service"

const READ_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER,
] as const
const WRITE_ROLES = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST, Role.ENGINEER,
] as const

class CreateWorkNoteDto {
  @IsIn(WORK_NOTE_ENTITY_TYPES as unknown as string[]) entityType!: WorkNoteEntityType
  @IsString() @MinLength(1) entityId!: string
  @IsString() @MinLength(1) @MaxLength(4000) body!: string
}

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("work-notes")
@ApiBearerAuth()
@Controller("work-notes")
export class WorkNotesController {
  constructor(private notes: WorkNotesService, private prisma: PrismaService) {}

  private scope(req: any, cid?: string) {
    return resolveClientScope(getJwtUser(req), cid, this.prisma)
  }

  @Get()
  @Roles(...READ_ROLES)
  async list(
    @Req() req: any,
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
    @Headers("x-client-id") cid?: string
  ) {
    const type = (WORK_NOTE_ENTITY_TYPES as readonly string[]).includes(entityType) ? (entityType as WorkNoteEntityType) : null
    if (!type || !entityId) return []
    return this.notes.listForEntity(await this.scope(req, cid), type, entityId)
  }

  @Post()
  @Roles(...WRITE_ROLES)
  async create(@Req() req: any, @Body() dto: CreateWorkNoteDto, @Headers("x-client-id") cid?: string) {
    const user = getJwtUser(req)
    const clientId = await this.scope(req, cid)
    return this.notes.create(clientId, user.userId, dto.entityType, dto.entityId, dto.body)
  }

  @Delete(":id")
  @Roles(...WRITE_ROLES)
  async remove(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") cid?: string) {
    const user = getJwtUser(req)
    const clientId = await this.scope(req, cid)
    return this.notes.remove(clientId, user.userId, user.role as Role, id)
  }
}
