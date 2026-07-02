import React from "react"
import {
  Asset, Cabinet, CabinetReservation, ElevationSide,
  normalizeRackSide, reservationExpired
} from "../../lib/infrastructure"

// Per-face render model for the cabinet elevation (DCIM spec §2.1). Mirrors the
// server's occupancy semantics (u-slot.util.ts): a placed asset occupies
// [uPosition, uPosition + ceil(uHeight) - 1]; full-depth (isFullDepth !== false)
// assets appear SOLID on their own face and as a GHOST on the opposite face;
// reservations render on their stated face (null = both). The server has already
// validated that reservations never overlap assets, so entries never collide.

export type ElevationEntry =
  | { kind: "asset"; asset: Asset; u: number; h: number; ghost: boolean }
  | { kind: "reservation"; reservation: CabinetReservation; u: number; h: number; expired: boolean }
  | { kind: "empty"; u: number }

export type ElevationModel = {
  startingUnit: number
  totalU: number
  // Entries top → bottom (highest U first), matching the render order.
  faces: Record<ElevationSide, ElevationEntry[]>
  zeroUAssets: Asset[]
  unplacedAssets: Asset[]
  activeReservations: CabinetReservation[]
}

const spanH = (uHeight: number | null | undefined) => Math.max(1, Math.ceil(uHeight ?? 1))

function buildFace(cabinet: Cabinet, face: ElevationSide, startingUnit: number, totalU: number): ElevationEntry[] {
  const topU = startingUnit + totalU - 1
  const startAt = new Map<number, ElevationEntry>()
  const covered = new Set<number>()

  const claim = (entry: ElevationEntry & { u: number; h: number }) => {
    startAt.set(entry.u + entry.h - 1, entry) // key by TOP unit — render walks top → bottom
    for (let u = entry.u; u < entry.u + entry.h; u++) covered.add(u)
  }

  for (const a of cabinet.assets) {
    if (a.uPosition == null || a.isZeroU) continue
    const own = normalizeRackSide(a.rackSide) === face
    const fullDepth = a.isFullDepth !== false
    if (own) claim({ kind: "asset", asset: a, u: a.uPosition, h: spanH(a.uHeight), ghost: false })
    else if (fullDepth) claim({ kind: "asset", asset: a, u: a.uPosition, h: spanH(a.uHeight), ghost: true })
  }

  for (const r of cabinet.reservations ?? []) {
    if (reservationExpired(r)) continue // expired reservations free their space (spec §1)
    if (r.rackSide != null && r.rackSide !== face) continue
    // Skip anything that would collide with an already-claimed unit (defensive —
    // the server blocks this; stale client data could briefly disagree).
    let clear = true
    for (let u = r.uStart; u < r.uStart + r.uHeight; u++) if (covered.has(u)) { clear = false; break }
    if (clear) claim({ kind: "reservation", reservation: r, u: r.uStart, h: r.uHeight, expired: false })
  }

  const entries: ElevationEntry[] = []
  for (let u = topU; u >= startingUnit; u--) {
    const entry = startAt.get(u)
    if (entry) { entries.push(entry); continue }
    if (!covered.has(u)) entries.push({ kind: "empty", u })
  }
  return entries
}

// ─── Move-mode target classification (A3) ──────────────────────────────────
// Client-side mirror of the server's assertUSlotAvailable (spec §2.2): paints
// valid/reserved/invalid targets instantly; the server remains the enforcer.

export type TargetState = "valid" | "reserved" | "invalid"

export type MoveTargets = Record<ElevationSide, Map<number, { state: TargetState; reservation?: CabinetReservation }>>

const intersects = (aLo: number, aHi: number, bLo: number, bHi: number) => aLo <= bHi && bLo <= aHi

// Classify every bottom-U placement for `moving` in this cabinet: does
// [u, u + h - 1] on `face` fit the frame, clear other assets, and clear
// active reservations? Reservation-only conflicts are "reserved" (advisory —
// placeable with override); asset conflicts or out-of-bounds are "invalid".
export function computeMoveTargets(cabinet: Cabinet, moving: Asset): MoveTargets {
  const startingUnit = cabinet.startingUnit ?? 1
  const totalU = cabinet.totalU ?? 42
  const topU = startingUnit + totalU - 1
  const h = spanH(moving.uHeight)
  const movingFullDepth = moving.isFullDepth !== false
  const activeRes = (cabinet.reservations ?? []).filter(r => !reservationExpired(r))
  const occupants = cabinet.assets.filter(a => a.id !== moving.id && a.uPosition != null && !a.isZeroU)

  const result: MoveTargets = { FRONT: new Map(), REAR: new Map() }
  for (const face of ["FRONT", "REAR"] as ElevationSide[]) {
    for (let u = startingUnit; u <= topU; u++) {
      const hi = u + h - 1
      if (hi > topU) { result[face].set(u, { state: "invalid" }); continue }

      const assetClash = occupants.some(o => {
        const oh = spanH(o.uHeight)
        if (!intersects(u, hi, o.uPosition as number, (o.uPosition as number) + oh - 1)) return false
        const oFull = o.isFullDepth !== false
        // Opposite-face half-depth pairs may share a U (spec §2.2).
        if (!movingFullDepth && !oFull && normalizeRackSide(o.rackSide) !== face) return false
        return true
      })
      if (assetClash) { result[face].set(u, { state: "invalid" }); continue }

      const blockingRes = activeRes.find(r =>
        intersects(u, hi, r.uStart, r.uStart + r.uHeight - 1) &&
        (r.rackSide == null || r.rackSide === face)
      )
      result[face].set(u, blockingRes ? { state: "reserved", reservation: blockingRes } : { state: "valid" })
    }
  }
  return result
}

export function useElevationModel(cabinet: Cabinet): ElevationModel {
  return React.useMemo(() => {
    const startingUnit = cabinet.startingUnit ?? 1
    const totalU = cabinet.totalU ?? 42
    return {
      startingUnit,
      totalU,
      faces: {
        FRONT: buildFace(cabinet, "FRONT", startingUnit, totalU),
        REAR: buildFace(cabinet, "REAR", startingUnit, totalU),
      },
      zeroUAssets: cabinet.assets.filter(a => a.isZeroU),
      unplacedAssets: cabinet.assets.filter(a => a.uPosition == null && !a.isZeroU),
      activeReservations: (cabinet.reservations ?? []).filter(r => !reservationExpired(r)),
    }
  }, [cabinet])
}
