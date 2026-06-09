import { Body, Controller, Get, Headers, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { getJwtUser } from "../auth/request-context";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateUserDto, UpdateUserDto } from "./dto";
import { UsersService } from "./users.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async list(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const actor = getJwtUser(req);
    return this.users.list(actor, requestedClientId);
  }

  // Operational-callable assignee picker. Deliberately broader than the admin-only
  // GET /users above: AD-staff who assign work need it. Declared before any param
  // route so "assignable" isn't captured as an :id. Returns a minimal projection
  // (id, displayName, email) — never a user-management data surface.
  @Get("assignable")
  @Roles(
    Role.ORG_OWNER,
    Role.ORG_ADMIN,
    Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER
  )
  async listAssignable(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const actor = getJwtUser(req);
    return this.users.listAssignable(actor, requestedClientId);
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async create(@Req() req: any, @Body() dto: CreateUserDto) {
    const actor = getJwtUser(req);
    return this.users.create(actor, dto);
  }

  @Patch(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    const actor = getJwtUser(req);
    return this.users.update(actor, id, dto);
  }
}
