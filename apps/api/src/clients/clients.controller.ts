import { Body, Controller, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PlatformModule, Role } from "@prisma/client";
import { ClientsService } from "./clients.service";
import { Roles } from "../auth/roles.decorator";
import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CreateClientDto, SetClientModulesDto, UpdateClientDto } from "./dto";
import { getJwtUser } from "../auth/request-context";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("clients")
@ApiBearerAuth()
@Controller("clients")
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @Get()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async list(@Req() req: any) {
    const actor = getJwtUser(req);
    return this.clients.list(actor);
  }

  // Own-client lookup for any authenticated user (incl. client-scoped roles).
  // No @Roles → reachable by all authenticated users; returns ONLY the caller's
  // own client (derived from their JWT clientId), never another client.
  // Declared before @Get(":id") so "me" is not matched as an :id param.
  @Get("me")
  async getMine(@Req() req: any) {
    const actor = getJwtUser(req);
    return this.clients.getMine(actor);
  }

  // The caller's full assigned-client set (id + name), for the client-scoped
  // multi-assignment selector. No @Roles → any authenticated user; derived
  // strictly from the caller's own UserClientAssignment rows. Returns [] for a
  // user with zero assignments (not an error). Declared before @Get(":id").
  @Get("mine")
  async listMine(@Req() req: any) {
    const actor = getJwtUser(req);
    return this.clients.listMine(actor);
  }

  @Get(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async get(@Req() req: any, @Param("id") id: string) {
    const actor = getJwtUser(req);
    return this.clients.get(actor, id);
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async create(@Req() req: any, @Body() dto: CreateClientDto) {
    const actor = getJwtUser(req);
    return this.clients.create(actor, dto);
  }

  @Patch(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateClientDto) {
    const actor = getJwtUser(req);
    return this.clients.update(actor, id, dto);
  }

  // A2 — set the client's licensed module set. Org-super only (managing
  // entitlements is a platform-admin action, never gated by the client's own
  // entitlement — so there's always a way to switch a module on).
  @Put(":id/modules")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN)
  async setModules(@Req() req: any, @Param("id") id: string, @Body() dto: SetClientModulesDto) {
    const actor = getJwtUser(req);
    return this.clients.setModules(actor, id, dto.modules as PlatformModule[]);
  }
}
