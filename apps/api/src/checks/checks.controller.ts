import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common"
import type { Response } from "express"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { ChecksService } from "./checks.service"
import { ChecksReportService } from "./checks-report.service"
import {
  CreateCheckTemplateDto, CreateCheckTemplateItemDto, CreateCheckDto,
  UpdateCheckItemDto, UpdateCheckDto, CreateFollowOnDto, ReviewCheckDto, SubmitCheckDto, CancelCheckDto,
  FlagItemDto
} from "./dto"
import { Roles } from "../auth/roles.decorator"
import { Role } from "@prisma/client"
import { UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { contentDispositionHeader } from "../attachments/content-policy"
import { PrismaService } from "../prisma/prisma.service"

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("checks")
@ApiBearerAuth()
@Controller("checks")
export class ChecksController {
  constructor(
    private checks: ChecksService,
    private report: ChecksReportService,
    private prisma: PrismaService
  ) {}

  // ── Templates ──────────────────────────────────────────────────────

  @Get("templates")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async listTemplates(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.listTemplates(clientId)
  }

  @Get("templates/:id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async getTemplate(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.getTemplate(clientId, id)
  }

  @Post("templates")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async createTemplate(
    @Req() req: any,
    @Body() dto: CreateCheckTemplateDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.createTemplate(clientId, user.userId, dto)
  }

  @Post("templates/:id/items")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async addTemplateItem(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: CreateCheckTemplateItemDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.addTemplateItem(clientId, id, dto)
  }

  @Put("templates/:id/items/:itemId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async updateTemplateItem(
    @Req() req: any,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: any,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.updateTemplateItem(clientId, id, itemId, dto)
  }

  @Delete("templates/:id/items/:itemId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async deleteTemplateItem(
    @Req() req: any,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.deleteTemplateItem(clientId, id, itemId)
  }

  @Delete("templates/:id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async deactivateTemplate(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.deactivateTemplate(clientId, id)
  }

  // ── Checks ─────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async list(@Req() req: any, @Query() query: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.listForClient(clientId, query)
  }

  @Get(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async get(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.getForClient(clientId, id)
  }

  // Shareable compliance/evidence PDF for a finalised check. Same read-roles + clientId
  // scope as GET :id; the service gates COMPLETED/CLOSED and rejects others (400). Streams
  // the bytes with attachment headers, mirroring the CSV export. Tenant isolation: clientId
  // is resolved here at the edge and the service fetches every embedded image byte through
  // the clientId-scoped download path, so a spoofed x-client-id can never pull another
  // client's check or its images (cross-client id → 404 from the scoped getForClient).
  @Get(":id/report.pdf")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async reportPdf(
    @Req() req: any,
    @Param("id") id: string,
    @Res() res: Response,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    const { filename, buffer } = await this.report.generatePdf(clientId, id)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Content-Length", String(buffer.length))
    res.setHeader("Content-Disposition", contentDispositionHeader("attachment", filename))
    res.send(buffer)
  }

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async create(
    @Req() req: any,
    @Body() dto: CreateCheckDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.createForClient(clientId, user.userId, dto)
  }

  // Pre-start reschedule / reassign (draft briefing page). Manager-tier only (matches create),
  // so the same actors who schedule a check can fix its date/assignee. clientId-scoped at the edge.
  @Patch(":id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateCheckDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.updateForClient(clientId, id, dto, user.userId)
  }

  @Post(":id/start")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async start(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.startCheck(clientId, id, user.userId)
  }

  @Post(":id/items/:itemId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async updateItem(
    @Req() req: any,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateCheckItemDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.updateItem(clientId, id, itemId, dto, user.userId)
  }

  @Post(":id/items")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async addAdHocItem(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: any,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.addAdHocItem(clientId, id, dto, user.userId)
  }

  @Post(":id/submit")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async submit(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: SubmitCheckDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.submitForReview(clientId, id, dto, user.userId)
  }

  @Post(":id/approve")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async approve(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: ReviewCheckDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.approveCheck(clientId, id, dto, user.userId)
  }

  @Post(":id/return")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async returnForRework(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: ReviewCheckDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.returnForRework(clientId, id, dto, user.userId)
  }

  @Post(":id/cancel")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async cancel(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: CancelCheckDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.cancelCheck(clientId, id, dto, user.userId)
  }

  @Get(":id/follow-ons")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async listFollowOns(@Req() req: any, @Param("id") id: string, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.listFollowOns(clientId, id)
  }

  @Post(":id/items/:itemId/follow-ons")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async createFollowOn(
    @Req() req: any,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: CreateFollowOnDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.createFollowOn(clientId, id, itemId, dto, user.userId)
  }

  // Reviewer flag-for-rework (PENDING_REVIEW only). Same reviewer role set as approve/return
  // (no ENGINEER) — the engineer sees the flag + note on the returned check, but doesn't set it.
  @Post(":id/items/:itemId/flag")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async flagItem(
    @Req() req: any,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: FlagItemDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.flagItem(clientId, id, itemId, dto, user.userId)
  }

  @Delete(":id/items/:itemId/flag")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async unflagItem(
    @Req() req: any,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.unflagItem(clientId, id, itemId, user.userId)
  }

  @Put("templates/:id")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER)
  async updateTemplate(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: any,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.checks.updateTemplate(clientId, id, dto)
  }
}