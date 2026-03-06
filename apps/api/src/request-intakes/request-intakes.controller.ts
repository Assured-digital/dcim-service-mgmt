import { Body, Controller, Get, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRequestIntakeDto } from "./dto";
import { RequestIntakesService } from "./request-intakes.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("request-intakes")
@ApiBearerAuth()
@Controller("request-intakes")
export class RequestIntakesController {
  constructor(
    private service: RequestIntakesService,
    private prisma: PrismaService
  ) {}

  @Get("mine")
  @Roles(
    Role.ORG_OWNER,
    Role.ORG_ADMIN,
    Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async listMine(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.service.listMine(clientId, user.userId);
  }

  @Post()
  @Roles(
    Role.ORG_OWNER,
    Role.ORG_ADMIN,
    Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async create(
    @Req() req: any,
    @Body() dto: CreateRequestIntakeDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.service.createForClient(clientId, { userId: user.userId, email: user.email }, dto);
  }
}

