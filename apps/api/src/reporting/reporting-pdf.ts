// D3 — cross-module reporting summary PDF. Pure layout on the shared report-kit
// primitives, so it matches the Check / record / infrastructure reports' chrome. The
// same model (ReportingSummaryModel) feeds the web page + the CSV export. Only the
// sections present in the model are rendered.
import PDFDocument = require("pdfkit")
import {
  COLORS, MARGIN, MetaPair, drawDocHeader, drawFooters, ensureSpace, hairline
} from "../common/reporting/report-kit"
import type { ReportingSummaryModel } from "./reporting.service"

const hrs = (ms: number | null): string => (ms == null ? "—" : `${(ms / 3_600_000).toFixed(1)}h`)
const pctColor = (pct: number | null) =>
  pct == null ? COLORS.na : pct > 85 ? COLORS.fail : pct > 65 ? "#b45309" : COLORS.pass

function sectionTitle(doc: PDFKit.PDFDocument, title: string, contentWidth: number): void {
  ensureSpace(doc, 70)
  doc.moveDown(0.6)
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.primary)
    .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.6 })
  doc.moveDown(0.25)
  hairline(doc, contentWidth)
  doc.moveDown(0.45)
}

// A simple fixed-column table: header row (faint) + body rows. colX are absolute x
// offsets from MARGIN; the last column may right-align for figures.
function table(
  doc: PDFKit.PDFDocument,
  cols: { label: string; x: number; w: number; align?: "left" | "right" }[],
  rows: string[][],
  contentWidth: number
): void {
  ensureSpace(doc, 24 + rows.length * 14)
  const headY = doc.y
  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.faint)
  cols.forEach((c) => doc.text(c.label.toUpperCase(), MARGIN + c.x, headY, { width: c.w, align: c.align ?? "left", characterSpacing: 0.3, lineBreak: false }))
  doc.y = headY + 12
  hairline(doc, contentWidth)
  doc.moveDown(0.3)
  for (const row of rows) {
    ensureSpace(doc, 16)
    const y = doc.y
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.body)
    row.forEach((cell, i) => {
      const c = cols[i]
      doc.text(cell, MARGIN + c.x, y, { width: c.w, align: c.align ?? "left", lineBreak: false })
    })
    doc.y = y + 14
  }
  doc.moveDown(0.3)
}

function statLine(doc: PDFKit.PDFDocument, label: string, value: string, valueColor?: string): void {
  ensureSpace(doc, 16)
  const y = doc.y
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.body).text(label, MARGIN, y, { width: 300, lineBreak: false })
  doc.font("Helvetica-Bold").fontSize(9).fillColor(valueColor ?? COLORS.ink).text(value, MARGIN + 300, y, { width: 150, align: "right", lineBreak: false })
  doc.y = y + 14
}

