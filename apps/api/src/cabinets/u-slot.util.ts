// U-slot collision semantics (DCIM_DESIGN_SPEC.md §2.2). Pure functions — the
// callers (AssetsService, ReservationsService) fetch occupants inside their write
// transaction and throw on the conflicts returned here.
//
// A placement occupies U interval [uPosition, uPosition + ceil(uHeight) - 1] on a
// face. Two placements conflict iff the intervals intersect AND NOT (both are
// half-depth on opposite faces). isFullDepth null/undefined = full depth
// (conservative — matches the DeviceType default). Half-U kit occupies a full slot
// for now (Asset.uHeight is Int; a true half-slot model is deferred).

export type UPlacement = {
  uPosition: number
  uHeight?: number | null
  rackSide?: string | null // "FRONT" | "REAR" | null; null = both faces (reservations)
  isFullDepth?: boolean | null
}

export type UOccupant = UPlacement & { id: string; label: string }

const span = (p: UPlacement): [number, number] => {
  const h = Math.max(1, Math.ceil(p.uHeight ?? 1))
  return [p.uPosition, p.uPosition + h - 1]
}

const intervalsIntersect = (a: [number, number], b: [number, number]) =>
  a[0] <= b[1] && b[0] <= a[1]

// Faces clash unless BOTH are half-depth on explicitly opposite faces. A null
// rackSide (reservation spanning both faces) clashes with everything.
function facesClash(a: UPlacement, b: UPlacement): boolean {
  const aFull = a.isFullDepth !== false
  const bFull = b.isFullDepth !== false
  if (aFull || bFull) return true
  if (!a.rackSide || !b.rackSide) return true
  return a.rackSide === b.rackSide
}

export function findUSlotConflicts(placement: UPlacement, occupants: UOccupant[]): UOccupant[] {
  const target = span(placement)
  return occupants.filter(
    (o) => intervalsIntersect(target, span(o)) && facesClash(placement, o)
  )
}

// Bounds check against the cabinet frame. totalU null = unbounded (legacy cabinets
// without a stated height) — only the lower bound applies.
export function uSlotOutOfBounds(
  placement: UPlacement,
  cabinet: { totalU: number | null; startingUnit: number }
): string | null {
  const [lo, hi] = span(placement)
  const start = cabinet.startingUnit ?? 1
  if (lo < start) return `U${lo} is below the cabinet's lowest unit (U${start}).`
  if (cabinet.totalU != null && hi > start + cabinet.totalU - 1) {
    return `U${hi} exceeds the cabinet's top unit (U${start + cabinet.totalU - 1}).`
  }
  return null
}

// Active-reservation read filter (expiry by exclusion — no cron; spec §1).
export function activeReservationWhere(now: Date = new Date()) {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
}
