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

// Single select used for every user view. Includes the client assignment(s) so
// toView can derive the (single, in Phase 3) clientId from the join table now
// that User.clientId is gone.
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
  clientAssignments: { select: { clientId: true } }
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
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      knownAs: user.knownAs,
      organizationId: user.organizationId,
      // Phase 3: single-assignment users surface their one assigned client so the
      // frontend's current single-client display keeps working. (Multi-assignment
      // listing is Phase 4.)
      clientId: user.clientAssignments[0]?.clientId ?? null,
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
    if (!roleRequiresClient && dto.clientId) {
      throw new BadRequestException("clientId must be empty for organization roles.");
    }
    const clientId = roleRequiresClient ? await this.resolveTargetClientId(actor, dto.clientId ?? null) : null;
    const organizationId = await this.requireOrganizationScope(actor);
    if (roleRequiresClient && !clientId) {
      throw new BadRequestException("clientId is required for non-admin roles.");
    }
    if (!organizationId) {
      throw new ForbiddenException("Missing organization scope");
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
        // Client-requiring roles get exactly ONE assignment row (preserves the
        // current single-client behaviour). Multi-assignment is Phase 4.
        clientAssignments: clientId
          ? { create: { client: { connect: { id: clientId } } } }
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
    // Cross-client guard (assignment-based, intersection): a client-scoped actor may
    // manage the target only if they share AT LEAST ONE assigned client. This is
    // multi-assignment-correct — it considers the actor's full assigned set, not a
    // single resolved client.
    if (!isOrgSuperRole(actor.role)) {
      const actorAssignments = await this.prisma.userClientAssignment.findMany({
        where: { userId: actor.userId },
        select: { clientId: true }
      });
      const actorClientIds = actorAssignments.map((a) => a.clientId);
      const sharesClient = targetClientIds.some((c) => actorClientIds.includes(c));
      if (!sharesClient) {
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

    if (!roleRequiresClient && dto.clientId) {
      throw new BadRequestException("clientId must be empty for organization roles.");
    }

    const nextClientId = roleRequiresClient
      ? await this.resolveTargetClientId(actor, dto.clientId ?? targetClientIds[0] ?? null)
      : null;

    if (roleRequiresClient && !nextClientId) {
      throw new BadRequestException("clientId is required for non-admin roles.");
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

    // Desired single-assignment state (Phase 3): exactly the resolved client, or none
    // for org-level roles. Only touch the join table when it differs from the current
    // set — i.e. replace the assignment if the client changed.
    const desiredClientIds = nextClientId ? [nextClientId] : [];
    const assignmentsUnchanged =
      desiredClientIds.length === targetClientIds.length &&
      desiredClientIds.every((c) => targetClientIds.includes(c));

    const updated = await this.prisma.$transaction(async (tx) => {
      if (!assignmentsUnchanged) {
        await tx.userClientAssignment.deleteMany({ where: { userId: target.id } });
        if (nextClientId) {
          await tx.userClientAssignment.create({
            data: { userId: target.id, clientId: nextClientId }
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
