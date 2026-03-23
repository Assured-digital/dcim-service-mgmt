import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ServiceRequestsService } from "./service-requests.service";
import { CreateServiceRequestDto, CloseServiceRequestDto } from "./dto";
import { Roles } from "../auth/roles.decorator";
import { Role } from "@prisma/client";
import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { ListOperationalQueryDto } from "../common/dto/list-operational.dto";
import { toCsv } from "../common/reporting/csv";
import { Response } from "express";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("service-requests")
@ApiBearerAuth()
@Controller("service-requests")
export class ServiceRequestsController {
  constructor(private srs: ServiceRequestsService, private prisma: PrismaService) {}

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
    return this.srs.listForClient(clientId, query);
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
    const rows = await this.srs.exportCsvForClient(clientId, query);
    const csv = toCsv(
      ["reference", "subject", "status", "priority", "assignee", "createdAt", "updatedAt", "closureSummary"],
      rows
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"service-requests-report.csv\"");
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
    return this.srs.getForClient(clientId, id);
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async create(
    @Req() req: any,
    @Body() dto: CreateServiceRequestDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    const userId = user.userId ?? null;
    return this.srs.createForClient(clientId, userId, dto);
  }

  @Post(":id/close")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async close(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: CloseServiceRequestDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    const userId = user.userId;
    return this.srs.closeForClient(clientId, id, userId, dto.closureSummary);
  }
  @Post(":id/status")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async updateStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: any,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.srs.updateStatusForClient(clientId, id, user.userId, dto);
  }

  @Put(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: any,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.srs.updateForClient(clientId, id, user.userId, dto);
  }
}
