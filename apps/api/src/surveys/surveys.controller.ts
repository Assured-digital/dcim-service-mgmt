import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SurveysService } from "./surveys.service";
import { CreateSurveyDto } from "./dto";
import { Roles } from "../auth/roles.decorator";
import { Role } from "@prisma/client";
import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("surveys")
@ApiBearerAuth()
@Controller("surveys")
export class SurveysController {
  constructor(private surveys: SurveysService) {}

  @Get()
  async list(@Req() req: any) {
    const clientId = req.user.clientId;
    return this.surveys.listForClient(clientId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async create(@Req() req: any, @Body() dto: CreateSurveyDto) {
    const clientId = req.user.clientId;
    return this.surveys.createForClient(clientId, dto);
  }

  @Post(":id/complete")
  @Roles(Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async complete(@Req() req: any, @Param("id") id: string) {
    const clientId = req.user.clientId;
    return this.surveys.completeSurvey(clientId, id);
  }
}
