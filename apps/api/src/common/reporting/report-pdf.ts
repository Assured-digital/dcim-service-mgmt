// Server-side PDF builder for a finalised Check — the shareable compliance/evidence
// document. Sibling to csv.ts: a pure builder with NO Nest/Prisma deps. Given a fully
// assembled model (incl. already-fetched image bytes), it lays out the document and
// returns the PDFKit doc WITHOUT calling end() — the caller attaches a sink (buffer or
// response) and ends it (so chunks are never dropped to an un-consumed Readable).
//
// The generic document chrome (palette, page-break/hairline primitives, narrative + photo
// blocks, the branded header + metadata grid, the page-number footer pass) lives in
// report-kit.ts and is shared with the per-record export builder. THIS file holds only the
// Check-specific layout: the pass-rate summary band and the PASS/FAIL/NA checklist items.
//
// pdfkit is pure-JS (no native modules) and bundles its standard Helvetica fonts, so the
// Dockerfile is unchanged. It can embed PNG/JPEG natively ONLY — GIF/WebP/PDF evidence
// (also on the attachment allow-list) is rendered as a text reference, not an image.
import PDFDocument = require("pdfkit");
import {
  COLORS,
  MARGIN,
  ReportPhoto,
  drawDocHeader,
  drawFooters,
  drawNarrative,
  drawPhoto,
  ensureSpace,
  fmtDate,
  hairline
} from "./report-kit";

// Re-export the shared photo type so existing importers (checks-report.service) are unaffected.
export type { ReportPhoto };

// ── Model (assembled by checks-report.service from the clientId-scoped check) ──────────

export type ReportItem = {
  index: number; // 1-based display position within the whole check
  label: string;
  response: string | null; // PASS | FAIL | NA | null (not answered)
  notes: string | null;
  isRequired: boolean;
  isCritical: boolean;
  photos: ReportPhoto[];
};

export type ReportSection = {
  name: string;
  items: ReportItem[];
};

export type CheckReportModel = {
  reference: string;
  title: string;
  status: string; // raw CheckStatus
  statusLabel: string; // humanised
  checkType: string;
  priority: string;
  siteName: string;
  templateName: string;
  assigneeName: string | null;
  reviewerName: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  engineerSummary: string | null;
  reviewerNotes: string | null;
  passRate: number | null;
  summary: {
    total: number;
    answered: number;
    pass: number;
    fail: number;
    na: number;
    pending: number;
  };
  sections: ReportSection[];
  generatedAt: string; // ISO
};

// ── Check-specific response vocabulary ────────────────────────────────────────────────
const RESPONSE_META: Record<string, { label: string; color: string }> = {
  PASS: { label: "PASS", color: COLORS.pass },
  FAIL: { label: "FAIL", color: COLORS.fail },
  NA: { label: "N/A", color: COLORS.na }
};
function responseMeta(r: string | null): { label: string; color: string } {
  return (r && RESPONSE_META[r]) || { label: "Not answered", color: COLORS.faint };
}

// ── Sections of the document ──────────────────────────────────────────────────────────

// Thin wrapper over the shared branded header: supplies the Check brand/subtitle and the
// Check metadata pairs. The exact spacing/fonts live in drawDocHeader (report-kit).
function drawHeader(doc: PDFKit.PDFDocument, m: CheckReportModel, contentWidth: number): void {
  drawDocHeader(
    doc,
    {
      brand: "ASSURED DIGITAL · CHECK REPORT",
      title: m.title,
      subtitle: `${m.reference}   ·   ${m.statusLabel}   ·   ${m.checkType}`,
      pairs: [
        ["Site", m.siteName],
        ["Template", m.templateName],
        ["Engineer", m.assigneeName ?? "Unassigned"],
        ["Reviewer", m.reviewerName ?? "—"],
        ["Priority", m.priority],
        ["Pass rate", m.passRate == null ? "—" : `${Math.round(m.passRate)}%`],
        ["Scheduled", fmtDate(m.scheduledAt)],
        ["Started", fmtDate(m.startedAt)],
        ["Submitted", fmtDate(m.submittedAt)],
        [m.closedAt ? "Closed" : "Completed", fmtDate(m.closedAt ?? m.completedAt)]
      ]
    },
    contentWidth
  );
}

