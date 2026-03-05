import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { getJwtUser } from "../auth/request-context";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateOrganizationSuperUserDto,
  UpdateOrganizationDto,
  UpdateOrganizationSuperUserDto
} from "./dto";
import { OrganizationsService } from "./organizations.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations")
export class OrganizationsController {
  constructor(private organizations: OrganizationsService) {}

  @Get("me")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async getMe(@Req() req: any) {
    const actor = getJwtUser(req);
    return this.organizations.getMyOrganization(actor);
  }

  @Patch("me")
  @Roles(Role.ORG_OWNER, Role.ADMIN)
  async updateMe(@Req() req: any, @Body() dto: UpdateOrganizationDto) {
    const actor = getJwtUser(req);
    return this.organizations.updateMyOrganization(actor, dto);
  }

  @Get("me/super-users")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async listSuperUsers(@Req() req: any) {
    const actor = getJwtUser(req);
    return this.organizations.listSuperUsers(actor);
  }

  @Post("me/super-users")
  @Roles(Role.ORG_OWNER, Role.ADMIN)
  async createSuperUser(@Req() req: any, @Body() dto: CreateOrganizationSuperUserDto) {
    const actor = getJwtUser(req);
    return this.organizations.createSuperUser(actor, dto);
  }

  @Patch("me/super-users/:id")
  @Roles(Role.ORG_OWNER, Role.ADMIN)
  async updateSuperUser(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateOrganizationSuperUserDto) {
    const actor = getJwtUser(req);
    return this.organizations.updateSuperUser(actor, id, dto);
  }
}