export function buildReportingSummaryPdf(model: ReportingSummaryModel): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, bottom: MARGIN + 24, left: MARGIN, right: MARGIN }, bufferPages: true })
  const contentWidth = doc.page.width - MARGIN * 2

  const rangeLabel = `${model.range.months} month${model.range.months === 1 ? "" : "s"}`
  const pairs: MetaPair[] = [
    ["Client", model.clientName || "—"],
    ["Reporting window", rangeLabel],
    ["Modules", model.enabledModules.join(" · ") || "—"],
    ["Generated", new Date(model.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })]
  ]
  drawDocHeader(doc, {
    brand: "AD SERVICE MANAGEMENT",
    title: "Cross-module report",
    subtitle: `${model.clientName}  ·  ${rangeLabel}`,
    pairs
  }, contentWidth)

  const sd = model.sections.serviceDesk
  if (sd) {
    sectionTitle(doc, "Service Desk", contentWidth)
    statLine(doc, "Open incidents", String(sd.volumes.openIncidents))
    statLine(doc, "Open service requests", String(sd.volumes.openServiceRequests))
    statLine(doc, "Open tasks", String(sd.volumes.openTasks))
    statLine(doc, "Mean time to resolve (overall)", hrs(sd.mttr.overallMeanMs))
    statLine(doc, "Median time to resolve (overall)", hrs(sd.mttr.overallMedianMs))
    const slaTotal = sd.sla.overallMet + sd.sla.overallBreached
    const slaPct = slaTotal > 0 ? Math.round((sd.sla.overallMet / slaTotal) * 100) : null
    statLine(doc, "SLA compliance (met / judged)", slaPct == null ? "—" : `${slaPct}%  (${sd.sla.overallMet}/${slaTotal})`, slaPct == null ? undefined : pctColor(100 - slaPct))
    if (sd.mttr.buckets.length) {
      doc.moveDown(0.3)
      table(doc,
        [{ label: "Month", x: 0, w: 140 }, { label: "Resolved", x: 160, w: 80, align: "right" }, { label: "Mean", x: 260, w: 80, align: "right" }, { label: "Median", x: 360, w: 80, align: "right" }],
        sd.mttr.buckets.map((b) => [b.bucketStart, String(b.count), hrs(b.meanMs), hrs(b.medianMs)]),
        contentWidth
      )
    }
  }

  const dcim = model.sections.dcim
  if (dcim) {
    sectionTitle(doc, "DCIM — capacity", contentWidth)
    const t = dcim.totals
    statLine(doc, "Sites / cabinets / active assets", `${t.sites} / ${t.cabinets} / ${t.activeAssets}`)
    statLine(doc, "Space used", `${t.usedU} / ${t.totalU} U  (${t.spacePct}%)`, pctColor(t.spacePct))
    statLine(doc, "Power (budgeted vs capacity)", `${t.budgetedKw.toFixed(1)} / ${t.capacityKw == null ? "—" : t.capacityKw.toFixed(1)} kW  (${t.powerPct == null ? "—" : t.powerPct + "%"})`, pctColor(t.powerPct))
    statLine(doc, "Stranded cabinets", String(t.strandedCabinets), t.strandedCabinets > 0 ? "#b45309" : undefined)
    statLine(doc, "Reservations expiring soon", String(t.expiringReservations))
    if (dcim.sites.length) {
      doc.moveDown(0.3)
      table(doc,
        [{ label: "Site", x: 0, w: 150 }, { label: "Cab", x: 160, w: 50, align: "right" }, { label: "Space", x: 220, w: 90, align: "right" }, { label: "Power", x: 320, w: 90, align: "right" }, { label: "Stranded", x: 420, w: 70, align: "right" }],
        dcim.sites.map((s) => [
          s.name, String(s.cabinetCount),
          `${s.space.pct}%`,
          s.power.pct == null ? "—" : `${s.power.pct}%`,
          String(s.strandedCabinets)
        ]),
        contentWidth
      )
    }
  }

  const crm = model.sections.crm
  if (crm) {
    sectionTitle(doc, "CRM — commercial", contentWidth)
    statLine(doc, "Win rate (period)", crm.winLoss.winRate == null ? "—" : `${crm.winLoss.winRate}%  (${crm.winLoss.won} won / ${crm.winLoss.lost} lost)`)
    statLine(doc, "Won value (period)", crm.winLoss.wonValue.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }))
    if (crm.pipeline.length) {
      doc.moveDown(0.3)
      table(doc,
        [{ label: "Stage", x: 0, w: 170 }, { label: "Count", x: 190, w: 70, align: "right" }, { label: "Value", x: 280, w: 100, align: "right" }, { label: "Weighted", x: 400, w: 90, align: "right" }],
        crm.pipeline.map((p) => [
          p.stage, String(p.count),
          p.value.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }),
          p.weighted.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })
        ]),
        contentWidth
      )
    }
  }

  if (!sd && !dcim && !crm) {
    doc.moveDown(1)
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted)
      .text("No licensed modules to report for this client.", MARGIN, doc.y, { width: contentWidth })
  }

  drawFooters(doc, { reference: model.clientName || "Report", generatedAt: model.generatedAt })
  return doc
}
