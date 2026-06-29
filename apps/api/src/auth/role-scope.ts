import { Role } from "@prisma/client";

export const ORG_SUPER_ROLES: Role[] = [Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN];

export function isOrgSuperRole(role: Role | undefined | null) {
  return !!role && ORG_SUPER_ROLES.includes(role);
}

export function isOrgOwnerRole(role: Role | undefined | null) {
  return role === Role.ORG_OWNER || role === Role.ADMIN;
}

// The minimal slice of the authenticated user needed to scope rows by assignment.
// A JwtUser satisfies it structurally, so controllers pass `user` straight through.
export type ScopeViewer = { role: Role; userId: string };

/**
 * Role-aware row scoping for the six work-item types (Service Request, Incident, Change,
 * Task, Risk, Issue). An ENGINEER sees ONLY records assigned to them
 * (`assigneeId === their userId`); every other role's `where` is returned unchanged.
 *
 * Applied to BOTH the list `where` AND the detail `{ id, clientId }` lookup, so a
 * non-assigned record is invisible by id too (resolves to null → NotFound → 404) — list
 * filtering alone would leave the detail endpoint open. The spread puts `assigneeId` last,
 * so an ENGINEER cannot widen the scope by passing another user's id as a query filter.
 *
 * Pure: no Prisma, no I/O — the single source of truth for the rule so it can't drift.
 */
export function applyAssignedScope<T extends object>(
  where: T,
  viewer: ScopeViewer
): T & { assigneeId?: string } {
  if (viewer.role === Role.ENGINEER) {
    return { ...where, assigneeId: viewer.userId };
  }
  return where;
}

