import { PrismaService } from "../prisma/prisma.service";

// The six work-item record types that can be soft-linked. Stored verbatim in
// RecordLink.aType/bType, so these string literals are the on-the-wire contract.
export const LINK_RECORD_TYPES = [
  "incident",
  "service_request",
  "change",
  "task",
  "risk",
  "issue"
] as const;

export type LinkRecordType = (typeof LINK_RECORD_TYPES)[number];

export function isLinkRecordType(value: unknown): value is LinkRecordType {
  return typeof value === "string" && (LINK_RECORD_TYPES as readonly string[]).includes(value);
}

// Attachments accept the six link types PLUS Maintenance and Check. This list is
// deliberately SEPARATE from LINK_RECORD_TYPES: extending it makes those records
// attachable WITHOUT making them linkable (record-links still validates against the
// six). The record resolver below understands all eight.
export const ATTACHMENT_RECORD_TYPES = [
  ...LINK_RECORD_TYPES,
  "maintenance",
  "check"
] as const;

export type AttachmentRecordType = (typeof ATTACHMENT_RECORD_TYPES)[number];

// Minimal cross-type summary of a linkable record. `title` is normalised — Service
// Requests store theirs in `subject`; the rest use `title`.
export type LinkRecordSummary = {
  type: AttachmentRecordType;
  id: string;
  reference: string;
  title: string;
  status: string;
};

// A summary plus the RecordLink row id, so the frontend can unlink without
// recomputing the canonical endpoint ordering.
export type ResolvedLink = LinkRecordSummary & { linkId: string };

// Single source of truth for "type -> Prisma model" resolution. Every query is
// scoped by clientId (the tenant chokepoint): a record from another client can
// never be resolved, searched, or validated into the current scope — and for Risk
// / Issue (nullable clientId) a concrete clientId in the where excludes null-client
// rows too. Used by both the resolver (ids) and the search endpoint (q).
async function queryRecords(
  prisma: PrismaService,
  clientId: string,
  type: AttachmentRecordType,
  opts: { ids?: string[]; q?: string; take?: number }
): Promise<LinkRecordSummary[]> {
  if (opts.ids && opts.ids.length === 0) return [];
  const term = opts.q?.trim();
  const take = opts.take;
  const idWhere = opts.ids ? { id: { in: opts.ids } } : {};
  const textWhere = (titleField: "title" | "subject") =>
    term
      ? {
          OR: [
            { reference: { contains: term, mode: "insensitive" as const } },
            { [titleField]: { contains: term, mode: "insensitive" as const } }
          ]
        }
      : {};
  const orderBy = { updatedAt: "desc" as const };

  switch (type) {
    case "incident": {
      const rows = await prisma.incident.findMany({
        where: { clientId, ...idWhere, ...textWhere("title") },
        select: { id: true, reference: true, title: true, status: true },
        orderBy,
        take
      });
      return rows.map((r) => ({ type, id: r.id, reference: r.reference, title: r.title, status: r.status }));
    }
    case "service_request": {
      const rows = await prisma.serviceRequest.findMany({
        where: { clientId, ...idWhere, ...textWhere("subject") },
        select: { id: true, reference: true, subject: true, status: true },
        orderBy,
        take
      });
      return rows.map((r) => ({ type, id: r.id, reference: r.reference, title: r.subject, status: r.status }));
    }
    case "change": {
      const rows = await prisma.changeRequest.findMany({
        where: { clientId, ...idWhere, ...textWhere("title") },
        select: { id: true, reference: true, title: true, status: true },
        orderBy,
        take
      });
      return rows.map((r) => ({ type, id: r.id, reference: r.reference, title: r.title, status: r.status }));
    }
    case "task": {
      const rows = await prisma.task.findMany({
        where: { clientId, ...idWhere, ...textWhere("title") },
        select: { id: true, reference: true, title: true, status: true },
        orderBy,
        take
      });
      return rows.map((r) => ({ type, id: r.id, reference: r.reference, title: r.title, status: r.status }));
    }
    case "risk": {
      const rows = await prisma.risk.findMany({
        where: { clientId, ...idWhere, ...textWhere("title") },
        select: { id: true, reference: true, title: true, status: true },
        orderBy,
        take
      });
      return rows.map((r) => ({ type, id: r.id, reference: r.reference, title: r.title, status: r.status }));
    }
    case "issue": {
      const rows = await prisma.issue.findMany({
        where: { clientId, ...idWhere, ...textWhere("title") },
        select: { id: true, reference: true, title: true, status: true },
        orderBy,
        take
      });
      return rows.map((r) => ({ type, id: r.id, reference: r.reference, title: r.title, status: r.status }));
    }
    case "check": {
      // Check is directly client-scoped and has reference/title/status — identical
      // shape to the six work-item types.
      const rows = await prisma.check.findMany({
        where: { clientId, ...idWhere, ...textWhere("title") },
        select: { id: true, reference: true, title: true, status: true },
        orderBy,
        take
      });
      return rows.map((r) => ({ type, id: r.id, reference: r.reference, title: r.title, status: r.status }));
    }
    case "maintenance": {
      // MaintenanceLog has NO clientId/reference/title/status — it is an audit-log
      // shape, tenant-scoped THROUGH its Asset (asset.clientId), exactly as
      // MaintenanceService.getForClient does. A concrete clientId in asset:{clientId}
      // excludes null-client (internal-asset) logs, same safety as Risk/Issue's
      // nullable clientId. The summary is synthesised — these fields are never
      // surfaced for attachments, which only use this resolver as an existence/
      // tenant check (and maintenance is not linkable, so the picker never sees it).
      const rows = await prisma.maintenanceLog.findMany({
        where: { asset: { clientId }, ...idWhere },
        select: { id: true, workType: true, workTypeOther: true },
        orderBy,
        take
      });
      return rows.map((r) => ({ type, id: r.id, reference: "", title: r.workTypeOther ?? r.workType, status: "" }));
    }
  }
}

