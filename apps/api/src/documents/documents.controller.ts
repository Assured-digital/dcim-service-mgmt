import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { DocumentsService } from "./documents.service";
import { CreateDocumentReferenceDto } from "./dto";
import { Roles } from "../auth/roles.decorator";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { PrismaService } from "../prisma/prisma.service";

// Reading a record's linked documents is open to viewers; browsing the raw
// SharePoint library and linking/unlinking is AD-staff only (clients never reach
// the library through the portal — that's the site-per-client model).
const READ_ROLES: Role[] = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER
];
const STAFF_ROLES: Role[] = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER
];

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("documents")
@ApiBearerAuth()
@Controller("documents")
export class DocumentsController {
  constructor(private docs: DocumentsService, private prisma: PrismaService) {}

  @Get()
  @Roles(...READ_ROLES)
  async list(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("linkedEntityType") linkedEntityType?: string,
    @Query("linkedEntityId") linkedEntityId?: string
  ) {
    const clientId = await this.scope(req, requestedClientId);
    return this.docs.listForClient(clientId, { linkedEntityType, linkedEntityId });
  }

  @Get("browse")
  @Roles(...STAFF_ROLES)
  async browse(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("subPath") subPath?: string
  ) {
    const clientId = await this.scope(req, requestedClientId);
    return this.docs.browse(clientId, subPath);
  }

  @Get("search")
  @Roles(...STAFF_ROLES)
  async search(
    @Req() req: any,
    @Headers("x-client-id") requestedClientId?: string,
    @Query("q") q?: string
  ) {
    const clientId = await this.scope(req, requestedClientId);
    return this.docs.search(clientId, q ?? "");
  }

  @Post()
  @Roles(...STAFF_ROLES)
  async create(
    @Req() req: any,
    @Body() dto: CreateDocumentReferenceDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const clientId = await this.scope(req, requestedClientId);
    return this.docs.createForClient(clientId, dto);
  }

  @Delete(":id")
  @Roles(...STAFF_ROLES)
  async remove(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const clientId = await this.scope(req, requestedClientId);
    return this.docs.remove(clientId, id);
  }

  private scope(req: any, requestedClientId?: string) {
    return resolveClientScope(getJwtUser(req), requestedClientId, this.prisma);
  }
}
