import { useQuery } from "@tanstack/react-query"
import { api } from "./api"

// Trend metrics for the dashboard (MTTR + SLA compliance over time). Backed by the server-side
// /metrics aggregates, which compute over the honest `resolvedAt` timestamp and respect client +
// ENGINEER scope. Each response carries its denominator (totalResolved / totalJudged) so the UI
// never implies more coverage than the data supports.

export type MetricsBucketGranularity = "day" | "week" | "month"

export interface MttrBucket {
  bucketStart: string
  count: number
  meanMs: number | null
  medianMs: number | null
}
export interface MttrTrend {
  from: string
  to: string
  bucket: MetricsBucketGranularity
  totalResolved: number
  overallMeanMs: number | null
  overallMedianMs: number | null
  buckets: MttrBucket[]
}

export interface SlaComplianceBucket {
  bucketStart: string
  met: number
  breached: number
  total: number
}
export interface SlaComplianceTrend {
  from: string
  to: string
  bucket: MetricsBucketGranularity
  totalJudged: number
  noDueTarget: number
  overallMet: number
  overallBreached: number
  buckets: SlaComplianceBucket[]
}

export interface MetricsParams {
  from: string            // YYYY-MM-DD
  to: string              // YYYY-MM-DD
  bucket: MetricsBucketGranularity
  assigneeId?: string
}

// Date-only window → inclusive UTC instants (start-of-day to end-of-day), matching the dashboard's
// other date-range widgets.
function toParams(p: MetricsParams) {
  return {
    // Slice to the date part first — callers may pass a full ISO datetime (not
    // just YYYY-MM-DD), and blindly appending the time produced a malformed
    // doubled timestamp (…ZT00:00:00.000Z) that the API rejected with 400.
    from: `${p.from.slice(0, 10)}T00:00:00.000Z`,
    to: `${p.to.slice(0, 10)}T23:59:59.999Z`,
    bucket: p.bucket,
    assigneeId: p.assigneeId || undefined
  }
}

// Granularity picked to keep the series readable across the dashboard presets.
export function bucketForRange(from: string, to: string): MetricsBucketGranularity {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000)
  if (days <= 45) return "day"
  if (days <= 180) return "week"
  return "month"
}

export function useMttrTrend(p: MetricsParams) {
  return useQuery({
    queryKey: ["metrics", "mttr", p.from, p.to, p.bucket, p.assigneeId ?? ""],
    queryFn: async () => (await api.get<MttrTrend>("/metrics/mttr", { params: toParams(p) })).data
  })
}

export function useSlaComplianceTrend(p: MetricsParams) {
  return useQuery({
    queryKey: ["metrics", "sla-compliance", p.from, p.to, p.bucket, p.assigneeId ?? ""],
    queryFn: async () => (await api.get<SlaComplianceTrend>("/metrics/sla-compliance", { params: toParams(p) })).data
  })
}

// Humanise a duration in ms to a compact "Xh"/"Xd Yh" form for headline figures.
export function formatDurationMs(ms: number | null): string {
  if (ms == null) return "—"
  const hours = ms / (1000 * 60 * 60)
  if (hours < 1) return `${Math.max(1, Math.round(ms / (1000 * 60)))}m`
  if (hours < 48) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  const rem = Math.round(hours - days * 24)
  return rem ? `${days}d ${rem}h` : `${days}d`
}

export function msToHours(ms: number | null): number | null {
  return ms == null ? null : Math.round((ms / (1000 * 60 * 60)) * 10) / 10
}
