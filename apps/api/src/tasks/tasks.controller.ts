import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTaskDto, UpdateTaskStatusDto } from "./dto";
import { TasksService } from "./tasks.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("tasks")
@ApiBearerAuth()
@Controller("tasks")
export class TasksController {
  constructor(private tasks: TasksService, private prisma: PrismaService) {}

  @Get()
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async list(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.tasks.listForClient(clientId);
  }

  @Get(":id")
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.tasks.getForClient(clientId, id);
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async create(@Req() req: any, @Body() dto: CreateTaskDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.tasks.createForClient(clientId, user.userId, dto);
  }

  @Post(":id/status")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async updateStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateTaskStatusDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.tasks.updateStatusForClient(clientId, id, dto.status, user.userId, dto.comment);
  }
}
