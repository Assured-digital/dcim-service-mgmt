import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OwnerType, Role } from "@prisma/client";
import { isOrgSuperRole } from "../auth/role-scope";

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  listForClient(clientId: string, role: Role) {
    if (!clientId) throw new ForbiddenException("Missing client scope");

    if (!isOrgSuperRole(role)) {
      // Harden tenancy: non-admin users can only access client-owned assets in their scope.
      return this.prisma.asset.findMany({
        where: {
          ownerType: OwnerType.CLIENT,
          clientId
        },
        orderBy: { updatedAt: "desc" }
      });
    }

    // Admin can see internal assets plus client-owned assets for the selected client scope.
    return this.prisma.asset.findMany({
      where: {
        OR: [
          { ownerType: OwnerType.INTERNAL },
          { ownerType: OwnerType.CLIENT, clientId }
        ]
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(dto: any, requesterClientId: string, requesterRole: Role) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");
    const targetClientId = dto.clientId ?? requesterClientId;

    if (dto.ownerType === OwnerType.CLIENT && !targetClientId) {
      throw new BadRequestException("clientId is required when ownerType is CLIENT.");
    }

    // Enforce that non-admin cannot create assets for other clients.
    if (
      !isOrgSuperRole(requesterRole) &&
      dto.ownerType === OwnerType.CLIENT &&
      targetClientId !== requesterClientId
    ) {
      throw new ForbiddenException("Cannot create client-owned asset for a different client.");
    }

    // Restrict internal-asset creation to admins.
    if (dto.ownerType === OwnerType.INTERNAL && !isOrgSuperRole(requesterRole)) {
      throw new ForbiddenException("Only admins can create INTERNAL assets.");
    }

    return this.prisma.asset.create({
      data: {
        assetTag: dto.assetTag,
        name: dto.name,
        assetType: dto.assetType,
        ownerType: dto.ownerType,
        clientId: dto.ownerType === OwnerType.CLIENT ? targetClientId : null,
        siteId: dto.siteId ?? null,
        cabinetId: dto.cabinetId ?? null,
        status: dto.status ?? "ACTIVE",
        manufacturer: dto.manufacturer ?? null,
        modelNumber: dto.modelNumber ?? null,
        serialNumber: dto.serialNumber ?? null,
        uHeight: dto.uHeight ?? null,
        uPosition: dto.uPosition ?? null,
        powerDrawW: dto.powerDrawW ?? null,
        ipAddress: dto.ipAddress ?? null,
        warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : null,
        lifecycleStatus: dto.lifecycleStatus ?? null,
        notes: dto.notes ?? null,
        location: dto.location ?? null
      }
    });
  }

  async removeForClient(assetId: string, requesterClientId: string, requesterRole: Role) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId }
    });
    if (!asset) throw new BadRequestException("Asset not found.");

    if (!isOrgSuperRole(requesterRole)) {
      if (asset.ownerType !== OwnerType.CLIENT || asset.clientId !== requesterClientId) {
        throw new ForbiddenException("Cannot delete assets outside your client scope.");
      }
    } else if (asset.ownerType === OwnerType.CLIENT && asset.clientId !== requesterClientId) {
      throw new ForbiddenException("Selected scope does not match this client-owned asset.");
    }

    return this.prisma.asset.delete({ where: { id: asset.id } });
  }
}
