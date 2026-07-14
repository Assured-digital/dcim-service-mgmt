import { toCsv } from "../common/reporting/csv"
import type { ReportingSummaryModel } from "./reporting.service"

// D3 — CSV export of the reporting summary. A report spans several small tables, so the
// file is a set of labelled blocks (a "# Section" line, one toCsv table, a blank line) —
// the pragmatic spreadsheet-friendly shape used for multi-table exports. Only the
// sections present in the model (entitlement-gated) are emitted.

function fmtHrs(ms: number | null): string {
  if (ms == null) return ""
  return (ms / 3_600_000).toFixed(1)
}

export function buildReportingSummaryCsv(model: ReportingSummaryModel): string {
  const blocks: string[] = []
  const block = (title: string, csv: string) => blocks.push(`# ${title}\n${csv}`)

  block(
    "Report",
    toCsv(
      ["field", "value"],
      [
        { field: "Client", value: model.clientName },
        { field: "Generated", value: model.generatedAt },
        { field: "Range from", value: model.range.from },
        { field: "Range to", value: model.range.to },
        { field: "Window (months)", value: model.range.months },
        { field: "Modules", value: model.enabledModules.join(" / ") }
      ]
    )
  )

  const sd = model.sections.serviceDesk
  if (sd) {
    block(
      "Service Desk — volumes (open)",
      toCsv(
        ["metric", "count"],
        [
          { metric: "Open incidents", count: sd.volumes.openIncidents },
          { metric: "Open service requests", count: sd.volumes.openServiceRequests },
          { metric: "Open tasks", count: sd.volumes.openTasks }
        ]
      )
    )
    block(
      "Service Desk — MTTR by month (hours)",
      toCsv(
        ["month", "resolved", "meanHours", "medianHours"],
        sd.mttr.buckets.map((b) => ({
          month: b.bucketStart,
          resolved: b.count,
          meanHours: fmtHrs(b.meanMs),
          medianHours: fmtHrs(b.medianMs)
        }))
      )
    )
    block(
      "Service Desk — SLA compliance by month",
      toCsv(
        ["month", "met", "breached", "total"],
        sd.sla.buckets.map((b) => ({ month: b.bucketStart, met: b.met, breached: b.breached, total: b.total }))
      )
    )
  }

  const dcim = model.sections.dcim
  if (dcim) {
    block(
      "DCIM — capacity by site",
      toCsv(
        ["site", "cabinets", "usedU", "totalU", "spacePct", "powerKw", "powerCapacityKw", "powerPct", "stranded"],
        dcim.sites.map((s) => ({
          site: s.name,
          cabinets: s.cabinetCount,
          usedU: s.space.usedU,
          totalU: s.space.totalU,
          spacePct: s.space.pct,
          powerKw: s.power.value,
          powerCapacityKw: s.power.capacity ?? "",
          powerPct: s.power.pct ?? "",
          stranded: s.strandedCabinets
        }))
      )
    )
  }

  const crm = model.sections.crm
  if (crm) {
    block(
      "CRM — pipeline by stage",
      toCsv(
        ["stage", "count", "value", "weighted"],
        crm.pipeline.map((p) => ({ stage: p.stage, count: p.count, value: p.value, weighted: p.weighted }))
      )
    )
    block(
      "CRM — forecast by month",
      toCsv(
        ["month", "count", "value", "weighted"],
        crm.forecast.map((f) => ({ month: f.month, count: f.count, value: f.value, weighted: f.weighted }))
      )
    )
    block(
      "CRM — win / loss",
      toCsv(
        ["metric", "value"],
        [
          { metric: "Won", value: crm.winLoss.won },
          { metric: "Lost", value: crm.winLoss.lost },
          { metric: "Win rate %", value: crm.winLoss.winRate ?? "" },
          { metric: "Won value", value: crm.winLoss.wonValue },
          { metric: "Period (months)", value: crm.winLoss.periodMonths }
        ]
      )
    )
  }

  return blocks.join("\n\n")
}