function drawSummary(doc: PDFKit.PDFDocument, m: CheckReportModel, contentWidth: number): void {
  const boxY = doc.y;
  const boxH = 58;
  doc.roundedRect(MARGIN, boxY, contentWidth, boxH, 6)
    .lineWidth(1).strokeColor(COLORS.hair).fillAndStroke("#f8fafc", COLORS.hair);

  // Pass-rate dial (left): big number + label.
  const padX = 16;
  const rate = m.passRate == null ? "—" : `${Math.round(m.passRate)}%`;
  const rateColor =
    m.passRate == null ? COLORS.faint
      : m.passRate >= 80 ? COLORS.pass
      : m.passRate >= 60 ? "#b45309"
      : COLORS.fail;
  doc.font("Helvetica-Bold").fontSize(24).fillColor(rateColor)
    .text(rate, MARGIN + padX, boxY + 12, { lineBreak: false });
  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted)
    .text("PASS RATE", MARGIN + padX, boxY + 40, { characterSpacing: 0.4, lineBreak: false });

  // Count stats (right group): Pass / Fail / N/A / Pending / Answered.
  const stats: Array<[string, number, string]> = [
    ["Pass", m.summary.pass, COLORS.pass],
    ["Fail", m.summary.fail, COLORS.fail],
    ["N/A", m.summary.na, COLORS.na],
    ["Pending", m.summary.pending, COLORS.faint],
    ["Answered", m.summary.answered, COLORS.ink]
  ];
  const groupX = MARGIN + 150;
  const cellW = (contentWidth - 150 - padX) / stats.length;
  stats.forEach(([label, value, color], i) => {
    const cx = groupX + i * cellW;
    doc.font("Helvetica-Bold").fontSize(16).fillColor(color)
      .text(String(value), cx, boxY + 12, { width: cellW - 6, lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted)
      .text(label.toUpperCase(), cx, boxY + 40, { width: cellW - 6, characterSpacing: 0.3, lineBreak: false });
  });
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.faint)
    .text(`of ${m.summary.total} items`, groupX + 4 * cellW, boxY + 33, { width: cellW - 6, lineBreak: false });

  doc.x = MARGIN;
  doc.y = boxY + boxH + 14;
}

function drawItem(doc: PDFKit.PDFDocument, item: ReportItem, contentWidth: number): void {
  ensureSpace(doc, 40);
  const meta = responseMeta(item.response);
  const top = doc.y;

  // Number + label (left), response label (right, colored).
  const numW = 24;
  const respW = 70;
  const labelW = contentWidth - numW - respW - 8;
  doc.font("Courier").fontSize(9).fillColor(COLORS.faint)
    .text(String(item.index).padStart(2, "0"), MARGIN, top + 1, { width: numW, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.ink)
    .text(item.label, MARGIN + numW, top, { width: labelW });
  const labelBottom = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(meta.color)
    .text(meta.label, MARGIN + numW + labelW + 8, top, { width: respW, align: "right", lineBreak: false });

  doc.y = Math.max(labelBottom, top + 12);

  // Required / Critical badges (text, compact).
  const badges: string[] = [];
  if (item.isRequired) badges.push("Required");
  if (item.isCritical) badges.push("Critical");
  if (badges.length) {
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.faint)
      .text(badges.join("  ·  "), MARGIN + numW, doc.y, { width: labelW });
  }

  // Notes.
  if (item.notes?.trim()) {
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.body)
      .text(item.notes.trim(), MARGIN + numW, doc.y, { width: contentWidth - numW });
  }

  // Photo evidence.
  if (item.photos.length) {
    doc.moveDown(0.3);
    for (const photo of item.photos) drawPhoto(doc, photo, contentWidth);
  }

  doc.moveDown(0.5);
  doc.x = MARGIN;
}

function drawSection(doc: PDFKit.PDFDocument, section: ReportSection, contentWidth: number): void {
  ensureSpace(doc, 50);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.primary)
    .text(section.name.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.25);
  hairline(doc, contentWidth);
  doc.moveDown(0.6);
  for (const item of section.items) drawItem(doc, item, contentWidth);
}

// Build the report. Returns the doc with all content written but NOT ended — the caller
// attaches a sink and calls doc.end(). bufferPages keeps every page addressable for the
// page-number footer pass.
export function buildCheckReportPdf(model: CheckReportModel): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const contentWidth = doc.page.width - MARGIN * 2;

  drawHeader(doc, model, contentWidth);
  drawSummary(doc, model, contentWidth);

  if (model.sections.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(COLORS.muted)
      .text("This check has no checklist items.", MARGIN, doc.y, { width: contentWidth });
  } else {
    for (const section of model.sections) drawSection(doc, section, contentWidth);
  }

  if (model.engineerSummary?.trim()) drawNarrative(doc, "Engineer summary", model.engineerSummary, contentWidth);
  if (model.reviewerNotes?.trim()) drawNarrative(doc, "Reviewer notes", model.reviewerNotes, contentWidth);

  drawFooters(doc, { reference: model.reference, generatedAt: model.generatedAt });
  return doc;
}
