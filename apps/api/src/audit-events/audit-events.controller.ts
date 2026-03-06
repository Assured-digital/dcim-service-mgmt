import { Controller, Get, Headers, Param, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AuditEventsService } from "./audit-events.service";
import { EntityHistoryQueryDto, ListAuditEventsQueryDto } from "./dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("audit-events")
@ApiBearerAuth()
@Controller("audit-events")
export class AuditEventsController {
  constructor(
    private readonly auditEvents: AuditEventsService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  @Roles(
    Role.ORG_OWNER,
    Role.ORG_ADMIN,
    Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async list(
    @Req() req: any,
    @Query() query: ListAuditEventsQueryDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.auditEvents.listForClient(clientId, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      actorUserId: query.actorUserId,
      action: query.action,
      entityType: query.entityType,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      query: query.query
    });
  }

  @Get("actors")
  @Roles(
    Role.ORG_OWNER,
    Role.ORG_ADMIN,
    Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async actors(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.auditEvents.listActorsForClient(clientId);
  }

  @Get("entity/:entityType/:entityId")
  @Roles(
    Role.ORG_OWNER,
    Role.ORG_ADMIN,
    Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async entityHistory(
    @Req() req: any,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Query() query: EntityHistoryQueryDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.auditEvents.listEntityHistory(clientId, entityType, entityId, query.limit ?? 50);
  }
}

