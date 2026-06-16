import { PrismaService } from "../prisma/prisma.service";
import { AttachmentRecordType } from "../record-links/resolve-links";
import { isInlineType } from "./content-policy";

// Minimal, frontend-facing view of an attachment row. `inline` tells the UI whether
// a download will render in-browser (the server makes the authoritative decision at
// download time from the same allow-list).
export type AttachmentSummary = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  inline: boolean;
};

// Resolve every attachment on (recordType, recordId) for the scoped client, newest
// first. clientId in the where is the tenant chokepoint — attachments from another
// client can never be resolved into this record. Mirrors resolveLinkedRecords.
export async function resolveAttachments(
  prisma: PrismaService,
  clientId: string,
  recordType: AttachmentRecordType,
  recordId: string
): Promise<AttachmentSummary[]> {
  const rows = await prisma.attachment.findMany({
    where: { clientId, recordType, recordId },
    orderBy: { createdAt: "desc" }
  });
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    contentType: r.contentType,
    size: r.size,
    uploadedAt: r.createdAt.toISOString(),
    inline: isInlineType(r.contentType)
  }));
}

// Batch variant of resolveAttachments: resolve attachments for MANY recordIds of one
// type in a single query, grouped by recordId (newest-first within each group). Same
// clientId chokepoint as the single resolver. Used to graft per-item attachments onto
// a record's children (e.g. each CheckItem on a Check) without an N+1 of single calls.
export async function resolveAttachmentsForRecords(
  prisma: PrismaService,
  clientId: string,
  recordType: AttachmentRecordType,
  recordIds: string[]
): Promise<Map<string, AttachmentSummary[]>> {
  const grouped = new Map<string, AttachmentSummary[]>();
  if (recordIds.length === 0) return grouped;
  const rows = await prisma.attachment.findMany({
    where: { clientId, recordType, recordId: { in: recordIds } },
    orderBy: { createdAt: "desc" }
  });
  for (const r of rows) {
    const summary: AttachmentSummary = {
      id: r.id,
      filename: r.filename,
      contentType: r.contentType,
      size: r.size,
      uploadedAt: r.createdAt.toISOString(),
      inline: isInlineType(r.contentType)
    };
    const list = grouped.get(r.recordId);
    if (list) list.push(summary);
    else grouped.set(r.recordId, [summary]);
  }
  return grouped;
}
