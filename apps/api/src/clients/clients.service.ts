import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PlatformModule } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientDto, UpdateClientDto } from "./dto";
import { JwtUser, resolveAssignedClient } from "../auth/request-context";

// A2 — the licensable product modules. Platform primitives (dashboard, admin,
// client selector) are always on and are NOT entitlements.
const ALL_PLATFORM_MODULES: PlatformModule[] = [
  PlatformModule.SERVICE_DESK,
  PlatformModule.DCIM,
  PlatformModule.CRM,
  PlatformModule.OPERATIONS
];

type EntitlementRow = { module: PlatformModule; enabled: boolean };

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  // Projects the join-table rows down to the simple enabled-module list the
  // frontend nav consumes.
  private enabledModulesOf(rows: EntitlementRow[]): PlatformModule[] {
    return rows.filter((r) => r.enabled).map((r) => r.module);
  }

  async list(actor: JwtUser) {
    const organizationId = await this.requireOrganizationScope(actor);
    const clients = await this.prisma.client.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: { moduleEntitlements: { select: { module: true, enabled: true } } }
    });
    return clients.map(({ moduleEntitlements, ...c }) => ({
      ...c,
      enabledModules: this.enabledModulesOf(moduleEntitlements)
    }));
  }

  // Returns ONLY the caller's own client, derived strictly from their client
  // assignment(s). Never accepts a client id param — cannot be used to fetch
  // another client.
  async getMine(actor: JwtUser) {
    let assignedClientId: string;
    try {
      assignedClientId = await resolveAssignedClient(actor, undefined, this.prisma);
    } catch {
      // No assignment (e.g. an org-level user with no client) → preserve the
      // previous "no client assigned" semantics.
      throw new NotFoundException("No client assigned");
    }
    const client = await this.prisma.client.findUnique({
      where: { id: assignedClientId },
      select: {
        id: true,
        name: true,
        moduleEntitlements: { select: { module: true, enabled: true } }
      }
    });
    if (!client) throw new NotFoundException("Client not found");
    const { moduleEntitlements, ...rest } = client;
    return { ...rest, enabledModules: this.enabledModulesOf(moduleEntitlements) };
  }

  // Returns the LIST of clients the CALLER is assigned to, derived strictly from
  // the caller's own UserClientAssignment rows. Includes enabledModules so the
  // client-scoped nav can gate on licensing. Zero assignments → empty array.
  async listMine(actor: JwtUser) {
    const assignments = await this.prisma.userClientAssignment.findMany({
      where: { userId: actor.userId },
      select: {
        client: {
          select: {
            id: true,
            name: true,
            lifecycleStage: true,
            moduleEntitlements: { select: { module: true, enabled: true } }
          }
        }
      }
    });
    return assignments
      .flatMap((a) => (a.client ? [a.client] : []))
      .map(({ moduleEntitlements, ...c }) => ({
        ...c,
        enabledModules: this.enabledModulesOf(moduleEntitlements)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(actor: JwtUser, id: string) {
    const organizationId = await this.requireOrganizationScope(actor);
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { moduleEntitlements: { select: { module: true, enabled: true } } }
    });
    if (!client || client.organizationId !== organizationId) throw new NotFoundException("Client not found");
    const { moduleEntitlements, ...rest } = client;
    return { ...rest, enabledModules: this.enabledModulesOf(moduleEntitlements) };
  }

  async create(actor: JwtUser, dto: CreateClientDto) {
    const organizationId = await this.requireOrganizationScope(actor);
    const name = dto.name.trim();
    await this.assertUniqueName(organizationId, name);

    const client = await this.prisma.client.create({
      data: {
        organizationId,
        name,
        status: dto.status ?? "ACTIVE",
        lifecycleStage: dto.lifecycleStage ?? "ACTIVE",
        sharePointFolderPath: dto.sharePointFolderPath?.trim() || undefined,
        sharePointSiteId: dto.sharePointSiteId?.trim() || undefined,
        // New clients start with every module enabled (matches the existing-client
        // backfill); org-super can narrow this from the Clients admin page.
        moduleEntitlements: {
          create: ALL_PLATFORM_MODULES.map((module) => ({ module, enabled: true }))
        }
      },
      include: { moduleEntitlements: { select: { module: true, enabled: true } } }
    });
    const { moduleEntitlements, ...rest } = client;
    return { ...rest, enabledModules: this.enabledModulesOf(moduleEntitlements) };
  }

  async update(actor: JwtUser, id: string, dto: UpdateClientDto) {
    const organizationId = await this.requireOrganizationScope(actor);
    const existing = await this.get(actor, id);

    const nextName = dto.name?.trim();
    if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertUniqueName(organizationId, nextName);
    }

    await this.prisma.client.update({
      where: { id },
      data: {
        name: nextName,
        status: dto.status,
        lifecycleStage: dto.lifecycleStage,
        sharePointFolderPath: dto.sharePointFolderPath?.trim() ?? undefined,
        sharePointSiteId: dto.sharePointSiteId?.trim() ?? undefined
      }
    });
    return this.get(actor, id);
  }

  // A2 — set the client's enabled module set (org-super only; org-scoped via
  // get()). Declarative: upserts every known module so the passed list is the
  // full enabled set (anything omitted is disabled).
  async setModules(actor: JwtUser, id: string, modules: PlatformModule[]) {
    await this.get(actor, id); // org-scoped existence check
    const desired = new Set(modules);
    await this.prisma.$transaction(
      ALL_PLATFORM_MODULES.map((module) =>
        this.prisma.clientModuleEntitlement.upsert({
          where: { clientId_module: { clientId: id, module } },
          create: { clientId: id, module, enabled: desired.has(module) },
          update: { enabled: desired.has(module) }
        })
      )
    );
    return this.get(actor, id);
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
