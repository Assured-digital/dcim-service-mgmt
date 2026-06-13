import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { CommentsService } from "./comments.service"
import { CreateCommentDto, CreateCustomerUpdateDto, CreateReplyDto } from "./dto"

const ALL_INTERNAL = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER
]

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("comments")
@ApiBearerAuth()
@Controller("comments")
export class CommentsController {
  constructor(private comments: CommentsService, private prisma: PrismaService) {}

  @Get(":entityType/:entityId")
  @Roles(...ALL_INTERNAL, Role.CLIENT_VIEWER)
  async list(
    @Req() req: any,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.comments.listForEntity(clientId, entityType, entityId)
  }

  @Get(":entityType/:entityId/work-notes")
  @Roles(...ALL_INTERNAL)
  async listWorkNotes(
    @Req() req: any,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.comments.listWorkNotes(clientId, entityType, entityId)
  }

  @Get(":entityType/:entityId/customer-updates")
  @Roles(...ALL_INTERNAL, Role.CLIENT_VIEWER)
  async listCustomerUpdates(
    @Req() req: any,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.comments.listCustomerUpdates(clientId, entityType, entityId)
  }

  @Post("work-note")
  @Roles(...ALL_INTERNAL)
  async createWorkNote(
    @Req() req: any,
    @Body() dto: CreateCommentDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.comments.createWorkNote(clientId, user.userId, dto)
  }

  @Post("customer-update")
  @Roles(...ALL_INTERNAL)
  async createCustomerUpdate(
    @Req() req: any,
    @Body() dto: CreateCustomerUpdateDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.comments.createCustomerUpdate(clientId, user.userId, dto)
  }

  // Reply to a top-level comment. entityType/entityId/type are inherited from the
  // parent post (see CreateReplyDto) — the body carries only parentCommentId + the
  // rich content. Two-level validation lives in the service.
  @Post("reply")
  @Roles(...ALL_INTERNAL)
  async createReply(
    @Req() req: any,
    @Body() dto: CreateReplyDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.comments.createReply(clientId, user.userId, dto)
  }
}
