import { api } from "./api"
import { barColor, formatKw } from "./infrastructure"
import type { ThemeMode } from "../components/shared/tokens/colors"

// Client mirror of the capacity API (DCIM spec §4.3). Read-only.

// `measured`/`measuredPct` (Horizon 3) — the third power number; null when unmonitored.
export type Metered = { value: number; capacity: number | null; pct: number | null; measured?: number | null; measuredPct?: number | null }
export type SpaceCap = {
  usedU: number; freeU: number; totalU: number; pct: number
  largestContiguousU: number; freeBlocks: { start: number; size: number }[]
}
export type Health = "OK" | "WARNING" | "CRITICAL" | "UNKNOWN"
export type CabinetEnvironment = {
  temperatureC: number | null; humidityPct: number | null; health: Health; readAt: string | null
}
export type CabinetCapacity = {
  cabinetId: string; name: string; roomId: string | null; totalU: number
  activeAssets: number; activeReservations: number
  space: SpaceCap; power: Metered; weight: Metered
  environment?: CabinetEnvironment
  stranded: "power" | "space" | null
}
export type SiteCapacity = {
  siteId: string; name: string
  totals: {
    cabinets: number; activeAssets: number
    space: { usedU: number; totalU: number; pct: number }
    power: Metered; weight: Metered; strandedCabinets: number
    monitoredCabinets?: number
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

// ── Place-or-Reserve capacity search (Horizon 2) ─────────────────────────────
export type FindSpaceQuery = { uSize: number; budgetW?: number; weightKg?: number; siteId?: string }
export type FindSpaceCandidate = {
  cabinetId: string; name: string
  siteId: string; siteName: string
  roomId: string | null; roomName: string | null
  totalU: number
  bestBlock: { start: number; size: number }
  waste: number
  // Every placeable block the kit fits in — the position picker's options.
  blocks: { start: number; size: number }[]
  freeU: number
  power: { budgetedKw: number; capacityKw: number | null; headroomW: number | null; pct: number | null }
  weight: { valueKg: number; capacityKg: number | null; headroomKg: number | null }
  // null = the cabinet declares no capacity for that axis (unknown, flagged in UI)
  fits: { space: true; power: boolean | null; weight: boolean | null }
}
export type FindSpaceResult = { scanned: number; matched: number; candidates: FindSpaceCandidate[] }

export async function findSpace(query: FindSpaceQuery): Promise<FindSpaceResult> {
  return (await api.post<FindSpaceResult>("/capacity/find-space", query)).data
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
