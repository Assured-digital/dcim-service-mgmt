// Live / History scoping for the work-item list endpoints (Service Desk split).
//
// The six work-item types share one lifecycle idea: a record is "live" until it
// reaches a terminal status, then it's "history". These are the terminal sets —
// the single source of truth used by both the list-scope filter here and the
// status-update services that stamp `closedAt`.
export const TERMINAL_STATUSES = {
  serviceRequest: ["COMPLETED", "CLOSED", "CANCELLED"],
  incident: ["RESOLVED", "CLOSED"],
  change: ["COMPLETED", "CLOSED", "CANCELLED", "REJECTED"],
  task: ["DONE"],
  risk: ["ACCEPTED", "CLOSED"],
  issue: ["RESOLVED", "CLOSED"]
} as const;

export interface ListScope {
  // "live" → non-terminal rows only (bounds the active queue feed).
  scope?: string;
  // ISO date → History: terminal rows closed on/after this, newest-closed first.
  closedSince?: string;
}

// Build the status/closedAt where-fragment + optional orderBy for a list query.
// - closedSince present → History window (terminal + closedAt >= since, closedAt desc)
// - scope === "live"    → Live (status NOT IN terminal)
// - neither             → empty (unchanged all-rows behaviour — the linked-record
//                         parent-context lists depend on getting every status).
export function buildListScope(
  terminal: readonly string[],
  s: ListScope
): { where: Record<string, unknown>; orderBy?: { closedAt: "desc" } } {
  if (s.closedSince) {
    const since = new Date(s.closedSince);
    return {
      where: {
        status: { in: terminal as unknown as string[] },
        ...(Number.isNaN(since.getTime()) ? {} : { closedAt: { gte: since } })
      },
      orderBy: { closedAt: "desc" }
    };
  }
  if (s.scope === "live") {
    return { where: { status: { notIn: terminal as unknown as string[] } } };
  }
  return { where: {} };
}
