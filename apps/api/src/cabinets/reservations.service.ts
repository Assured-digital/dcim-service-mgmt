import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { activeReservationWhere, findUSlotConflicts, uSlotOutOfBounds } from "./u-slot.util"
import { CreateReservationDto, UpdateReservationDto } from "./dto"

// Advisory U-range reservations (DCIM_DESIGN_SPEC.md §2). Scoped through the
// cabinet → site → client chain like CabinetsService; the denormalised
// CabinetReservation.clientId always equals cabinet.site.clientId.
// Reservation-vs-asset and reservation-vs-reservation overlap are both hard 400s
// here (a reservation over occupied space is meaningless); the ADVISORY half —
// placing an asset INTO a reservation → 409 + override — lives in AssetsService.
@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  private async getScopedCabinet(clientId: string, siteId: string, cabinetId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id: cabinetId, siteId, site: { clientId } },
      select: { id: true, totalU: true, startingUnit: true }
    })
    if (!cabinet) throw new NotFoundException("Cabinet not found")
    return cabinet
  }

  private async assertRangeFree(
    cabinet: { id: string; totalU: number | null; startingUnit: number },
    placement: { uStart: number; uHeight: number; rackSide: string | null },
    excludeReservationId?: string
  ) {
    const asPlacement = {
      uPosition: placement.uStart,
      uHeight: placement.uHeight,
      rackSide: placement.rackSide,
      // A reservation holds its whole face range regardless of depth.
      isFullDepth: true
    }

    const bounds = uSlotOutOfBounds(asPlacement, cabinet)
    if (bounds) throw new BadRequestException(bounds)

    const assets = await this.prisma.asset.findMany({
      where: { cabinetId: cabinet.id, uPosition: { not: null }, isZeroU: false },
      select: { id: true, name: true, uPosition: true, uHeight: true, rackSide: true, isFullDepth: true }
    })
    const assetConflicts = findUSlotConflicts(
      asPlacement,
      assets.map((a) => ({ ...a, uPosition: a.uPosition as number, label: a.name }))
    )
    if (assetConflicts.length > 0) {
      throw new BadRequestException(`Range overlaps ${assetConflicts[0].label} — reservations cover free space only.`)
    }

    const reservations = await this.prisma.cabinetReservation.findMany({
      where: {
        cabinetId: cabinet.id,
        ...activeReservationWhere(),
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {})
      },
      select: { id: true, name: true, uStart: true, uHeight: true, rackSide: true }
    })
    const reservationConflicts = findUSlotConflicts(
      asPlacement,
      reservations.map((r) => ({
        id: r.id, label: r.name, uPosition: r.uStart, uHeight: r.uHeight,
        rackSide: r.rackSide, isFullDepth: true
      }))
    )
    if (reservationConflicts.length > 0) {
      throw new BadRequestException(`Range overlaps the existing reservation "${reservationConflicts[0].label}".`)
    }
  }

  // expiresAt: undefined → default now + 1 month (dcTrack); null → open-ended.
  private resolveExpiry(expiresAt: string | null | undefined): Date | null {
    if (expiresAt === null) return null
    if (expiresAt === undefined) {
      const d = new Date()
      d.setMonth(d.getMonth() + 1)
      return d
    }
    const parsed = new Date(expiresAt)
    if (isNaN(parsed.getTime())) throw new BadRequestException("Invalid expiry date.")
    return parsed
  }

  async create(clientId: string, siteId: string, cabinetId: string, actorUserId: string, dto: CreateReservationDto) {
    const cabinet = await this.getScopedCabinet(clientId, siteId, cabinetId)
    const uHeight = dto.uHeight ?? 1
    const rackSide = dto.rackSide ?? null
    await this.assertRangeFree(cabinet, { uStart: dto.uStart, uHeight, rackSide })

    const reservation = await this.prisma.cabinetReservation.create({
      data: {
        cabinetId,
        clientId,
        uStart: dto.uStart,
        uHeight,
        rackSide,
        name: dto.name,
        notes: dto.notes ?? null,
        expiresAt: this.resolveExpiry(dto.expiresAt),
        createdById: actorUserId
      }
    })

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Cabinet",
        entityId: cabinetId,
        action: "RESERVATION_CREATED",
        actorUserId,
        clientId,
        data: { reservationId: reservation.id, name: reservation.name, uStart: reservation.uStart, uHeight: reservation.uHeight }
      }
    })

    return reservation
  }

  async update(clientId: string, siteId: string, cabinetId: string, reservationId: string, actorUserId: string, dto: UpdateReservationDto) {
    const cabinet = await this.getScopedCabinet(clientId, siteId, cabinetId)
    const existing = await this.prisma.cabinetReservation.findFirst({
      where: { id: reservationId, cabinetId, clientId }
    })
    if (!existing) throw new NotFoundException("Reservation not found")

    const uStart = dto.uStart ?? existing.uStart
    const uHeight = dto.uHeight ?? existing.uHeight
    const rackSide = dto.rackSide !== undefined ? dto.rackSide : existing.rackSide
    const geometryChanged =
      uStart !== existing.uStart || uHeight !== existing.uHeight || rackSide !== existing.rackSide
    if (geometryChanged) {
      await this.assertRangeFree(cabinet, { uStart, uHeight, rackSide }, existing.id)
    }

    const updated = await this.prisma.cabinetReservation.update({
      where: { id: existing.id },
      data: {
        uStart,
        uHeight,
        rackSide,
        name: dto.name ?? existing.name,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
        expiresAt: dto.expiresAt !== undefined ? this.resolveExpiry(dto.expiresAt) : existing.expiresAt
      }
    })

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Cabinet",
        entityId: cabinetId,
        action: "RESERVATION_UPDATED",
        actorUserId,
        clientId,
        data: { reservationId: updated.id, name: updated.name, uStart: updated.uStart, uHeight: updated.uHeight }
      }
    })

    return updated
  }

  async remove(clientId: string, siteId: string, cabinetId: string, reservationId: string, actorUserId: string) {
    await this.getScopedCabinet(clientId, siteId, cabinetId)
    const existing = await this.prisma.cabinetReservation.findFirst({
      where: { id: reservationId, cabinetId, clientId }
    })
    if (!existing) throw new NotFoundException("Reservation not found")

    await this.prisma.cabinetReservation.delete({ where: { id: existing.id } })

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Cabinet",
        entityId: cabinetId,
        action: "RESERVATION_DELETED",
        actorUserId,
        clientId,
        data: { reservationId: existing.id, name: existing.name }
      }
    })

    return { ok: true }
  }
}
