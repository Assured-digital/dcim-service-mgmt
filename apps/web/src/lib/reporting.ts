import { api } from "./api"

// D3 — cross-module reporting. One client-scoped summary (composed server-side from the
// existing metrics / CRM / capacity engines) drives the page + the PDF/CSV exports.
// x-client-id is auto-injected by the api interceptor. Sections are entitlement-gated
// server-side, so any of the three may be absent.

export interface MttrBucket { bucketStart: string; count: number; meanMs: number | null; medianMs: number | null }
export interface SlaBucket { bucketStart: string; met: number; breached: number; total: number }

export interface ServiceDeskSection {
  mttr: { totalResolved: number; overallMeanMs: number | null; overallMedianMs: number | null; buckets: MttrBucket[] }
  sla: { totalJudged: number; overallMet: number; overallBreached: number; buckets: SlaBucket[] }
  volumes: { openIncidents: number; openServiceRequests: number; openTasks: number }
}

export interface DcimSiteRow {
  siteId: string
  name: string
  cabinetCount: number
  space: { usedU: number; totalU: number; pct: number }
  power: { value: number; capacity: number | null; pct: number | null }
  strandedCabinets: number
}
export interface DcimSection {
  totals: {
    sites: number; cabinets: number; activeAssets: number
    usedU: number; totalU: number; spacePct: number
    budgetedKw: number; capacityKw: number | null; powerPct: number | null
    strandedCabinets: number; expiringReservations: number
  }
  sites: DcimSiteRow[]
}

export interface CrmSection {
  pipeline: { stage: string; count: number; value: number; weighted: number }[]
  forecast: { month: string; count: number; value: number; weighted: number }[]
  winLoss: { periodMonths: number; won: number; lost: number; winRate: number | null; wonValue: number; lossReasons: Record<string, number> }
  stalled: { id: string; reference: string; title: string; stage: string; value: number | null; daysInStage: number; nextStepOverdue: boolean }[]
}

export interface ReportingSummary {
  generatedAt: string
  clientId: string
  clientName: string
  range: { from: string; to: string; months: number }
  enabledModules: string[]
  sections: {
    serviceDesk?: ServiceDeskSection
    dcim?: DcimSection
    crm?: CrmSection
  }
}

export async function fetchReportingSummary(months?: number): Promise<ReportingSummary> {
  const { data } = await api.get<ReportingSummary>("/reporting/summary", {
    params: months ? { months } : undefined,
  })
  return data
}

// Authed blob downloads (JWT + x-client-id required — a raw <a href> would be rejected),
// mirroring lib/recordReport.ts.
async function downloadReport(ext: "pdf" | "csv", months?: number): Promise<void> {
  const { data } = await api.get<Blob>(`/reporting/summary.${ext}`, {
    responseType: "blob",
    params: months ? { months } : undefined,
  })
  const url = window.URL.createObjectURL(data)
  const a = document.createElement("a")
  a.href = url
  a.download = `report.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export const downloadReportingPdf = (months?: number) => downloadReport("pdf", months)
export const downloadReportingCsv = (months?: number) => downloadReport("csv", months)

// ── formatting helpers ──────────────────────────────────────────────────────────
export function msToHoursLabel(ms: number | null): string {
  if (ms == null) return "—"
  const h = ms / 3_600_000
  if (h < 1) return `${Math.round(ms / 60_000)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export function gbp(value: number): string {
  return value.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })
}

export function slaPct(met: number, breached: number): number | null {
  const total = met + breached
  return total > 0 ? Math.round((met / total) * 100) : null
}
