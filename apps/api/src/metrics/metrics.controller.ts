import { Controller, Get, Headers, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { MetricsService } from "./metrics.service";
import { MetricsTrendQueryDto } from "./dto";

// Operational-callable (incl. ENGINEER) — NOT admin-only. Client scope is resolved at the edge via
// resolveClientScope (validates x-client-id against the caller); the service then narrows ENGINEER
// to assigned records via applyAssignedScope, so an engineer never sees org/client-wide aggregates.
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("metrics")
@ApiBearerAuth()
@Controller("metrics")
export class MetricsController {
  constructor(private metrics: MetricsService, private prisma: PrismaService) {}

  @Get("mttr")
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER
  )
  async mttr(
    @Req() req: any,
    @Query() query: MetricsTrendQueryDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.metrics.mttr(clientId, user, query);
  }

  @Get("sla-compliance")
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER
  )
  async slaCompliance(
    @Req() req: any,
    @Query() query: MetricsTrendQueryDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.metrics.slaCompliance(clientId, user, query);
  }
}
