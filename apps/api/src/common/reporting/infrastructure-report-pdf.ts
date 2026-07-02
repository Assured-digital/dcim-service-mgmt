// Client-facing infrastructure report PDF (DCIM_DESIGN_SPEC.md §5). Pure layout —
// no Nest/Prisma deps — built on the shared report-kit primitives so it matches the
// Check evidence report's chrome. The same model feeds the web report page.
import PDFDocument = require("pdfkit");
import {
  COLORS, MARGIN, MetaPair, drawDocHeader, drawFooters, ensureSpace, fmtDate, hairline
} from "./report-kit";

export type ReportMetered = { value: number; capacity: number | null; pct: number | null };

export type InfrastructureReportModel = {
  clientName: string;
  siteName: string;
  generatedAt: string; // ISO
  contracted: { kw: number | null; u: number | null };
  totals: {
    cabinets: number;
    activeAssets: number;
    space: { usedU: number; totalU: number; pct: number };
    power: ReportMetered; // budgeted kW vs feed kW
    weight: ReportMetered;
    strandedCabinets: number;
  };
  cabinets: {
    name: string; usedU: number; totalU: number; budgetedKw: number;
    powerPct: number | null; activeAssets: number; stranded: string | null;
  }[];
  lifecycle: { state: string; count: number }[];
  assetTypes: { type: string; count: number }[];
  maintenance: {
    last90Days: number;
    overdue: number;
    upcoming: { assetName: string; workType: string; dueAt: string }[];
  };
  reservations: { cabinetName: string; range: string; name: string; expiresAt: string | null }[];
};

const ragColor = (pct: number | null) =>
  pct == null ? COLORS.na : pct > 85 ? COLORS.fail : pct > 65 ? "#b45309" : COLORS.pass;

function sectionTitle(doc: PDFKit.PDFDocument, title: string, contentWidth: number): void {
  ensureSpace(doc, 70);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.primary)
    .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.25);
  hairline(doc, contentWidth);
  doc.moveDown(0.45);
}

// One "metric vs denominator" row with a small horizontal bar. Contracted figures
// (the commercial denominator) render alongside physical capacity when present.
function capacityRow(
  doc: PDFKit.PDFDocument, label: string, caption: string, pct: number | null, contentWidth: number
): void {
  ensureSpace(doc, 26);
  const y = doc.y;
  const barX = MARGIN + 120;
  const barW = contentWidth - 120 - 120;
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.body).text(label, MARGIN, y, { width: 115, lineBreak: false });
  // Track + fill
  doc.roundedRect(barX, y + 1, barW, 7, 2).fillColor("#f1f5f9").fill();
  if (pct != null && pct > 0) {
    doc.roundedRect(barX, y + 1, Math.max(4, barW * Math.min(100, pct) / 100), 7, 2).fillColor(ragColor(pct)).fill();
  }
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted)
    .text(caption, barX + barW + 8, y, { width: 112, align: "right", lineBreak: false });
  doc.y = y + 16;
  doc.x = MARGIN;
}

function tableHeader(doc: PDFKit.PDFDocument, cols: { label: string; x: number; w: number; align?: "left" | "right" }[]): void {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.faint);
  for (const c of cols) doc.text(c.label.toUpperCase(), c.x, y, { width: c.w, align: c.align ?? "left", lineBreak: false, characterSpacing: 0.4 });
  doc.y = y + 12;
  doc.x = MARGIN;
}

