import { Body, Controller, Get, Headers, Param, Patch, Put, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { NotificationsService } from "./notifications.service"
import { UpdateNotificationPreferencesDto } from "./dto"

// Any authenticated app user can have notifications addressed to them (mentions
// today target AD-staff, but the read API is the recipient's own inbox regardless
// of role) — so the full internal + client-viewer set may read/mark their own.
const ALL_AUTHED = [
  Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN,
  Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER,
  Role.CLIENT_VIEWER
]

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private notifications: NotificationsService, private prisma: PrismaService) {}

  @Get()
  @Roles(...ALL_AUTHED)
  async list(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.notifications.listForUser(clientId, user.userId)
  }

  @Get("unread-count")
  @Roles(...ALL_AUTHED)
  async unreadCount(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.notifications.unreadCount(clientId, user.userId)
  }

  @Patch("read-all")
  @Roles(...ALL_AUTHED)
  async markAllRead(@Req() req: any, @Headers("x-client-id") requestedClientId?: string) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.notifications.markAllRead(clientId, user.userId)
  }

  @Patch(":id/read")
  @Roles(...ALL_AUTHED)
  async markRead(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.notifications.markRead(clientId, user.userId, id)
  }

  // Per-user notification preferences (not client-scoped — a person's settings
  // are global, not per-tenant).
  @Get("preferences")
  @Roles(...ALL_AUTHED)
  async getPreferences(@Req() req: any) {
    return this.notifications.getPreferences(getJwtUser(req).userId)
  }

  @Put("preferences")
  @Roles(...ALL_AUTHED)
  async updatePreferences(@Req() req: any, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notifications.updatePreferences(getJwtUser(req).userId, dto.preferences)
  }
}