// Resolve a single record's summary (for validating a link endpoint exists within
// the scoped client). Returns null if the record does not exist in this client.
export async function resolveRecordSummary(
  prisma: PrismaService,
  clientId: string,
  type: AttachmentRecordType,
  id: string
): Promise<LinkRecordSummary | null> {
  const [rec] = await queryRecords(prisma, clientId, type, { ids: [id] });
  return rec ?? null;
}

// Batch-resolve many ids of ONE type within the scoped client (one query). Used by
// the audit grid to turn entityType+entityId into a human reference/title for events
// (e.g. UPDATED/STATUS_UPDATED) that don't carry a denormalised reference.
export async function resolveRecordSummaries(
  prisma: PrismaService,
  clientId: string,
  type: AttachmentRecordType,
  ids: string[]
): Promise<LinkRecordSummary[]> {
  return queryRecords(prisma, clientId, type, { ids });
}

// Search linkable records of one type within the scoped client (powers the picker).
export async function searchRecords(
  prisma: PrismaService,
  clientId: string,
  type: LinkRecordType,
  q: string | undefined,
  take = 20
): Promise<LinkRecordSummary[]> {
  return queryRecords(prisma, clientId, type, { q, take });
}

// Resolve every link touching (recordType, recordId) for the scoped client into
// the OTHER endpoint's summary. Bidirectional: a record can sit in either endpoint
// position, so both positions are queried. Stale links (target deleted) are dropped.
export async function resolveLinkedRecords(
  prisma: PrismaService,
  clientId: string,
  recordType: LinkRecordType,
  recordId: string
): Promise<ResolvedLink[]> {
  const rows = await prisma.recordLink.findMany({
    where: {
      clientId,
      OR: [
        { aType: recordType, aId: recordId },
        { bType: recordType, bId: recordId }
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  // Pick the opposite endpoint of each link, keeping its linkId.
  const others = rows
    .map((row) => {
      const matchedA = row.aType === recordType && row.aId === recordId;
      const type = matchedA ? row.bType : row.aType;
      const id = matchedA ? row.bId : row.aId;
      return { linkId: row.id, type, id };
    })
    .filter((o): o is { linkId: string; type: LinkRecordType; id: string } => isLinkRecordType(o.type));

  // Batch-resolve summaries per type.
  const byType = new Map<LinkRecordType, string[]>();
  for (const o of others) {
    byType.set(o.type, [...(byType.get(o.type) ?? []), o.id]);
  }
  const summaries = new Map<string, LinkRecordSummary>();
  for (const [type, ids] of byType) {
    const recs = await queryRecords(prisma, clientId, type, { ids });
    for (const r of recs) summaries.set(`${r.type}:${r.id}`, r);
  }

  // Re-join in link order, dropping any whose target no longer exists.
  const resolved: ResolvedLink[] = [];
  for (const o of others) {
    const summary = summaries.get(`${o.type}:${o.id}`);
    if (summary) resolved.push({ linkId: o.linkId, ...summary });
  }
  return resolved;
}

// Canonical endpoint ordering — makes a bidirectional link unique regardless of the
// direction it was created in. The smaller "type:id" string becomes endpoint A.
export function canonicalLinkEndpoints(
  t1: LinkRecordType,
  id1: string,
  t2: LinkRecordType,
  id2: string
): { aType: LinkRecordType; aId: string; bType: LinkRecordType; bId: string } {
  const k1 = `${t1}:${id1}`;
  const k2 = `${t2}:${id2}`;
  if (k1 <= k2) return { aType: t1, aId: id1, bType: t2, bId: id2 };
  return { aType: t2, aId: id2, bType: t1, bId: id1 };
}
