import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtUser, resolveAssignedClient } from "../auth/request-context";
import { Prisma, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { CreateUserDto, UpdateUserDto } from "./dto";
import { isOrgOwnerRole, isOrgSuperRole } from "../auth/role-scope";

// Single select used for every user view. Includes the client assignment(s)
// (with client name) so toView can return the FULL assigned-client set now that
// User.clientId is gone and users may have many assignments (Phase 4).
const userViewSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  knownAs: true,
  organizationId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  clientAssignments: { select: { clientId: true, client: { select: { id: true, name: true } } } }
});

type UserView = Prisma.UserGetPayload<{ select: typeof userViewSelect }>;

const MANAGER_ALLOWED_ROLES: Role[] = [Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER];
const ORG_ADMIN_ALLOWED_ROLES: Role[] = [
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST,
  Role.ENGINEER,
  Role.CLIENT_VIEWER
];
const ORG_OWNER_ALLOWED_ROLES: Role[] = [
  Role.ORG_OWNER,
  Role.ORG_ADMIN,
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST,
  Role.ENGINEER,
  Role.CLIENT_VIEWER
];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private toView(user: UserView) {
    // Stable display order (by client name) so clientId (= first) and the arrays
    // are deterministic across requests.
    const assignments = [...user.clientAssignments].sort((a, b) =>
      (a.client?.name ?? "").localeCompare(b.client?.name ?? "")
    );
    const clients = assignments
      .map((a) => a.client)
      .filter((c): c is { id: string; name: string } => !!c);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      knownAs: user.knownAs,
      organizationId: user.organizationId,
      // Phase 4: the FULL assigned-client set. clientId (= first, or null) is kept
      // for back-compat with single-client consumers; clientIds/clients are the
      // multi-assignment source the 4b selector consumes.
      clientId: assignments[0]?.clientId ?? null,
      clientIds: assignments.map((a) => a.clientId),
      clients,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  private assertCanAssignRole(actor: JwtUser, role: Role) {
    if (role === Role.PUBLIC_USER) {
      throw new BadRequestException("PUBLIC_USER cannot be managed from internal user management.");
    }

    if (isOrgOwnerRole(actor.role)) {
      if (!ORG_OWNER_ALLOWED_ROLES.includes(role)) {
        throw new ForbiddenException("ORG_OWNER can only manage organization and client operational roles.");
      }
      return;
    }

    if (actor.role === Role.ORG_ADMIN) {
      if (!ORG_ADMIN_ALLOWED_ROLES.includes(role)) {
        throw new ForbiddenException("ORG_ADMIN can only manage client operational roles.");
      }
      return;
    }

    if (actor.role !== Role.SERVICE_MANAGER) {
      throw new ForbiddenException("Insufficient role");
    }

    if (!MANAGER_ALLOWED_ROLES.includes(role)) {
      throw new ForbiddenException("Service managers can only manage analyst/engineer/client-viewer roles.");
    }
  }

  private async resolveTargetClientId(actor: JwtUser, requestedClientId?: string | null) {
    if (isOrgSuperRole(actor.role)) {
      const organizationId = await this.requireOrganizationScope(actor);
      // Org-super has no implicit client; org-level roles resolve to null, and a
      // client-requiring role must have an explicit, in-organization client.
      const candidate = requestedClientId ?? null;
      if (!candidate) return null;
      await this.assertClientInOrganization(candidate, organizationId);
      return candidate;
    }

    // Client-scoped actor: resolve via the assignment join table (single source of
    // truth). Returns the actor's single assigned client, or validates the request.
    return resolveAssignedClient(actor, requestedClientId ?? undefined, this.prisma);
  }

  private async requireOrganizationScope(actor: JwtUser) {
    if (actor.organizationId) return actor.organizationId;

    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { organizationId: true }
    });
    if (!user?.organizationId) {
      throw new ForbiddenException("Missing organization scope");
    }
    return user.organizationId;
  }

  private async assertClientInOrganization(clientId: string, organizationId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, organizationId: true }
    });
    if (!client || client.organizationId !== organizationId) {
      throw new BadRequestException("Invalid clientId for organization scope.");
    }
  }

  /**
   * Per-clientId authorization (SECURITY-CRITICAL). A user may only be assigned to
   * clients the ACTOR is permitted to assign:
   *   - Org-super actor: any client IN THE ACTOR'S ORGANISATION.
   *   - Client-scoped actor: ONLY clients the actor THEMSELVES is assigned to. A
   *     SERVICE_MANAGER cannot assign a user to a client the manager isn't on.
   * Throws on the first disallowed clientId.
   */
  private async assertActorMayAssignClients(actor: JwtUser, clientIds: string[], organizationId: string) {
    const uniqueIds = [...new Set(clientIds)];

    if (isOrgSuperRole(actor.role)) {
      for (const clientId of uniqueIds) {
        await this.assertClientInOrganization(clientId, organizationId);
      }
      return;
    }

    const actorAssignments = await this.prisma.userClientAssignment.findMany({
      where: { userId: actor.userId },
      select: { clientId: true }
    });
    const actorClientIds = new Set(actorAssignments.map((a) => a.clientId));
    for (const clientId of uniqueIds) {
      if (!actorClientIds.has(clientId)) {
        throw new ForbiddenException("Cannot assign a client you are not assigned to.");
      }
    }
  }

  async list(actor: JwtUser, requestedClientId?: string) {
    const clientId = await this.resolveTargetClientId(actor, requestedClientId ?? null);
    const where: Prisma.UserWhereInput = {};

    if (isOrgSuperRole(actor.role)) {
      where.organizationId = await this.requireOrganizationScope(actor);
      if (clientId) where.clientAssignments = { some: { clientId } };
    } else if (clientId) {
      where.clientAssignments = { some: { clientId } };
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { email: "asc" }],
      select: userViewSelect
    });

    return users.map((u) => this.toView(u));
  }

  async create(actor: JwtUser, dto: CreateUserDto) {
    this.assertCanAssignRole(actor, dto.role);

    const roleRequiresClient = this.requiresClientScope(dto.role);
    const requestedClientIds = [...new Set(dto.clientIds ?? [])];

    if (!roleRequiresClient && requestedClientIds.length > 0) {
      throw new BadRequestException("clientIds must be empty for organization roles.");
    }

    const organizationId = await this.requireOrganizationScope(actor);
    if (!organizationId) {
      throw new ForbiddenException("Missing organization scope");
    }

    if (roleRequiresClient) {
      if (requestedClientIds.length === 0) {
        throw new BadRequestException("clientIds is required for non-admin roles.");
      }
      // SECURITY-CRITICAL: every requested client must be one the actor may assign.
      await this.assertActorMayAssignClients(actor, requestedClientIds, organizationId);
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException("User with this email already exists");

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
        knownAs: dto.knownAs ?? null,
        organizationId,
        isActive: dto.isActive ?? true,
        // One assignment row per requested client (Phase 4 multi-client).
        clientAssignments: roleRequiresClient
          ? { create: requestedClientIds.map((clientId) => ({ client: { connect: { id: clientId } } })) }
          : undefined
      },
      select: userViewSelect
    });

    return this.toView(created);
  }

  async update(actor: JwtUser, userId: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        organizationId: true,
        clientAssignments: { select: { clientId: true } }
      }
    });
    if (!target) throw new NotFoundException("User not found");
    const targetClientIds = target.clientAssignments.map((a) => a.clientId);

    const actorOrgId = await this.requireOrganizationScope(actor);
    if (target.organizationId !== actorOrgId) {
      throw new ForbiddenException("Cross-organization user management is not allowed.");
    }
    // Cross-client guard (assignment-based, subset): a client-scoped actor may manage
    // the target ONLY IF every one of the target's assigned clients is within the
    // actor's own assigned-client set. This prevents a client-scoped actor from
    // affecting assignments for clients they have no authority over (e.g. a Nova-only
    // manager stripping a user's Apex assignment via the sync). A target with no
    // assignments (e.g. an org-level user) is also rejected — client-scoped actors
    // manage only client-scoped users within their remit; org-super manages the rest.
    if (!isOrgSuperRole(actor.role)) {
      const actorAssignments = await this.prisma.userClientAssignment.findMany({
        where: { userId: actor.userId },
        select: { clientId: true }
      });
      const actorClientIds = new Set(actorAssignments.map((a) => a.clientId));
      const targetWithinRemit = targetClientIds.every((c) => actorClientIds.has(c));
      if (targetClientIds.length === 0 || !targetWithinRemit) {
        throw new ForbiddenException("Cross-client user management is not allowed.");
      }
    }

    if (dto.role) {
      this.assertCanAssignRole(actor, dto.role);
    } else {
      this.assertCanAssignRole(actor, target.role);
    }

    const nextRole = dto.role ?? target.role;
    const roleRequiresClient = this.requiresClientScope(nextRole);

    if (!roleRequiresClient && dto.clientIds && dto.clientIds.length > 0) {
      throw new BadRequestException("clientIds must be empty for organization roles.");
    }

    // Resolve the DESIRED assignment set.
    //   desiredClientIds === null → leave the target's assignments untouched.
    //   desiredClientIds === []   → remove all assignments (org-level role).
    //   otherwise                 → sync to exactly this set.
    let desiredClientIds: string[] | null;
    if (!roleRequiresClient) {
      // Org-level role: no client assignments.
      desiredClientIds = [];
    } else if (dto.clientIds !== undefined) {
      const requestedClientIds = [...new Set(dto.clientIds)];
      if (requestedClientIds.length === 0) {
        throw new BadRequestException("clientIds is required for non-admin roles.");
      }
      // SECURITY-CRITICAL: every requested client must be one the actor may assign.
      await this.assertActorMayAssignClients(actor, requestedClientIds, actorOrgId);
      desiredClientIds = requestedClientIds;
    } else {
      // No clientIds supplied for a client-requiring role: keep existing assignments.
      // But a role transitioning INTO a client-requiring role must specify clients.
      if (targetClientIds.length === 0) {
        throw new BadRequestException("clientIds is required for non-admin roles.");
      }
      desiredClientIds = null;
    }

    if (target.id === actor.userId && dto.isActive === false) {
      throw new BadRequestException("You cannot deactivate your own account.");
    }

    const data: Prisma.UserUpdateInput = {
      role: dto.role,
      firstName: dto.firstName,
      lastName: dto.lastName,
      knownAs: dto.knownAs,
      isActive: dto.isActive
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      // Rotates sessions after password changes.
      data.refreshTokenHash = null;
      data.refreshTokenExpiresAt = null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (desiredClientIds !== null) {
        // Sync to exactly desiredClientIds: add missing, remove absent, leave the rest.
        const desiredSet = new Set(desiredClientIds);
        const currentSet = new Set(targetClientIds);
        const toRemove = targetClientIds.filter((c) => !desiredSet.has(c));
        const toAdd = desiredClientIds.filter((c) => !currentSet.has(c));
        if (toRemove.length > 0) {
          await tx.userClientAssignment.deleteMany({
            where: { userId: target.id, clientId: { in: toRemove } }
          });
        }
        if (toAdd.length > 0) {
          await tx.userClientAssignment.createMany({
            data: toAdd.map((clientId) => ({ userId: target.id, clientId }))
          });
        }
      }
      return tx.user.update({
        where: { id: target.id },
        data,
        select: userViewSelect
      });
    });

    return this.toView(updated);
  }

  private requiresClientScope(role: Role) {
    return role !== Role.ORG_OWNER && role !== Role.ORG_ADMIN && role !== Role.ADMIN;
  }
}
