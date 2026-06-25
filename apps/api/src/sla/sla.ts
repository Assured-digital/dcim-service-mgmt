import { PrismaService } from "../prisma/prisma.service";

// Lean per-client SLA: maps a work-item priority to a resolution target in
// calendar hours. dueAt is computed as createdAt + resolutionHours on create and
// on priority change (see service-requests/incidents updateForClient). Resolution
// only — no breach history / escalation / working-calendar yet.

// Single source of truth for the fallback policy. A client with no SlaPolicy row
// for a given priority still gets a due date from these defaults, so no seeding is
// required. Keys are the shared priority domain (PRIORITY_LABELS) used by both SR
// and Incident.
export const DEFAULT_SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 120
};

// Resolves the resolution-hours target for (clientId, priority): a per-client
// SlaPolicy override if one exists, else the code-level default. Client-scoped by
// the passed clientId ONLY — never trust a client id from the request payload.
// Returns null for an unknown priority string so the caller leaves dueAt untouched.
export async function resolveSlaHours(
  prisma: PrismaService,
  clientId: string,
  priority: string
): Promise<number | null> {
  const policy = await prisma.slaPolicy.findFirst({
    where: { clientId, priority },
    select: { resolutionHours: true }
  });
  return policy?.resolutionHours ?? DEFAULT_SLA_HOURS[priority] ?? null;
}

// dueAt = base + hours (calendar hours).
export function computeDueAt(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}
