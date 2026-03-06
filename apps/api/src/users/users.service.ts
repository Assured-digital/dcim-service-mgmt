import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtUser } from "../auth/request-context";
import { Prisma, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { CreateUserDto, UpdateUserDto } from "./dto";
import { isOrgOwnerRole, isOrgSuperRole } from "../auth/role-scope";

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

  private toView(user: {
    id: string;
    email: string;
    role: Role;
    organizationId: string | null;
    clientId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      clientId: user.clientId,
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
      const candidate = requestedClientId ?? actor.clientId ?? null;
      if (!candidate) return null;
      await this.assertClientInOrganization(candidate, organizationId);
      return candidate;
    }

    if (!actor.clientId) {
      throw new ForbiddenException("Missing client scope");
    }

    if (requestedClientId && requestedClientId !== actor.clientId) {
      throw new ForbiddenException("Cross-client user management is not allowed.");
    }

    return actor.clientId;
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
      if (clientId) where.clientId = clientId;
    } else if (clientId) {
      where.clientId = clientId;
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        clientId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
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
        organizationId,
        clientId,
        isActive: dto.isActive ?? true
      },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        clientId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return this.toView(created);
  }

  async update(actor: JwtUser, userId: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException("User not found");

    const actorOrgId = await this.requireOrganizationScope(actor);
    if (target.organizationId !== actorOrgId) {
      throw new ForbiddenException("Cross-organization user management is not allowed.");
    }
    if (!isOrgSuperRole(actor.role) && target.clientId !== actor.clientId) {
      throw new ForbiddenException("Cross-client user management is not allowed.");
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
      ? await this.resolveTargetClientId(actor, dto.clientId ?? target.clientId ?? null)
      : null;

    if (roleRequiresClient && !nextClientId) {
      throw new BadRequestException("clientId is required for non-admin roles.");
    }

    if (target.id === actor.userId && dto.isActive === false) {
      throw new BadRequestException("You cannot deactivate your own account.");
    }

    const data: Prisma.UserUpdateInput = {
      role: dto.role,
      client: nextClientId ? { connect: { id: nextClientId } } : { disconnect: true },
      isActive: dto.isActive
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      // Rotates sessions after password changes.
      data.refreshTokenHash = null;
      data.refreshTokenExpiresAt = null;
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data,
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        clientId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return this.toView(updated);
  }

  private requiresClientScope(role: Role) {
    return role !== Role.ORG_OWNER && role !== Role.ORG_ADMIN && role !== Role.ADMIN;
  }
}
