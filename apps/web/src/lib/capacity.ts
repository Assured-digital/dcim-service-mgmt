import { api } from "./api"
import { barColor, formatKw } from "./infrastructure"
import type { ThemeMode } from "../components/shared/tokens/colors"

// Client mirror of the capacity API (DCIM spec §4.3). Read-only.

export type Metered = { value: number; capacity: number | null; pct: number | null }
export type SpaceCap = {
  usedU: number; freeU: number; totalU: number; pct: number
  largestContiguousU: number; freeBlocks: { start: number; size: number }[]
}
export type CabinetCapacity = {
  cabinetId: string; name: string; roomId: string | null; totalU: number
  activeAssets: number; activeReservations: number
  space: SpaceCap; power: Metered; weight: Metered
  stranded: "power" | "space" | null
}
export type SiteCapacity = {
  siteId: string; name: string
  totals: {
    cabinets: number; activeAssets: number
    space: { usedU: number; totalU: number; pct: number }
    power: Metered; weight: Metered; strandedCabinets: number
  }
  cabinets: CabinetCapacity[]
}
export type OverviewSite = {
  siteId: string; name: string; cabinetCount: number
  space: { usedU: number; totalU: number; pct: number }
  power: Metered; weight: Metered; strandedCabinets: number
}
export type CapacityOverview = {
  totals: {
    sites: number; cabinets: number; activeAssets: number
    usedU: number; totalU: number; spacePct: number
    budgetedKw: number; capacityKw: number | null; powerPct: number | null
    strandedCabinets: number; expiringReservations: number
  }
  sites: OverviewSite[]
  topCabinets: { cabinetId: string; siteId: string; siteName: string; name: string; budgetedKw: number }[]
}

export async function getCapacityOverview(): Promise<CapacityOverview> {
  return (await api.get<CapacityOverview>("/capacity/overview")).data
}

export async function getSiteCapacity(siteId: string): Promise<SiteCapacity> {
  return (await api.get<SiteCapacity>(`/sites/${siteId}/capacity`)).data
}

// RYG bar colour for a percentage, matching the server's 65/85 stranded thresholds.
// null pct (no capacity denominator) → neutral grey.
export function pctColor(pct: number | null, mode: ThemeMode): string {
  if (pct == null) return mode === "dark" ? "#475569" : "#cbd5e1"
  return barColor(pct, mode)
}

// "3.4 kW" / "18.0 kW"; passes through the shared formatter.
export function kw(value: number): string {
  return `${formatKw(value)} kW`
}
