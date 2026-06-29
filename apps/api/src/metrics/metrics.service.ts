import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { applyAssignedScope, type ScopeViewer } from "../auth/role-scope";

type Bucket = "day" | "week" | "month";

// A resolved work-item, reduced to the only fields the trend metrics need. resolvedAt is the honest
// resolution timestamp (see resolved-status.ts) — non-null because we only query resolved records.
type ResolvedRow = { createdAt: Date; resolvedAt: Date; dueAt: Date | null };

export type MttrBucket = { bucketStart: string; count: number; meanMs: number | null; medianMs: number | null };
export type SlaComplianceBucket = { bucketStart: string; met: number; breached: number; total: number };

const DAY_MS = 24 * 60 * 60 * 1000;

// Truncate to the UTC start of the record's bucket. Week starts Monday (UTC).
function bucketStart(d: Date, bucket: Bucket): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (bucket === "month") return new Date(Date.UTC(y, m, 1));
  if (bucket === "week") {
    const base = new Date(Date.UTC(y, m, day));
    const dow = base.getUTCDay(); // 0=Sun..6=Sat
    const backToMonday = (dow + 6) % 7;
    return new Date(base.getTime() - backToMonday * DAY_MS);
  }
  return new Date(Date.UTC(y, m, day));
}

function nextBucket(d: Date, bucket: Bucket): Date {
  if (bucket === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  if (bucket === "week") return new Date(d.getTime() + 7 * DAY_MS);
  return new Date(d.getTime() + DAY_MS);
}

// Contiguous bucket starts spanning [from, to] inclusive of the bucket containing `from`, so the
// series has no gaps and empty buckets render as honest zero/empty points rather than a misleading
// straight line across missing data.
function bucketRange(from: Date, to: Date, bucket: Bucket): Date[] {
  const out: Date[] = [];
  let cur = bucketStart(from, bucket);
  const end = to.getTime();
  while (cur.getTime() <= end) {
    out.push(cur);
    cur = nextBucket(cur, bucket);
  }
  return out;
}

function median(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

@Injectable()
export class MetricsService {
  constructor(private prisma: PrismaService) {}

  // Resolve the window + granularity from the raw query (defaults: last 30 days, by day).
  private window(from?: string, to?: string, bucket?: Bucket) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * DAY_MS);
    return { fromDate, toDate, bucket: bucket ?? "day" };
  }

  // SR + INC resolved within the window. dueAt-driven SLA applies to these two types (Task's dueAt
  // is manual, Change/Risk/Issue compute due differently), so MTTR + compliance stay honest by
  // covering exactly the SLA-policy types. ENGINEER scope is narrowed to assigned records.
  private async resolvedRows(
    clientId: string,
    viewer: ScopeViewer,
    from: Date,
    to: Date,
    assigneeId?: string
  ): Promise<ResolvedRow[]> {
    const where = (extra: object) =>
      applyAssignedScope(
        { clientId, resolvedAt: { gte: from, lte: to }, ...(assigneeId ? { assigneeId } : {}), ...extra },
        viewer
      );

    const [srs, incidents] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where: where({}),
        select: { createdAt: true, resolvedAt: true, dueAt: true }
      }),
      this.prisma.incident.findMany({
        where: where({}),
        select: { createdAt: true, resolvedAt: true, dueAt: true }
      })
    ]);

    return [...srs, ...incidents]
      .filter((r): r is ResolvedRow => r.resolvedAt != null)
      .map(r => ({ createdAt: r.createdAt, resolvedAt: r.resolvedAt, dueAt: r.dueAt }));
  }

  async mttr(clientId: string, viewer: ScopeViewer, q: { from?: string; to?: string; bucket?: Bucket; assigneeId?: string }) {
    const { fromDate, toDate, bucket } = this.window(q.from, q.to, q.bucket);
    const rows = await this.resolvedRows(clientId, viewer, fromDate, toDate, q.assigneeId);

    const byBucket = new Map<string, number[]>();
    for (const r of rows) {
      const key = bucketStart(r.resolvedAt, bucket).toISOString();
      const arr = byBucket.get(key) ?? [];
      arr.push(r.resolvedAt.getTime() - r.createdAt.getTime());
      byBucket.set(key, arr);
    }

    const buckets: MttrBucket[] = bucketRange(fromDate, toDate, bucket).map(b => {
      const key = b.toISOString();
      const durations = (byBucket.get(key) ?? []).sort((a, c) => a - c);
      const count = durations.length;
      const meanMs = count ? Math.round(durations.reduce((s, d) => s + d, 0) / count) : null;
      return { bucketStart: key, count, meanMs, medianMs: median(durations) };
    });

    const allDurations = rows.map(r => r.resolvedAt.getTime() - r.createdAt.getTime()).sort((a, c) => a - c);
    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      bucket,
      totalResolved: rows.length,
      overallMeanMs: allDurations.length ? Math.round(allDurations.reduce((s, d) => s + d, 0) / allDurations.length) : null,
      overallMedianMs: median(allDurations),
      buckets
    };
  }

  async slaCompliance(clientId: string, viewer: ScopeViewer, q: { from?: string; to?: string; bucket?: Bucket; assigneeId?: string }) {
    const { fromDate, toDate, bucket } = this.window(q.from, q.to, q.bucket);
    const rows = await this.resolvedRows(clientId, viewer, fromDate, toDate, q.assigneeId);

    // Only records that had a due target can be judged for compliance. dueAt is the final stored
    // target (incl. any manual adjustment) — the SLA we were actually held to.
    const judged = rows.filter(r => r.dueAt != null) as (ResolvedRow & { dueAt: Date })[];

    const byBucket = new Map<string, { met: number; breached: number }>();
    for (const r of judged) {
      const key = bucketStart(r.resolvedAt, bucket).toISOString();
      const cur = byBucket.get(key) ?? { met: 0, breached: 0 };
      if (r.resolvedAt.getTime() <= r.dueAt.getTime()) cur.met += 1;
      else cur.breached += 1;
      byBucket.set(key, cur);
    }

    const buckets: SlaComplianceBucket[] = bucketRange(fromDate, toDate, bucket).map(b => {
      const key = b.toISOString();
      const cur = byBucket.get(key) ?? { met: 0, breached: 0 };
      return { bucketStart: key, met: cur.met, breached: cur.breached, total: cur.met + cur.breached };
    });

    const totalMet = judged.filter(r => r.resolvedAt.getTime() <= r.dueAt.getTime()).length;
    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      bucket,
      totalJudged: judged.length,
      // resolved records with no due target — surfaced so the % is never mistaken for total coverage.
      noDueTarget: rows.length - judged.length,
      overallMet: totalMet,
      overallBreached: judged.length - totalMet,
      buckets
    };
  }
}
