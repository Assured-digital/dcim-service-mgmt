import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { RecordLinksService } from "./record-links.service";
import { CreateRecordLinkDto, SearchRecordLinksQueryDto, SetParentLinkDto } from "./dto";

// Mirrors the operational role split used by the Service Requests controller:
// reads are open to the full operational set; mutations exclude read-only viewers.
const LINK_WRITE_ROLES = [
  Role.ORG_OWNER,
  Role.ORG_ADMIN,
  Role.ADMIN,
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST
] as const;

const LINK_READ_ROLES = [
  ...LINK_WRITE_ROLES,
  Role.ENGINEER,
  Role.CLIENT_VIEWER
] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("record-links")
@ApiBearerAuth()
@Controller("record-links")
export class RecordLinksController {
  constructor(private links: RecordLinksService, private prisma: PrismaService) {}

  @Get("search")
  @Roles(...LINK_READ_ROLES)
  async search(
    @Req() req: any,
    @Query() query: SearchRecordLinksQueryDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.links.search(clientId, query.type, query.q);
  }

  @Post()
  @Roles(...LINK_WRITE_ROLES)
  async create(
    @Req() req: any,
    @Body() dto: CreateRecordLinkDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.links.createLink(clientId, user.userId ?? null, dto);
  }

  @Delete(":id")
  @Roles(...LINK_WRITE_ROLES)
  async remove(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.links.deleteLink(clientId, id);
  }

  // Set a work item's DCIM parent context (link an EXISTING record to an
  // Asset/Cabinet/Site). Both endpoints validated in the resolved client scope.
  @Post("parent")
  @Roles(...LINK_WRITE_ROLES)
  async setParent(
    @Req() req: any,
    @Body() dto: SetParentLinkDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.links.setParent(clientId, dto);
  }

  // Clear a work item's DCIM parent context (unlink from its Asset/Cabinet/Site).
  @Delete("parent/:childType/:childId")
  @Roles(...LINK_WRITE_ROLES)
  async clearParent(
    @Req() req: any,
    @Param("childType") childType: string,
    @Param("childId") childId: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.links.clearParent(clientId, childType, childId);
  }
}
