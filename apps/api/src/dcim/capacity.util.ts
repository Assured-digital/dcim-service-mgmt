// Capacity computation (DCIM_DESIGN_SPEC.md §4). Pure functions — the service
// loads rows and calls these; kept side-effect-free so they unit-test directly.
//
// Two truths kept separate (schema spec §4.1): a RETIRED asset is still DRAWN in
// the elevation (until physically removed) but is NOT COUNTED here — capacity
// frees the moment it retires. excludeFromUtilization types (blanking panels)
// occupy slots for collision but never count toward fill %.

// Default power derate: budgeted = nameplate × this% unless a per-type deratePct
// overrides it (spec §4.1). Env-overridable; the pure layer just needs the number.
export const DCIM_DEFAULT_DERATE_PCT = Number(process.env.DCIM_DEFAULT_DERATE_PCT) || 60

// RYG breakpoints — the SAME 65/85 vocabulary the web `barColor` uses, so the
// server's stranded flags and the client's bar colours agree.
export const RAG_AMBER = 65
export const RAG_RED = 85

export type CapacityAsset = {
  uPosition: number | null
  uHeight: number | null
  isZeroU: boolean
  isFullDepth: boolean | null
  lifecycleState: string
  powerDrawW: number | null
  budgetedDrawW: number | null
  weightKg: number | null
  excludeFromUtilization: boolean // resolved from the asset's DeviceType (or false)
}

export type SpaceCapacity = { usedU: number; freeU: number; totalU: number; pct: number; largestContiguousU: number; freeBlocks: { start: number; size: number }[] }
export type MeteredCapacity = { value: number; capacity: number | null; pct: number | null }
export type CabinetCapacity = {
  space: SpaceCapacity
  power: MeteredCapacity      // budgeted kW vs feed kW
  weight: MeteredCapacity     // kg vs max kg
  stranded: "power" | "space" | null
}

// Budgeted watts for ONE asset (spec §4.1). Explicit budget wins; else derive from
// nameplate × derate; else 0. Retired assets are filtered out by the caller.
export function effectiveBudgetW(a: CapacityAsset, deratePct = DCIM_DEFAULT_DERATE_PCT): number {
  if (a.budgetedDrawW != null) return a.budgetedDrawW
  if (a.powerDrawW != null) return a.powerDrawW * (deratePct / 100)
  return 0
}

const spanH = (h: number | null) => Math.max(1, Math.ceil(h ?? 1))
const isCounted = (a: CapacityAsset) =>
  a.lifecycleState !== "RETIRED" && !a.isZeroU && !a.excludeFromUtilization

// Space: a unit is "used" if occupied on EITHER face by a counted asset. Contiguous
// free = the longest run of units free on both faces (where a full-depth device
// fits) — the conservative, useful "largest free block".
export function computeSpace(totalU: number, startingUnit: number, assets: CapacityAsset[]): SpaceCapacity {
  const occupied = new Set<number>()
  for (const a of assets) {
    if (a.uPosition == null || !isCounted(a)) continue
    const h = spanH(a.uHeight)
    for (let u = a.uPosition; u < a.uPosition + h; u++) occupied.add(u)
  }
  const topU = startingUnit + totalU - 1
  const freeBlocks: { start: number; size: number }[] = []
  let runStart = -1
  for (let u = startingUnit; u <= topU; u++) {
    const free = !occupied.has(u)
    if (free && runStart < 0) runStart = u
    if ((!free || u === topU) && runStart >= 0) {
      const end = free ? u : u - 1
      freeBlocks.push({ start: runStart, size: end - runStart + 1 })
      runStart = -1
    }
  }
  const usedU = Math.min(occupied.size, totalU)
  const largestContiguousU = freeBlocks.reduce((m, b) => Math.max(m, b.size), 0)
  return {
    usedU, freeU: totalU - usedU, totalU,
    pct: totalU > 0 ? Math.round((usedU / totalU) * 100) : 0,
    largestContiguousU, freeBlocks,
  }
}

function metered(value: number, capacity: number | null): MeteredCapacity {
  const pct = capacity && capacity > 0 ? Math.round((value / capacity) * 100) : null
  return { value, capacity, pct }
}

// Full per-cabinet capacity. deratePct is the cabinet's assets' resolved default —
// callers pass the per-type derate when computing effective budget upstream, or
// let this apply the global default uniformly (assets carry their own budgeted
// value once placed, so the default only affects legacy/unstamped assets).
export function computeCabinetCapacity(
  cabinet: { totalU: number | null; startingUnit: number | null; powerKw: number | null; maxWeightKg: number | null },
  assets: CapacityAsset[]
): CabinetCapacity {
  const totalU = cabinet.totalU ?? 0
  const startingUnit = cabinet.startingUnit ?? 1
  const counted = assets.filter((a) => a.lifecycleState !== "RETIRED")

  const space = computeSpace(totalU, startingUnit, assets)
  const budgetedKw = counted.reduce((s, a) => s + effectiveBudgetW(a), 0) / 1000
  const weightKg = counted.reduce((s, a) => s + (a.weightKg ?? 0), 0)
  const power = metered(budgetedKw, cabinet.powerKw)
  const weight = metered(weightKg, cabinet.maxWeightKg)

  // Stranded = dimensional imbalance (no telemetry yet): full on one axis, empty
  // on the other. "Power stranded" = space you can't use (no power headroom) is
  // the classic case; here we flag both directions off the 85/50 split.
  let stranded: "power" | "space" | null = null
  if (space.pct >= RAG_RED && power.pct != null && power.pct <= 50) stranded = "space"
  else if (power.pct != null && power.pct >= RAG_RED && space.pct <= 50) stranded = "power"

  return { space, power, weight, stranded }
}
