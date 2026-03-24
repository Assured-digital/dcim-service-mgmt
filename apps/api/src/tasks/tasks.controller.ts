import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { ListOperationalQueryDto } from "../common/dto/list-operational.dto";
import { toCsv } from "../common/reporting/csv";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateTaskStatusDto } from "./dto";
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
  async list(
    @Req() req: any,
    @Query() query: ListOperationalQueryDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.tasks.listForClient(clientId, query);
  }

  @Get("export")
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async export(
    @Req() req: any,
    @Query() query: ListOperationalQueryDto,
    @Res({ passthrough: true }) res: Response,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    const rows = await this.tasks.exportCsvForClient(clientId, query);
    const csv = toCsv(
      ["title", "status", "priority", "assignee", "incidentReference", "dueAt", "createdAt", "updatedAt"],
      rows
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"tasks-report.csv\"");
    return csv;
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

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async create(
    @Req() req: any,
    @Body() dto: { title: string; description?: string; priority?: string; dueAt?: string; assigneeId?: string },
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.tasks.createForClient(clientId, user.userId, dto);
  }

  @Put(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: { title?: string; description?: string; priority?: string; dueAt?: string; assigneeId?: string },
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.tasks.updateForClient(clientId, id, dto)
  }
}
