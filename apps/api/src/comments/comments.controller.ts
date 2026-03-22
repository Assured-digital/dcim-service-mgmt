import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser } from "../auth/request-context"
import { CommentsService } from "./comments.service"

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("comments")
@ApiBearerAuth()
@Controller("comments")
export class CommentsController {
  constructor(private comments: CommentsService) {}

  @Get(":entityType/:entityId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async list(@Param("entityType") entityType: string, @Param("entityId") entityId: string) {
    return this.comments.listForEntity(entityType, entityId)
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async create(@Req() req: any, @Body() dto: any) {
    const user = getJwtUser(req)
    return this.comments.create(user.userId, dto)
  }
}