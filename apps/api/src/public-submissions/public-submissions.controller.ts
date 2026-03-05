import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ConvertPublicSubmissionDto, CreatePublicSubmissionDto } from "./dto";
import { PublicSubmissionsService } from "./public-submissions.service";

@ApiTags("public-submissions")
@Controller("public-submissions")
export class PublicSubmissionsController {
  constructor(private submissions: PublicSubmissionsService, private prisma: PrismaService) {}

  @Post("public")
  async createPublic(@Body() dto: CreatePublicSubmissionDto) {
    if (!dto.clientId) throw new BadRequestException("clientId is required");
    return this.submissions.createPublic(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get()
  @Roles(Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async list(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.submissions.listForClient(clientId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post(":id/convert")
  @Roles(Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async convert(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: ConvertPublicSubmissionDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    const actorUserId = user.userId;

    return this.submissions.convertForClient(clientId, id, actorUserId, dto.priority);
  }
}
