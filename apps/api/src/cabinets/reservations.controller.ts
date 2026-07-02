import { Body, Controller, Delete, Headers, Param, Patch, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Role } from "@prisma/client"
import { JwtAuthGuard } from "../auth/jwt.guard"
import { RolesGuard } from "../auth/roles.guard"
import { Roles } from "../auth/roles.decorator"
import { getJwtUser, resolveClientScope } from "../auth/request-context"
import { PrismaService } from "../prisma/prisma.service"
import { ReservationsService } from "./reservations.service"
import { CreateReservationDto, UpdateReservationDto } from "./dto"

// Reads come through GET /sites/:siteId/cabinets (reservations are included on
// each cabinet) — this controller is the write surface only.
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("cabinets")
@ApiBearerAuth()
@Controller("sites/:siteId/cabinets/:cabinetId/reservations")
export class ReservationsController {
  constructor(private reservations: ReservationsService, private prisma: PrismaService) {}

  @Post()
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async create(
    @Req() req: any,
    @Param("siteId") siteId: string,
    @Param("cabinetId") cabinetId: string,
    @Body() dto: CreateReservationDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.reservations.create(clientId, siteId, cabinetId, user.userId, dto)
  }

  @Patch(":reservationId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async update(
    @Req() req: any,
    @Param("siteId") siteId: string,
    @Param("cabinetId") cabinetId: string,
    @Param("reservationId") reservationId: string,
    @Body() dto: UpdateReservationDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.reservations.update(clientId, siteId, cabinetId, reservationId, user.userId, dto)
  }

  @Delete(":reservationId")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER)
  async remove(
    @Req() req: any,
    @Param("siteId") siteId: string,
    @Param("cabinetId") cabinetId: string,
    @Param("reservationId") reservationId: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req)
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma)
    return this.reservations.remove(clientId, siteId, cabinetId, reservationId, user.userId)
  }
}
