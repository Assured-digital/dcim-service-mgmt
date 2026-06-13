import { Prisma, Role } from "@prisma/client";
import { ORG_SUPER_ROLES } from "../auth/role-scope";

// AD-staff roles who can be ASSIGNED work (and, broader than admin, who can call
// the assignable picker). Excludes CLIENT_VIEWER and PUBLIC_USER by design.
export const ASSIGNABLE_STAFF_ROLES: Role[] = [
  Role.ORG_OWNER,
  Role.ORG_ADMIN,
  Role.ADMIN,
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST,
  Role.ENGINEER
];

// Single source of truth for "who is assignable within a given client scope".
// Used by the assignee picker (users.listAssignable) AND by @user-mention
// validation (comments) so a mention can never target a user outside the tenant.
//
// Assignable = active AD-staff in the org AND
//   (role IN ORG_SUPER_ROLES        — org-super span every client, so they're
//                                      assignable to the scoped one too)
//   OR (assigned to the scoped client via UserClientAssignment).
export function assignableUserWhere(
  organizationId: string,
  clientId: string
): Prisma.UserWhereInput {
  return {
    organizationId,
    isActive: true,
    role: { in: ASSIGNABLE_STAFF_ROLES },
    OR: [
      { role: { in: ORG_SUPER_ROLES } },
      { clientAssignments: { some: { clientId } } }
    ]
  };
}
