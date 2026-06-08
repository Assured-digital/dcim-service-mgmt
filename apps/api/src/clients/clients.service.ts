import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientDto, UpdateClientDto } from "./dto";
import { JwtUser } from "../auth/request-context";

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async list(actor: JwtUser) {
    const organizationId = await this.requireOrganizationScope(actor);
    return this.prisma.client.findMany({
      where: { organizationId },
      orderBy: { name: "asc" }
    });
  }

  // Returns ONLY the caller's own client, derived strictly from their JWT clientId.
  // Never accepts a client id param — cannot be used to fetch another client.
  async getMine(actor: JwtUser) {
    if (!actor.clientId) {
      throw new NotFoundException("No client assigned");
    }
    const client = await this.prisma.client.findUnique({
      where: { id: actor.clientId },
      select: { id: true, name: true }
    });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async get(actor: JwtUser, id: string) {
    const organizationId = await this.requireOrganizationScope(actor);
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client || client.organizationId !== organizationId) throw new NotFoundException("Client not found");
    return client;
  }

  async create(actor: JwtUser, dto: CreateClientDto) {
    const organizationId = await this.requireOrganizationScope(actor);
    const name = dto.name.trim();
    await this.assertUniqueName(organizationId, name);

    return this.prisma.client.create({
      data: {
        organizationId,
        name,
        status: dto.status ?? "ACTIVE"
      }
    });
  }

  async update(actor: JwtUser, id: string, dto: UpdateClientDto) {
    const organizationId = await this.requireOrganizationScope(actor);
    const existing = await this.get(actor, id);

    const nextName = dto.name?.trim();
    if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUniqueName(organizationId, nextName);
    }

    return this.prisma.client.update({
      where: { id },
      data: {
        name: nextName,
        status: dto.status
      }
    });
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

  private async assertUniqueName(organizationId: string, name: string) {
    if (!name) throw new BadRequestException("Client name is required");
    const match = await this.prisma.client.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: "insensitive" }
      },
      select: { id: true }
    });
    if (match) throw new ConflictException("Client name already exists");
  }
}
