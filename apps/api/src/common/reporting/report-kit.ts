// Reusable server-side PDF chrome — the document primitives shared by every report
// builder (the finalised-Check evidence report and the per-record export). Pure layout
// helpers with NO Nest/Prisma deps: palette, date formatting, page-break management, the
// hairline rule, a flowing narrative block, image/photo embedding, the branded document
// header + two-column metadata grid, and the page-number footer pass.
//
// These bodies were extracted VERBATIM from report-pdf.ts (the original Check report) so
// the Check document keeps rendering byte-identically; report-pdf.ts now imports them.
// pdfkit is pure-JS and bundles Helvetica, so the Dockerfile is unchanged.
//
// This module never constructs a PDFDocument (callers do) — it only needs the global
// PDFKit.PDFDocument type from @types/pdfkit.

// ── Palette (aligned with the app's design tokens) ────────────────────────────────────
export const COLORS = {
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

// ── Layout constants ──────────────────────────────────────────────────────────────────
export const MARGIN = 50;
export const PHOTO_BOX_W = 200;
export const PHOTO_BOX_H = 150;

// ── Shared model fragment ─────────────────────────────────────────────────────────────
// A resolved attachment ready to render: embeddable image bytes (png/jpeg) or null when
// not embeddable / the tenant-scoped fetch failed — rendered as a text reference instead.
export type ReportPhoto = {
  caption: string | null;
  filename: string;
  uploadedAt: string; // ISO
  contentType: string;
  bytes: Buffer | null;
};

// Label/value cell for the header metadata grid.
export type MetaPair = [label: string, value: string];

// ── Date helpers (en-GB; node:20 ships full ICU) ──────────────────────────────────────
export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

// ── Layout primitives ─────────────────────────────────────────────────────────────────

// Add a page if `needed` points of vertical space don't remain before the bottom margin.
// Used to keep an item header / image with what follows it instead of orphaning across a
// page break (pdfkit auto-breaks flowing text, but image placement is manual).
export function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

export function hairline(doc: PDFKit.PDFDocument, contentWidth: number): void {
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + contentWidth, doc.y)
    .lineWidth(0.5)
    .strokeColor(COLORS.hair)
    .stroke();
}

// ── Branded header + metadata grid ────────────────────────────────────────────────────

// Two-column metadata grid: label (faint) above value (ink) per cell. Extracted verbatim
// from the original drawHeader so the Check header is unchanged; now also feeds the record
// export header. Advances doc.y past the grid.
export function drawMetaGrid(doc: PDFKit.PDFDocument, pairs: MetaPair[], contentWidth: number): void {
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

// Branded document header: kicker brand line, bold title, a muted subtitle (reference ·
// status · type), a hairline, then the metadata grid. The exact spacing/fonts are the
// original Check header's, parameterised only by brand/title/subtitle/pairs.
export function drawDocHeader(
  doc: PDFKit.PDFDocument,
  opts: { brand: string; title: string; subtitle: string; pairs: MetaPair[] },
  contentWidth: number
): void {
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.primary)
    .text(opts.brand, MARGIN, MARGIN, { characterSpacing: 0.5 });
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(19).fillColor(COLORS.ink).text(opts.title, { width: contentWidth });
  doc.moveDown(0.25);
  doc.font("Courier").fontSize(10).fillColor(COLORS.muted)
    .text(opts.subtitle, { width: contentWidth });
  doc.moveDown(0.6);
  hairline(doc, contentWidth);
  doc.moveDown(0.7);
  drawMetaGrid(doc, opts.pairs, contentWidth);
}

// ── Narrative + photo blocks ──────────────────────────────────────────────────────────

export function drawNarrative(doc: PDFKit.PDFDocument, title: string, body: string, contentWidth: number): void {
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

export function drawPhoto(doc: PDFKit.PDFDocument, photo: ReportPhoto, contentWidth: number): void {
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

// ── Footer / page numbering ───────────────────────────────────────────────────────────

// Stamp "Page X of Y" + a generated-at line on every page. Requires the doc to have been
// created with bufferPages: true so the total page count is known. Generalised from the
// original Check footer to take { reference, generatedAt } instead of a CheckReportModel.
export function drawFooters(
  doc: PDFKit.PDFDocument,
  opts: { reference: string; generatedAt: string }
): void {
  // bufferPages mode (set in options) lets us stamp "Page X of Y" once the total is known.
  // bufferedPageRange() isn't in @types/pdfkit but is a stable pdfkit runtime API.
  const range = (doc as unknown as {
    bufferedPageRange(): { start: number; count: number };
  }).bufferedPageRange();
  const generated = `Generated ${fmtDateTime(opts.generatedAt)}`;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottomMargin = doc.page.margins.bottom;
    const y = doc.page.height - bottomMargin + 18;
    const w = doc.page.width - MARGIN * 2;
    // The footer sits 18pt INTO the bottom margin. Writing text below the content area
    // makes pdfkit's line-wrapper auto-paginate (continueOnNewPage), appending a blank
    // page per footer line. Temporarily zero the bottom margin so the whole page is
    // writable and the stamp never triggers a page break; restore it afterwards.
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.faint);
    doc.text(generated, MARGIN, y, { width: w / 2, lineBreak: false });
    doc.text(`${opts.reference}   ·   Page ${i + 1} of ${range.count}`, MARGIN + w / 2, y, {
      width: w / 2, align: "right", lineBreak: false
    });
    doc.page.margins.bottom = bottomMargin;
  }
}
