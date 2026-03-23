import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser } from "../auth/request-context"
import { CommentsService } from "./comments.service"
import { CreateCommentDto, CreateCustomerUpdateDto } from "./dto"

const ALL_INTERNAL = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER
]

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("comments")
@ApiBearerAuth()
@Controller("comments")
export class CommentsController {
  constructor(private comments: CommentsService) {}

  @Get(":entityType/:entityId")
  @Roles(...ALL_INTERNAL, Role.CLIENT_VIEWER)
  async list(
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string
  ) {
    return this.comments.listForEntity(entityType, entityId)
  }

  @Get(":entityType/:entityId/work-notes")
  @Roles(...ALL_INTERNAL)
  async listWorkNotes(
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string
  ) {
    return this.comments.listWorkNotes(entityType, entityId)
  }

  @Get(":entityType/:entityId/customer-updates")
  @Roles(...ALL_INTERNAL, Role.CLIENT_VIEWER)
  async listCustomerUpdates(
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string
  ) {
    return this.comments.listCustomerUpdates(entityType, entityId)
  }

  @Post("work-note")
  @Roles(...ALL_INTERNAL)
  async createWorkNote(@Req() req: any, @Body() dto: CreateCommentDto) {
    const user = getJwtUser(req)
    return this.comments.createWorkNote(user.userId, dto)
  }

  @Post("customer-update")
  @Roles(...ALL_INTERNAL)
  async createCustomerUpdate(@Req() req: any, @Body() dto: CreateCustomerUpdateDto) {
    const user = getJwtUser(req)
    return this.comments.createCustomerUpdate(user.userId, dto)
  }
}