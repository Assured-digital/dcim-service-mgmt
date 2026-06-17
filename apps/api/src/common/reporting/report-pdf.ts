// Server-side PDF builder for a finalised Check — the shareable compliance/evidence
// document. Sibling to csv.ts: a pure builder with NO Nest/Prisma deps. Given a fully
// assembled model (incl. already-fetched image bytes), it lays out the document and
// returns the PDFKit doc WITHOUT calling end() — the caller attaches a sink (buffer or
// response) and ends it (so chunks are never dropped to an un-consumed Readable).
//
// pdfkit is pure-JS (no native modules) and bundles its standard Helvetica fonts, so the
// Dockerfile is unchanged. It can embed PNG/JPEG natively ONLY — GIF/WebP/PDF evidence
// (also on the attachment allow-list) is rendered as a text reference, not an image.
import PDFDocument = require("pdfkit");

// ── Model (assembled by checks-report.service from the clientId-scoped check) ──────────

export type ReportPhoto = {
  caption: string | null;
  filename: string;
  uploadedAt: string; // ISO
  contentType: string;
  // Decoded bytes for an embeddable image (png/jpeg). null when not embeddable or the
  // tenant-scoped fetch failed — rendered as a text reference instead of an image.
  bytes: Buffer | null;
};

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

// ── Palette (aligned with the app's design tokens) ────────────────────────────────────
const COLORS = {
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  hair: "#e2e8f0",
  primary: "#1d4ed8",
  pass: "#15803d",
  fail: "#b91c1c",
  na: "#475569"
};

const RESPONSE_META: Record<string, { label: string; color: string }> = {
  PASS: { label: "PASS", color: COLORS.pass },
  FAIL: { label: "FAIL", color: COLORS.fail },
  NA: { label: "N/A", color: COLORS.na }
};
function responseMeta(r: string | null): { label: string; color: string } {
  return (r && RESPONSE_META[r]) || { label: "Not answered", color: COLORS.faint };
}

// ── Date helpers (en-GB; node:20 ships full ICU) ──────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

// ── Layout primitives ─────────────────────────────────────────────────────────────────
const MARGIN = 50;
const PHOTO_BOX_W = 200;
const PHOTO_BOX_H = 150;

// Add a page if `needed` points of vertical space don't remain before the bottom margin.
// Used to keep an item header / image with what follows it instead of orphaning across a
// page break (pdfkit auto-breaks flowing text, but image placement is manual).
function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function hairline(doc: PDFKit.PDFDocument, contentWidth: number): void {
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + contentWidth, doc.y)
    .lineWidth(0.5)
    .strokeColor(COLORS.hair)
    .stroke();
}

// ── Sections of the document ──────────────────────────────────────────────────────────

function drawHeader(doc: PDFKit.PDFDocument, m: CheckReportModel, contentWidth: number): void {
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.primary)
    .text("ASSURED DIGITAL · CHECK REPORT", MARGIN, MARGIN, { characterSpacing: 0.5 });
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(19).fillColor(COLORS.ink).text(m.title, { width: contentWidth });
  doc.moveDown(0.25);
  doc.font("Courier").fontSize(10).fillColor(COLORS.muted)
    .text(`${m.reference}   ·   ${m.statusLabel}   ·   ${m.checkType}`, { width: contentWidth });
  doc.moveDown(0.6);
  hairline(doc, contentWidth);
  doc.moveDown(0.7);

  // Two-column metadata grid: label (faint) above value (ink) per cell.
  const pairs: Array<[string, string]> = [
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
  ];
  const colGap = 26;
  const colW = (contentWidth - colGap) / 2;
  const cellH = 30;
  const startY = doc.y;
  const rows = Math.ceil(pairs.length / 2);
  pairs.forEach((pair, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = MARGIN + col * (colW + colGap);
    const cy = startY + row * cellH;
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.faint)
      .text(pair[0].toUpperCase(), cx, cy, { width: colW, characterSpacing: 0.4 });
    doc.font("Helvetica").fontSize(11).fillColor(COLORS.ink)
      .text(pair[1], cx, cy + 10.5, { width: colW, ellipsis: true, lineBreak: false });
  });
  doc.y = startY + rows * cellH;
  doc.x = MARGIN;
  doc.moveDown(0.4);
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

function drawPhoto(doc: PDFKit.PDFDocument, photo: ReportPhoto, contentWidth: number): void {
  const indent = MARGIN + 18;
  const captionW = contentWidth - 18;
  // Caption falls back to filename + capture date — consistent with the on-screen
  // evidence cards (caption when set, else "<filename> · <date>").
  const captionText = photo.caption?.trim()
    ? photo.caption.trim()
    : `${photo.filename} · ${fmtDate(photo.uploadedAt)}`;

  if (photo.bytes) {
    ensureSpace(doc, PHOTO_BOX_H + 26);
    const top = doc.y;
    try {
      // fit scales within the box preserving aspect ratio; we advance y by the fixed box
      // height so layout/page-breaks stay deterministic without decoding image dimensions.
      doc.image(photo.bytes, indent, top, { fit: [PHOTO_BOX_W, PHOTO_BOX_H] });
    } catch {
      // A corrupt/undecodable image must never break the whole report — fall back to text.
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLORS.muted)
        .text(`[image could not be rendered] ${captionText}`, indent, top, { width: captionW });
      doc.moveDown(0.5);
      return;
    }
    doc.y = top + PHOTO_BOX_H + 4;
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.body)
      .text(captionText, indent, doc.y, { width: PHOTO_BOX_W });
    doc.moveDown(0.6);
  } else {
    // Non-embeddable evidence (GIF/WebP/PDF): reference it without an image.
    ensureSpace(doc, 26);
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted)
      .text(`▢ ${captionText}  (${photo.contentType} — view in app)`, indent, doc.y, { width: captionW });
    doc.moveDown(0.4);
  }
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

function drawNarrative(doc: PDFKit.PDFDocument, title: string, body: string, contentWidth: number): void {
  ensureSpace(doc, 60);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.primary)
    .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.25);
  hairline(doc, contentWidth);
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.body).text(body.trim(), MARGIN, doc.y, { width: contentWidth });
  doc.moveDown(0.4);
}

function drawFooters(doc: PDFKit.PDFDocument, m: CheckReportModel): void {
  // bufferPages mode (set in options) lets us stamp "Page X of Y" once the total is known.
  // bufferedPageRange() isn't in @types/pdfkit but is a stable pdfkit runtime API.
  const range = (doc as unknown as {
    bufferedPageRange(): { start: number; count: number };
  }).bufferedPageRange();
  const generated = `Generated ${fmtDateTime(m.generatedAt)}`;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - doc.page.margins.bottom + 18;
    const w = doc.page.width - MARGIN * 2;
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.faint);
    doc.text(generated, MARGIN, y, { width: w / 2, lineBreak: false });
    doc.text(`${m.reference}   ·   Page ${i + 1} of ${range.count}`, MARGIN + w / 2, y, {
      width: w / 2, align: "right", lineBreak: false
    });
  }
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

  drawFooters(doc, model);
  return doc;
}
