import { BadRequestException, Injectable } from "@nestjs/common";
import { CheckStatus } from "@prisma/client";
import type { Readable } from "stream";
import { ChecksService } from "./checks.service";
import { AttachmentsService } from "../attachments/attachments.service";
import {
  buildCheckReportPdf,
  CheckReportModel,
  ReportItem,
  ReportPhoto,
  ReportSection
} from "../common/reporting/report-pdf";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  PENDING_REVIEW: "Pending review",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled"
};

// pdfkit embeds PNG/JPEG natively; everything else on the attachment allow-list
// (GIF/WebP/PDF) is referenced as text rather than embedded.
const EMBEDDABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Mirrors ChecksService.calcPassRate — a CLOSED check whose passRate wasn't persisted
// still gets a correct figure rather than a misleading blank.
function calcPassRate(items: { response: string | null }[]): number | null {
  const answered = items.filter((i) => i.response !== null);
  if (answered.length === 0) return null;
  const countable = answered.filter((i) => i.response !== "NA");
  if (countable.length === 0) return 100;
  const passCount = countable.filter((i) => i.response === "PASS").length;
  return Math.round((passCount / countable.length) * 100);
}

@Injectable()
export class ChecksReportService {
  constructor(
    private checks: ChecksService,
    private attachments: AttachmentsService
  ) {}

  // Generate the shareable evidence PDF for a finalised check. Gated on COMPLETED/CLOSED.
  // ALL data flows through clientId-scoped paths: getForClient (where: { id, clientId })
  // assembles the check + items + captioned attachments, and every embedded image byte is
  // fetched via AttachmentsService.openForDownload(clientId, …) which re-checks
  // where: { id, clientId } — so a report can never surface another tenant's check or image.
  async generatePdf(clientId: string, id: string): Promise<{ filename: string; buffer: Buffer }> {
    const check = await this.checks.getForClient(clientId, id);
    if (check.status !== CheckStatus.COMPLETED && check.status !== CheckStatus.CLOSED) {
      throw new BadRequestException("A report is only available for completed checks");
    }

    const model = await this.assembleModel(clientId, check);
    const buffer = await this.renderToBuffer(model);
    return { filename: `check-${check.reference}.pdf`, buffer };
  }

  private async assembleModel(
    clientId: string,
    check: Awaited<ReturnType<ChecksService["getForClient"]>>
  ): Promise<CheckReportModel> {
    // Group items by section, preserving the sortOrder-ascending order getForClient set
    // and first-seen section order. Display number restarts per section (matches the UI).
    const sectionMap = new Map<string, ReportItem[]>();
    for (const item of check.items) {
      const sectionName = item.section ?? "General";
      let bucket = sectionMap.get(sectionName);
      if (!bucket) {
        bucket = [];
        sectionMap.set(sectionName, bucket);
      }
      const photos = await this.assemblePhotos(clientId, item.attachments ?? []);
      bucket.push({
        index: bucket.length + 1,
        label: item.label,
        response: item.response,
        notes: item.notes,
        isRequired: item.isRequired,
        isCritical: item.isCritical,
        photos
      });
    }
    const sections: ReportSection[] = Array.from(sectionMap.entries()).map(([name, items]) => ({
      name,
      items
    }));

    const items = check.items;
    const summary = {
      total: items.length,
      answered: items.filter((i) => i.response !== null).length,
      pass: items.filter((i) => i.response === "PASS").length,
      fail: items.filter((i) => i.response === "FAIL").length,
      na: items.filter((i) => i.response === "NA").length,
      pending: items.filter((i) => i.response === null).length
    };

    return {
      reference: check.reference,
      title: check.title,
      status: check.status,
      statusLabel: STATUS_LABELS[check.status] ?? check.status,
      checkType: check.checkType,
      priority: check.priority,
      siteName: check.site?.name ?? "—",
      templateName: check.template?.name ?? "—",
      assigneeName: check.assignee?.displayName ?? null,
      reviewerName: check.reviewer?.displayName ?? null,
      scheduledAt: toIso(check.scheduledAt),
      startedAt: toIso(check.startedAt),
      submittedAt: toIso(check.submittedAt),
      completedAt: toIso(check.completedAt),
      closedAt: toIso(check.closedAt),
      engineerSummary: check.engineerSummary,
      reviewerNotes: check.reviewerNotes,
      passRate: check.passRate ?? calcPassRate(items),
      summary,
      sections,
      generatedAt: new Date().toISOString()
    };
  }

  // Resolve each per-item attachment to a ReportPhoto. Image bytes for embeddable types
  // are fetched through the tenant-scoped download path (openForDownload re-checks
  // clientId); a byte-fetch failure degrades that one photo to a text reference (bytes
  // null) rather than failing the whole report. clientId is the tenant chokepoint here.
  private async assemblePhotos(
    clientId: string,
    attachments: Array<{
      id: string;
      filename: string;
      contentType: string;
      caption: string | null;
      uploadedAt: string;
    }>
  ): Promise<ReportPhoto[]> {
    return Promise.all(
      attachments.map(async (att) => {
        let bytes: Buffer | null = null;
        if (EMBEDDABLE_IMAGE_TYPES.has(att.contentType)) {
          try {
            const { stream } = await this.attachments.openForDownload(clientId, att.id);
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

  // Render the built doc to a single Buffer: attach the data sink BEFORE end() so no chunk
  // is dropped to an un-consumed Readable, then send it like the CSV export's body.
  private renderToBuffer(model: CheckReportModel): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = buildCheckReportPdf(model);
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    });
  }
}
