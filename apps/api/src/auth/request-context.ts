import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isOrgSuperRole } from "./role-scope";

export type JwtUser = {
  userId: string;
  email: string;
  role: Role;
  organizationId?: string | null;
};

export function getJwtUser(req: { user?: unknown }): JwtUser {
  const user = req.user as JwtUser | undefined;
  if (!user?.userId || !user.role) {
    throw new ForbiddenException("Missing authenticated user context");
  }
  return user;
}

/**
 * Single source of truth for CLIENT-SCOPED (non-super) client resolution.
 *
 * Scope is sourced from the UserClientAssignment join table (Phase 3: the
 * User.clientId scalar no longer exists). This is behaviour-preserving for
 * existing users: every current user was backfilled to exactly ONE assignment
 * (= their old clientId), so the single-assignment paths below return the
 * identical result. The cross-client guard generalises from "== user.clientId"
 * to "IN assigned set".
 *
 * Both resolveClientScope (client-scoped branch) and UsersService delegate here
 * so client-scoped resolution lives in exactly one place.
 */
export async function resolveAssignedClient(
  user: JwtUser,
  requestedClientId: string | undefined,
  prisma: PrismaService
): Promise<string> {
  const requested = requestedClientId?.trim() || undefined;

  const assignments = await prisma.userClientAssignment.findMany({
    where: { userId: user.userId },
    select: { clientId: true }
  });
  const assignedClientIds = assignments.map((a) => a.clientId);

  if (assignedClientIds.length === 0) {
    throw new ForbiddenException("No client assignments");
  }

  if (requested) {
    // Cross-client guard: the requested client must be one the user is assigned to.
    if (!assignedClientIds.includes(requested)) {
      throw new ForbiddenException("Not assigned to this client");
    }
    return requested;
  }

  // No explicit selection: single-assignment users auto-scope (the existing-user case).
  // Multi-client users without a selection get the first assignment deterministically
  // (sorted) — a valid assigned scope; the scope selector normally supplies one in Phase 4.
  if (assignedClientIds.length === 1) {
    return assignedClientIds[0];
  }
  return [...assignedClientIds].sort()[0];
}

export async function resolveClientScope(
  user: JwtUser,
  requestedClientId: string | undefined,
  prisma: PrismaService
): Promise<string> {
  const requested = requestedClientId?.trim() || undefined;

  if (isOrgSuperRole(user.role)) {
    // Phase 3: there is no User.clientId fallback any more — org-super callers
    // must supply a client scope explicitly (the frontend scope selector always
    // sends x-client-id for these roles).
    if (!requested) {
      throw new BadRequestException(
        "Org-super requests must include client scope. Provide x-client-id."
      );
    }
    const client = await prisma.client.findUnique({
      where: { id: requested },
      select: { id: true, organizationId: true }
    });
    if (!client) {
      throw new ForbiddenException("Invalid client scope");
    }
    if (user.organizationId && client.organizationId !== user.organizationId) {
      throw new ForbiddenException("Cross-organization access denied");
    }
    return requested;
  }

  // Client-scoped (non-super) branch — delegate to the single source of truth.
  return resolveAssignedClient(user, requested, prisma);
}
