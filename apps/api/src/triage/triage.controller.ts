import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ConvertTriageItemDto, TriageSourceType } from "./dto";
import { TriageService } from "./triage.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("triage")
@ApiBearerAuth()
@Controller("triage")
export class TriageController {
  constructor(
    private triage: TriageService,
    private prisma: PrismaService
  ) {}

  @Get("queue")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async queue(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.triage.listQueue(clientId);
  }

  @Post(":sourceType/:id/convert")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async convert(
    @Req() req: any,
    @Param("sourceType") sourceType: TriageSourceType,
    @Param("id") id: string,
    @Body() dto: ConvertTriageItemDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.triage.convert(clientId, sourceType, id, user.userId, dto);
  }
}

