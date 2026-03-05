import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtUser } from "../auth/request-context";
import { Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  CreateOrganizationSuperUserDto,
  UpdateOrganizationDto,
  UpdateOrganizationSuperUserDto
} from "./dto";
import { isOrgOwnerRole, isOrgSuperRole } from "../auth/role-scope";

const MANAGEABLE_SUPER_ROLES = [Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN] as const;

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  private async requireOrganizationScope(actor: JwtUser) {
    if (actor.organizationId) return actor.organizationId;
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { organizationId: true }
    });
    if (!user?.organizationId) throw new ForbiddenException("Missing organization scope");
    return user.organizationId;
  }

  private assertOwner(actor: JwtUser) {
    if (!isOrgOwnerRole(actor.role)) {
      throw new ForbiddenException("Only ORG_OWNER can perform this action.");
    }
  }

  async getMyOrganization(actor: JwtUser) {
    const organizationId = await this.requireOrganizationScope(actor);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException("Organization not found");
    return org;
  }

  async updateMyOrganization(actor: JwtUser, dto: UpdateOrganizationDto) {
    this.assertOwner(actor);
    const organizationId = await this.requireOrganizationScope(actor);

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name?.trim(),
        status: dto.status
      }
    });
  }

  async listSuperUsers(actor: JwtUser) {
    if (!isOrgSuperRole(actor.role)) {
      throw new ForbiddenException("Insufficient role");
    }

    const organizationId = await this.requireOrganizationScope(actor);

    return this.prisma.user.findMany({
      where: {
        organizationId,
        role: { in: [...MANAGEABLE_SUPER_ROLES] }
      },
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        clientId: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async createSuperUser(actor: JwtUser, dto: CreateOrganizationSuperUserDto) {
    this.assertOwner(actor);

    if (dto.role !== Role.ORG_OWNER && dto.role !== Role.ORG_ADMIN) {
      throw new BadRequestException("Only ORG_OWNER and ORG_ADMIN roles are allowed here.");
    }

    const organizationId = await this.requireOrganizationScope(actor);

    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
        select: { organizationId: true }
      });
      if (!client || client.organizationId !== organizationId) {
        throw new BadRequestException("Invalid clientId for organization scope.");
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException("User with this email already exists");

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role,
        organizationId,
        clientId: dto.clientId ?? null,
        isActive: dto.isActive ?? true
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        clientId: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async updateSuperUser(actor: JwtUser, userId: string, dto: UpdateOrganizationSuperUserDto) {
    this.assertOwner(actor);
    const organizationId = await this.requireOrganizationScope(actor);

    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.organizationId !== organizationId) {
      throw new NotFoundException("Super user not found");
    }
    if (target.role !== Role.ORG_OWNER && target.role !== Role.ORG_ADMIN && target.role !== Role.ADMIN) {
      throw new BadRequestException("Target user is not an organization super user.");
    }

    if (dto.role && dto.role !== Role.ORG_OWNER && dto.role !== Role.ORG_ADMIN) {
      throw new BadRequestException("Only ORG_OWNER and ORG_ADMIN roles are allowed here.");
    }

    if (target.id === actor.userId && dto.isActive === false) {
      throw new BadRequestException("You cannot deactivate your own account.");
    }

    return this.prisma.user.update({
      where: { id: target.id },
      data: {
        role: dto.role,
        isActive: dto.isActive
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        clientId: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }
}