export function buildInfrastructureReportPdf(model: InfrastructureReportModel): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, bottom: MARGIN + 24, left: MARGIN, right: MARGIN }, bufferPages: true });
  const contentWidth = doc.page.width - MARGIN * 2;
  const t = model.totals;

  const kw = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(2));
  const pairs: MetaPair[] = [
    ["Client", model.clientName],
    ["Site", model.siteName],
    ["Cabinets", String(t.cabinets)],
    ["Active assets", String(t.activeAssets)],
    ["Contracted power", model.contracted.kw != null ? `${kw(model.contracted.kw)} kW` : "—"],
    ["Contracted space", model.contracted.u != null ? `${model.contracted.u} U` : "—"],
  ];

  drawDocHeader(doc, {
    brand: "ASSURED DIGITAL · INFRASTRUCTURE REPORT",
    title: model.siteName,
    subtitle: `Estate summary · generated ${fmtDate(model.generatedAt)}`,
    pairs,
  }, contentWidth);

  // ── Capacity ──
  sectionTitle(doc, "Capacity", contentWidth);
  const contractedSpacePct = model.contracted.u ? Math.round((t.space.usedU / model.contracted.u) * 100) : null;
  const contractedPowerPct = model.contracted.kw ? Math.round((t.power.value / model.contracted.kw) * 100) : null;
  capacityRow(doc, "Space (physical)", `${t.space.usedU} / ${t.space.totalU} U · ${t.space.pct}%`, t.space.pct, contentWidth);
  if (contractedSpacePct != null) capacityRow(doc, "Space (contracted)", `${t.space.usedU} / ${model.contracted.u} U · ${contractedSpacePct}%`, contractedSpacePct, contentWidth);
  capacityRow(doc, "Power (budgeted)", t.power.capacity != null ? `${kw(t.power.value)} / ${kw(t.power.capacity)} kW · ${t.power.pct}%` : `${kw(t.power.value)} kW`, t.power.pct, contentWidth);
  if (contractedPowerPct != null) capacityRow(doc, "Power (contracted)", `${kw(t.power.value)} / ${kw(model.contracted.kw!)} kW · ${contractedPowerPct}%`, contractedPowerPct, contentWidth);
  capacityRow(doc, "Weight", t.weight.capacity != null ? `${Math.round(t.weight.value)} / ${Math.round(t.weight.capacity)} kg · ${t.weight.pct}%` : `${Math.round(t.weight.value)} kg`, t.weight.pct, contentWidth);
  if (t.strandedCabinets > 0) {
    doc.font("Helvetica").fontSize(8.5).fillColor("#b45309")
      .text(`${t.strandedCabinets} cabinet(s) flagged with a space/power imbalance (stranded capacity).`, MARGIN, doc.y, { width: contentWidth });
    doc.moveDown(0.3);
  }
  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLORS.faint)
    .text("Power figures are budgeted (nameplate derated), not live metered readings.", MARGIN, doc.y, { width: contentWidth });

  // ── Per-cabinet ──
  sectionTitle(doc, "Cabinets", contentWidth);
  const cw = contentWidth;
  const cols = [
    { label: "Cabinet", x: MARGIN, w: cw * 0.3 },
    { label: "Space", x: MARGIN + cw * 0.32, w: cw * 0.16, align: "right" as const },
    { label: "Budgeted power", x: MARGIN + cw * 0.5, w: cw * 0.2, align: "right" as const },
    { label: "Assets", x: MARGIN + cw * 0.72, w: cw * 0.1, align: "right" as const },
    { label: "Notes", x: MARGIN + cw * 0.84, w: cw * 0.16, align: "right" as const },
  ];
  tableHeader(doc, cols);
  for (const c of model.cabinets) {
    ensureSpace(doc, 16);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink).text(c.name, cols[0].x, y, { width: cols[0].w, lineBreak: false, ellipsis: true });
    doc.fillColor(COLORS.body).text(`${c.usedU}/${c.totalU} U`, cols[1].x, y, { width: cols[1].w, align: "right", lineBreak: false });
    doc.fillColor(ragColor(c.powerPct)).text(`${kw(c.budgetedKw)} kW${c.powerPct != null ? ` (${c.powerPct}%)` : ""}`, cols[2].x, y, { width: cols[2].w, align: "right", lineBreak: false });
    doc.fillColor(COLORS.body).text(String(c.activeAssets), cols[3].x, y, { width: cols[3].w, align: "right", lineBreak: false });
    doc.fillColor(c.stranded ? "#b45309" : COLORS.faint).text(c.stranded ? `stranded ${c.stranded}` : "—", cols[4].x, y, { width: cols[4].w, align: "right", lineBreak: false });
    doc.y = y + 14;
    doc.x = MARGIN;
  }

  // ── Inventory ──
  sectionTitle(doc, "Inventory", contentWidth);
  const lifecycleLine = model.lifecycle.map((l) => `${l.state.toLowerCase()}: ${l.count}`).join("   ·   ");
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.body).text(`By lifecycle — ${lifecycleLine || "no assets"}`, MARGIN, doc.y, { width: contentWidth });
  doc.moveDown(0.3);
  const typeLine = model.assetTypes.map((a) => `${a.type}: ${a.count}`).join("   ·   ");
  doc.text(`By type — ${typeLine || "no assets"}`, MARGIN, doc.y, { width: contentWidth });

  // ── Maintenance ──
  sectionTitle(doc, "Maintenance", contentWidth);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.body)
    .text(`${model.maintenance.last90Days} maintenance record(s) in the last 90 days · ${model.maintenance.overdue} overdue`, MARGIN, doc.y, { width: contentWidth });
  doc.moveDown(0.3);
  if (model.maintenance.upcoming.length) {
    for (const m of model.maintenance.upcoming) {
      ensureSpace(doc, 14);
      doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted)
        .text(`• ${m.assetName} — ${m.workType.replaceAll("_", " ").toLowerCase()} due ${fmtDate(m.dueAt)}`, MARGIN + 6, doc.y, { width: contentWidth - 6 });
    }
  } else {
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.faint).text("No upcoming scheduled maintenance.", MARGIN, doc.y, { width: contentWidth });
  }

  // ── Reservations ──
  if (model.reservations.length) {
    sectionTitle(doc, "Outstanding reservations", contentWidth);
    for (const r of model.reservations) {
      ensureSpace(doc, 14);
      doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted)
        .text(`• ${r.cabinetName} ${r.range} — ${r.name}${r.expiresAt ? ` (expires ${fmtDate(r.expiresAt)})` : " (open-ended)"}`, MARGIN + 6, doc.y, { width: contentWidth - 6 });
    }
  }

  drawFooters(doc, { reference: model.siteName, generatedAt: model.generatedAt });
  return doc;
}
