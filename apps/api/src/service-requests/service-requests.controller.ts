import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ServiceRequestsService } from "./service-requests.service";
import { CreateServiceRequestDto, CloseServiceRequestDto } from "./dto";
import { Roles } from "../auth/roles.decorator";
import { Role } from "@prisma/client";
import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("service-requests")
@ApiBearerAuth()
@Controller("service-requests")
export class ServiceRequestsController {
  constructor(private srs: ServiceRequestsService) {}

  @Get()
  async list(@Req() req: any) {
    const clientId = req.user.clientId;
    return this.srs.listForClient(clientId);
  }

  @Get(":id")
  async get(@Req() req: any, @Param("id") id: string) {
    const clientId = req.user.clientId;
    return this.srs.getForClient(clientId, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async create(@Req() req: any, @Body() dto: CreateServiceRequestDto) {
    const clientId = req.user.clientId;
    const userId = req.user.userId ?? null;
    return this.srs.createForClient(clientId, userId, dto);
  }

  @Post(":id/close")
  @Roles(Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async close(@Req() req: any, @Param("id") id: string, @Body() dto: CloseServiceRequestDto) {
    const clientId = req.user.clientId;
    const userId = req.user.userId;
    return this.srs.closeForClient(clientId, id, userId, dto.closureSummary);
  }
}
