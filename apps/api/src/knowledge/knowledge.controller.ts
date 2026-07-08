import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { PlatformModule, Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { ModuleEntitlementGuard } from "../auth/module-entitlement.guard"
import { RequiresModule } from "../auth/module-entitlement.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { KnowledgeService } from "./knowledge.service"
import { CreateKnowledgeDto, ListKnowledgeQueryDto, UpdateKnowledgeDto } from "./dto"

// Knowledge is a Service Desk capability → gated on the scoped client's
// SERVICE_DESK entitlement. Reads: AD staff + CLIENT_VIEWER (self-service).
// Writes: AD authoring roles (no ENGINEER, no CLIENT_VIEWER).
const ALL_INTERNAL = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER
]
const AUTHORS = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST
]

@UseGuards(JwtAuthGuard, RolesGuard, ModuleEntitlementGuard)
@RequiresModule(PlatformModule.SERVICE_DESK)
@ApiTags("knowledge")
@ApiBearerAuth()
@Controller("knowledge")
export class KnowledgeController {
  constructor(private knowledge: KnowledgeService, private prisma: PrismaService) {}

  @Get()
  @Roles(...ALL_INTERNAL, Role.CLIENT_VIEWER)
  async list(@Req() req: any, @Query() query: ListKnowledgeQueryDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.knowledge.listForClient(clientId, user, query)
  }

  @Get(":id")
  @Roles(...ALL_INTERNAL, Role.CLIENT_VIEWER)
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.knowledge.getForClient(clientId, id, user)
  }

  @Post()
  @Roles(...AUTHORS)
  async create(@Req() req: any, @Body() dto: CreateKnowledgeDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.knowledge.createForClient(clientId, user.userId, dto)
  }

  @Put(":id")
  @Roles(...AUTHORS)
  async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateKnowledgeDto, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.knowledge.updateForClient(clientId, id, user.userId, dto, user)
  }
}
