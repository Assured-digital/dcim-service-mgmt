// Resolution-timestamp helper — the honest foundation for MTTR / SLA-compliance metrics.
//
// SR / Incident / Task have no native resolution timestamp (only createdAt/updatedAt), so a
// `resolvedAt` column is stamped when a record FIRST enters a resolved state and cleared if it
// later leaves one (reopened). The invariant: `resolvedAt` is non-null iff the record is currently
// resolved, holding the moment the current resolved streak began. `updatedAt` (last edit) is NOT a
// valid proxy — that was the dishonest metric removed in #160.
//
// CANCELLED (SR) is intentionally NOT a resolved state — cancelled work was never "resolved", so it
// is excluded from MTTR. Resolved-status → resolved-status moves (e.g. COMPLETED → CLOSED) leave
// `resolvedAt` unchanged, preserving the first-resolution time.

export const SR_RESOLVED_STATUSES = ["COMPLETED", "CLOSED"] as const;
export const INCIDENT_RESOLVED_STATUSES = ["RESOLVED", "CLOSED"] as const;
export const TASK_RESOLVED_STATUSES = ["DONE"] as const;

// Returns the partial Prisma update for `resolvedAt` given a status transition. Spread onto the
// update `data`: `{ resolvedAt: Date }` on first entry to a resolved state, `{ resolvedAt: null }`
// on leaving one, or `{}` (no change) for moves within/between non-resolved or resolved states.
export function resolvedAtUpdate(
  oldStatus: string,
  newStatus: string,
  resolvedStatuses: readonly string[]
): { resolvedAt?: Date | null } {
  const wasResolved = resolvedStatuses.includes(oldStatus);
  const nowResolved = resolvedStatuses.includes(newStatus);
  if (nowResolved && !wasResolved) return { resolvedAt: new Date() };
  if (!nowResolved && wasResolved) return { resolvedAt: null };
  return {};
}
