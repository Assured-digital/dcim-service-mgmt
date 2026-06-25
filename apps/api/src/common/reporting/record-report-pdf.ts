// Server-side PDF builder for a single work-item record (Service Request, Incident,
// Change, Risk, Issue, Task). Sibling to report-pdf.ts (the Check report) — a pure builder
// with NO Nest/Prisma deps. Given a fully assembled, per-type-mapped model (incl. already
// fetched attachment bytes), it lays out the document and returns the PDFKit doc WITHOUT
// calling end() — the caller attaches a sink and ends it.
//
// One UNIFORM layout for every record type: a branded header + metadata grid, narrative
// sections (Description + per-type fields like rollback plan / mitigation), a linked-records
// list, then attachments (PNG/JPEG embedded, GIF/WebP/PDF text-referenced). Per-type
// variation is entirely in WHICH meta pairs and sections record-report.service emits — the
// layout itself never branches on type. All chrome is shared from report-kit.ts.
import PDFDocument = require("pdfkit");
import {
  COLORS,
  MARGIN,
  MetaPair,
  ReportPhoto,
  drawDocHeader,
  drawFooters,
  drawNarrative,
  drawPhoto,
  ensureSpace,
  hairline
} from "./report-kit";

export type RecordReportSection = {
  heading: string;
  body?: string | null; // empty/blank bodies are skipped, so optional per-type fields never render an empty heading
};

export type RecordReportLink = {
  ref: string;
  title: string;
  status: string;
};

export type RecordReportModel = {
  brand: string; // e.g. "ASSURED DIGITAL · INCIDENT"
  reference: string;
  title: string;
  statusLabel: string;
  subtitle: string; // composed header line, e.g. `${reference} · ${statusLabel} · ${typeLabel}`
  metaPairs: MetaPair[]; // Details grid (Priority, Severity, Assignee, Created by, dates…)
  sections: RecordReportSection[];
  linkedRecords: RecordReportLink[];
  attachments: ReportPhoto[];
  generatedAt: string; // ISO
};

// Section heading + hairline, matching drawNarrative's / drawSection's idiom (report-pdf).
function sectionHeading(doc: PDFKit.PDFDocument, title: string, contentWidth: number): void {
  ensureSpace(doc, 50);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.primary)
    .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.25);
  hairline(doc, contentWidth);
  doc.moveDown(0.5);
}

function drawLinkedRecords(doc: PDFKit.PDFDocument, links: RecordReportLink[], contentWidth: number): void {
  sectionHeading(doc, "Linked records", contentWidth);
  for (const l of links) {
    ensureSpace(doc, 16);
    doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.body)
      .text(`${l.ref}   ·   ${l.title}   (${l.status})`, MARGIN, doc.y, { width: contentWidth });
  }
  doc.moveDown(0.2);
}

function drawAttachmentsSection(doc: PDFKit.PDFDocument, photos: ReportPhoto[], contentWidth: number): void {
  sectionHeading(doc, "Attachments", contentWidth);
  for (const p of photos) drawPhoto(doc, p, contentWidth);
  doc.moveDown(0.2);
}

// Build the record report. Returns the doc with all content written but NOT ended — the
// caller attaches a sink and calls doc.end(). bufferPages keeps every page addressable for
// the page-number footer pass.
export function buildRecordReportPdf(model: RecordReportModel): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const contentWidth = doc.page.width - MARGIN * 2;

  drawDocHeader(
    doc,
    { brand: model.brand, title: model.title, subtitle: model.subtitle, pairs: model.metaPairs },
    contentWidth
  );

  for (const s of model.sections) {
    const body = s.body?.trim();
    if (body) drawNarrative(doc, s.heading, body, contentWidth);
  }

  if (model.linkedRecords.length) drawLinkedRecords(doc, model.linkedRecords, contentWidth);
  if (model.attachments.length) drawAttachmentsSection(doc, model.attachments, contentWidth);

  drawFooters(doc, { reference: model.reference, generatedAt: model.generatedAt });
  return doc;
}
