// Shared report orchestration helpers: resolve attachments to embeddable photo bytes and
// render a built PDFKit doc to a Buffer. Lifted from checks-report.service so both the
// Check report and the per-record export use one tenant-scoped image path and one sink.
import type { Readable } from "stream";
import type { AttachmentsService } from "../../attachments/attachments.service";
import { ReportPhoto } from "./report-kit";

// pdfkit embeds PNG/JPEG natively; everything else on the attachment allow-list
// (GIF/WebP/PDF) is referenced as text rather than embedded.
export const EMBEDDABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Resolve each attachment to a ReportPhoto. Image bytes for embeddable types are fetched
// through the tenant-scoped download path (openForDownload re-checks clientId); a
// byte-fetch failure degrades that one photo to a text reference (bytes null) rather than
// failing the whole report. clientId is the tenant chokepoint here.
export async function assemblePhotos(
  attachments: AttachmentsService,
  clientId: string,
  list: Array<{
    id: string;
    filename: string;
    contentType: string;
    caption: string | null;
    uploadedAt: string;
  }>
): Promise<ReportPhoto[]> {
  return Promise.all(
    list.map(async (att) => {
      let bytes: Buffer | null = null;
      if (EMBEDDABLE_IMAGE_TYPES.has(att.contentType)) {
        try {
          const { stream } = await attachments.openForDownload(clientId, att.id);
          bytes = await streamToBuffer(stream);
        } catch {
          bytes = null; // fall back to a text reference for this photo only
        }
      }
      return {
        caption: att.caption,
        filename: att.filename,
        uploadedAt: att.uploadedAt,
        contentType: att.contentType,
        bytes
      };
    })
  );
}

// Render a built (but NOT-yet-ended) PDFKit doc to a single Buffer: attach the data sink
// BEFORE end() so no chunk is dropped to an un-consumed Readable.
export function renderToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
