import { getCurrentUser } from "./auth";

export const ROLES = {
  ORG_OWNER: "ORG_OWNER",
  ORG_ADMIN: "ORG_ADMIN",
  ADMIN: "ADMIN",
  SERVICE_MANAGER: "SERVICE_MANAGER",
  SERVICE_DESK_ANALYST: "SERVICE_DESK_ANALYST",
  ENGINEER: "ENGINEER",
  CLIENT_VIEWER: "CLIENT_VIEWER"
} as const;

export const ORG_SUPER_ROLES = [ROLES.ORG_OWNER, ROLES.ORG_ADMIN, ROLES.ADMIN] as const;

// ── Role categories ─────────────────────────────────────────────────────────
// User management is split by population: Assured Digital's own staff (AD-staff)
// vs a client's own users (client-own). ADMIN is legacy/deprecated but counts as
// AD-staff for display where any still exist. PUBLIC_USER belongs to neither and
// is never surfaced.
export const AD_STAFF_ROLES: string[] = [
  ROLES.ORG_OWNER,
  ROLES.ORG_ADMIN,
  ROLES.ADMIN,
  ROLES.SERVICE_MANAGER,
  ROLES.SERVICE_DESK_ANALYST,
  ROLES.ENGINEER
];

export const CLIENT_OWN_ROLES: string[] = [ROLES.CLIENT_VIEWER];

export function isAdStaffRole(role: string | null | undefined) {
  return !!role && AD_STAFF_ROLES.includes(role);
}

export function isClientOwnRole(role: string | null | undefined) {
  return !!role && CLIENT_OWN_ROLES.includes(role);
}

export function hasAnyRole(roles: string[]) {
  const role = getCurrentUser()?.role;
  if (!role) return false;
  return roles.includes(role);
}
