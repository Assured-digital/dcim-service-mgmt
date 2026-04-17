import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Req, Res } from "@nestjs/common"
import type { Response } from "express"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AssetsService } from "./assets.service";
import { CreateAssetDto, UpdateAssetDto } from "./dto";
import { Roles } from "../auth/roles.decorator";
import { Role } from "@prisma/client";
import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("assets")
@ApiBearerAuth()
@Controller("assets")
export class AssetsController {
  constructor(private assets: AssetsService, private prisma: PrismaService) {}

  @Get()
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async list(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.listForClient(clientId, user.role);
  }

  // IMPORTANT: this must be BEFORE "site/:siteId" — NestJS matches top-down
  @Get(":id")
  @Roles(
    Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
    Role.SERVICE_MANAGER,
    Role.SERVICE_DESK_ANALYST,
    Role.ENGINEER,
    Role.CLIENT_VIEWER
  )
  async getById(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.getByIdForClient(id, clientId, user.role);
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async create(
    @Req() req: any,
    @Body() dto: CreateAssetDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.create(dto, clientId, user.role, user.userId);
  }

  @Delete(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async remove(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.removeForClient(id, clientId, user.role, user.userId);
  }

  @Put(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateAssetDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.updateForClient(id, dto, clientId, user.role, user.userId);
  }

  @Get("site/:siteId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async listForSite(
    @Req() req: any,
    @Param("siteId") siteId: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.assets.getForSite(clientId, siteId)
  }

  @Get("site/:siteId/export")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async exportCsv(
    @Req() req: any,
    @Param("siteId") siteId: string,
    @Res() res: Response,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    const csv = await this.assets.exportToCsv(clientId, siteId)
    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", `attachment; filename="assets-${siteId}.csv"`)
    res.send(csv)
  }

  @Post("site/:siteId/import")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async importCsv(
    @Req() req: any,
    @Param("siteId") siteId: string,
    @Body() body: { rows: any[] },
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.assets.importFromCsv(clientId, siteId, body.rows, user.userId)
  }

}