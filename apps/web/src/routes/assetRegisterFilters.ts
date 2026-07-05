import { Asset, HealthLevel } from "../lib/infrastructure"
import { AssetCustomField } from "../lib/customFields"

// Filter model for the Asset register (the UI is top filter chips + instant
// search — DCIM_DESIGN_BRIEF §4.5's "search + filter chips"; the earlier left
// checkbox rail is retired). Room/cabinet narrowing is deliberately NOT here:
// spatial drill-down is Sites & cabinets' job, the register filters flat.

export type WarrantyKey = "expired" | "soon" | "healthy"

export type FilterState = {
  siteIds: Set<string>
  types: Set<string>
  lifecycles: Set<string>
  manufacturers: Set<string>
  warranty: Set<WarrantyKey>
  health: Set<HealthLevel>
  search: string
}

export function emptyFilters(): FilterState {
  return {
    siteIds: new Set(),
    types: new Set(),
    lifecycles: new Set(),
    manufacturers: new Set(),
    warranty: new Set(),
    health: new Set(),
    search: "",
  }
}

// The asset's derived health, defaulting to UNKNOWN when the read didn't resolve it.
export function assetHealth(a: Asset): HealthLevel {
  return a.health?.health ?? "UNKNOWN"
}

export type FilterKey = keyof FilterState

// Plain, JSON-safe shape for persisting a FilterState (Sets → arrays) — used by
// saved views (localStorage).
export type FilterSnapshot = {
  siteIds: string[]; types: string[]; lifecycles: string[]
  manufacturers: string[]; warranty: WarrantyKey[]; health?: HealthLevel[]; search: string
}

export function serializeFilters(f: FilterState): FilterSnapshot {
  return {
    siteIds: [...f.siteIds], types: [...f.types], lifecycles: [...f.lifecycles],
    manufacturers: [...f.manufacturers], warranty: [...f.warranty], health: [...f.health], search: f.search,
  }
}

export function deserializeFilters(s: FilterSnapshot): FilterState {
  return {
    siteIds: new Set(s.siteIds ?? []), types: new Set(s.types ?? []),
    lifecycles: new Set(s.lifecycles ?? []), manufacturers: new Set(s.manufacturers ?? []),
    warranty: new Set(s.warranty ?? []), health: new Set(s.health ?? []), search: s.search ?? "",
  }
}

export const UNKNOWN_MANUFACTURER = "Unknown"

export function warrantyStatus(expiry: string | null): "expired" | "soon" | "ok" | "none" {
  if (!expiry) return "none"
  const d = new Date(expiry)
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 86400000)
  if (d < now) return "expired"
  if (d < in30) return "soon"
  return "ok"
}

export function activeFilterCount(f: FilterState): number {
  return f.siteIds.size + f.types.size + f.lifecycles.size + f.manufacturers.size + f.warranty.size + f.health.size + (f.search ? 1 : 0)
}

export function applyFilters(assets: Asset[], filters: FilterState): Asset[] {
  return assets.filter(a => {
    if (filters.siteIds.size > 0 && !filters.siteIds.has(a.siteId ?? "")) return false
    if (filters.types.size > 0 && !filters.types.has(a.assetType)) return false
    if (filters.lifecycles.size > 0 && !filters.lifecycles.has(a.lifecycleState)) return false
    if (filters.manufacturers.size > 0 && !filters.manufacturers.has(a.manufacturer ?? UNKNOWN_MANUFACTURER)) return false
    if (filters.health.size > 0 && !filters.health.has(assetHealth(a))) return false
    if (filters.warranty.size > 0) {
      const s = warrantyStatus(a.warrantyExpiry)
      const mapped: WarrantyKey | null = s === "expired" ? "expired" : s === "soon" ? "soon" : s === "ok" ? "healthy" : null
      if (!mapped || !filters.warranty.has(mapped)) return false
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const hay = [
        a.name, a.assetTag, a.assetType, a.manufacturer,
        a.modelNumber, a.serialNumber, a.ipAddress,
        a.cabinet?.name, a.cabinet?.room?.name, a.site?.name
      ].filter(Boolean).join(" ").toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

// Re-apply every filter dimension EXCEPT the one specified — each chip's option
// list (and counts) reflects the OTHER active filters, so picking an option
// never makes its siblings vanish.
export function applyFiltersExcluding(assets: Asset[], filters: FilterState, excludeKey: FilterKey): Asset[] {
  const patched = { ...filters } as FilterState
  ;(patched as any)[excludeKey] = excludeKey === "search" ? "" : new Set()
  return applyFilters(assets, patched)
}

// Filtered CSV export — the audit artefact ("export N (filtered)", brief §4.5).
export function exportAssetsCsv(rows: Asset[], customFields: AssetCustomField[] = []) {
  const cols: [string, (a: Asset) => string | number | null | undefined][] = [
    ["Tag", a => a.assetTag], ["Name", a => a.name], ["Type", a => a.assetType],
    ["Manufacturer", a => a.manufacturer], ["Model", a => a.modelNumber],
    ["Serial", a => a.serialNumber], ["IP", a => a.ipAddress],
    ["Site", a => a.site?.name], ["Room", a => a.cabinet?.room?.name],
    ["Cabinet", a => a.cabinet?.name], ["U position", a => a.uPosition],
    ["Power (W)", a => a.powerDrawW], ["Lifecycle", a => a.lifecycleState],
    ["Warranty expiry", a => a.warrantyExpiry?.split("T")[0]],
    ["Installed", a => a.installDate?.split("T")[0]],
    ["Health", a => assetHealth(a)],
    // Custom fields append as trailing columns (values live in Asset.customValues).
    ...customFields.map(f => [f.label, (a: Asset) => {
      const v = (a.customValues ?? {})[f.key]
      return v == null ? "" : String(v)
    }] as [string, (a: Asset) => string | number | null | undefined]),
  ]
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const csv = [cols.map(c => c[0]).join(","), ...rows.map(a => cols.map(([, f]) => esc(f(a))).join(","))].join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `assets-register-${new Date().toISOString().split("T")[0]}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
