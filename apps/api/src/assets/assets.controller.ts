import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Req, Res } from "@nestjs/common"
import type { Response } from "express"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AssetsService } from "./assets.service";
import { CreateAssetDto, DecommissionAssetDto, RejectAssetDeletionDto, RequestAssetDeletionDto, UpdateAssetDto } from "./dto";
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

  // Approver queue: pending deletion requests in the current client scope.
  // IMPORTANT: this static route must precede "@Get(:id)" or ":id" captures
  // "deletion-requests" (NestJS matches top-down).
  @Get("deletion-requests")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async listPendingDeletions(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.listPendingDeletions(clientId);
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

  // Direct delete is now restricted to the approver set (ORG-super + SERVICE_MANAGER).
  // ENGINEER / SERVICE_DESK_ANALYST route through the request-and-approve flow below.
  @Delete(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async remove(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.removeForClient(id, clientId, user.role, user.userId);
  }

  // Decommission workflow steps (DCIM_SCHEMA_SPEC §4.2): retire / physically
  // remove / dispose — audited lifecycle transitions, NOT deletion (the asset
  // and its history survive). Operational roles, same as asset updates.
  @Post(":id/decommission")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async decommission(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: DecommissionAssetDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.decommission(id, dto.step, clientId, user.role, user.userId);
  }

  // ENGINEER / SERVICE_DESK_ANALYST raise a deletion request instead of deleting directly.
  @Post(":id/deletion-request")
  @Roles(Role.ENGINEER, Role.SERVICE_DESK_ANALYST)
  async requestDeletion(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: RequestAssetDeletionDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.requestDeletion(id, clientId, user.role, user.userId, dto?.reason);
  }

  // Approvers (ORG-super + SERVICE_MANAGER) action a pending request.
  @Post(":id/deletion-request/approve")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async approveDeletion(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.approveDeletion(id, clientId, user.role, user.userId);
  }

  @Post(":id/deletion-request/reject")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async rejectDeletion(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: RejectAssetDeletionDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.assets.rejectDeletion(id, clientId, user.role, user.userId, dto?.notes);
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