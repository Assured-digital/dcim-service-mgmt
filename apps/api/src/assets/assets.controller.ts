import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AssetsService } from "./assets.service";
import { CreateAssetDto } from "./dto";
import { Roles } from "../auth/roles.decorator";
import { Role } from "@prisma/client";
import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("assets")
@ApiBearerAuth()
@Controller("assets")
export class AssetsController {
  constructor(private assets: AssetsService) {}

  @Get()
  async list(@Req() req: any) {
    const clientId = req.user.clientId;
    return this.assets.listForClient(clientId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async create(@Req() req: any, @Body() dto: CreateAssetDto) {
    const clientId = req.user.clientId;
    return this.assets.create(dto, clientId);
  }
}
