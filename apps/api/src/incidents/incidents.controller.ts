import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
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
import { CreateIncidentDto, UpdateIncidentDto, UpdateIncidentStatusDto } from "./dto";
import { IncidentsService } from "./incidents.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("incidents")
@ApiBearerAuth()
@Controller("incidents")
export class IncidentsController {
  constructor(private incidents: IncidentsService, private prisma: PrismaService) {}

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
    return this.incidents.listForClient(clientId, user, query);
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
    const rows = await this.incidents.exportCsvForClient(clientId, user, query);
    const csv = toCsv(
      ["reference", "title", "status", "severity", "priority", "assignee", "createdAt", "updatedAt"],
      rows
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"incidents-report.csv\"");
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
    return this.incidents.getForClient(clientId, id, user);
  }

  @Post()
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER
  )
  async create(
    @Req() req: any,
    @Body() dto: CreateIncidentDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.incidents.createForClient(clientId, user.userId, dto);
  }

  @Put(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateIncidentDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.incidents.updateForClient(clientId, id, user.userId, dto, user);
  }

  @Post(":id/status")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async updateStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateIncidentStatusDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.incidents.updateStatusForClient(clientId, id, dto.status, user.userId, user, dto.comment);
  }
}
