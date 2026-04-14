import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service";
import { AssetLifecycleState, OwnerType, Role } from "@prisma/client";
import { isOrgSuperRole } from "../auth/role-scope";

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  private async backfillRackSide(clientId: string) {
    await this.prisma.asset.updateMany({
      where: { clientId, rackSide: null },
      data: { rackSide: "FRONT" }
    });
  }

  async listForClient(clientId: string, role: Role) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
    await this.backfillRackSide(clientId);

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
        lifecycleState: dto.lifecycleState ?? "ACTIVE",
        notes: dto.notes ?? null,
        location: dto.location ?? null,
        rackSide: dto.rackSide === "REAR" ? "REAR" : "FRONT"
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

  async updateForClient(assetId: string, dto: {
    assetTag?: string
    name?: string
    assetType?: string
    siteId?: string | null
    cabinetId?: string | null
    status?: string
    manufacturer?: string
    modelNumber?: string
    serialNumber?: string
    uHeight?: number | null
    uPosition?: number | null
    powerDrawW?: number | null
    ipAddress?: string
    lifecycleState?: AssetLifecycleState
    notes?: string
    location?: string
    rackSide?: "FRONT" | "REAR" | null
  }, requesterClientId: string, requesterRole: Role) {
    if (!requesterClientId) throw new ForbiddenException("Missing client scope");

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId }
    });
    if (!asset) throw new BadRequestException("Asset not found.");

    if (!isOrgSuperRole(requesterRole)) {
      if (asset.ownerType !== OwnerType.CLIENT || asset.clientId !== requesterClientId) {
        throw new ForbiddenException("Cannot update assets outside your client scope.");
      }
    } else if (asset.ownerType === OwnerType.CLIENT && asset.clientId !== requesterClientId) {
      throw new ForbiddenException("Selected scope does not match this client-owned asset.");
    }

    const targetSiteId = dto.siteId !== undefined ? dto.siteId : asset.siteId;
    const targetCabinetId = dto.cabinetId !== undefined ? dto.cabinetId : asset.cabinetId;

    if (targetSiteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: targetSiteId, clientId: requesterClientId }
      });
      if (!site) throw new BadRequestException("Target site not found for selected client scope.");
    }

    if (targetCabinetId) {
      const cabinet = await this.prisma.cabinet.findFirst({
        where: { id: targetCabinetId, site: { clientId: requesterClientId } }
      });
      if (!cabinet) throw new BadRequestException("Target rack not found for selected client scope.");
      if (targetSiteId && cabinet.siteId !== targetSiteId) {
        throw new BadRequestException("Selected rack does not belong to selected site.");
      }
    }

    return this.prisma.asset.update({
      where: { id: assetId },
      data: {
        assetTag: dto.assetTag ?? asset.assetTag,
        name: dto.name ?? asset.name,
        assetType: dto.assetType ?? asset.assetType,
        siteId: targetSiteId ?? null,
        cabinetId: targetCabinetId ?? null,
        status: dto.status ?? asset.status,
        manufacturer: dto.manufacturer ?? asset.manufacturer,
        modelNumber: dto.modelNumber ?? asset.modelNumber,
        serialNumber: dto.serialNumber ?? asset.serialNumber,
        uHeight: dto.uHeight !== undefined ? dto.uHeight : asset.uHeight,
        uPosition: dto.uPosition !== undefined ? dto.uPosition : asset.uPosition,
        powerDrawW: dto.powerDrawW !== undefined ? dto.powerDrawW : asset.powerDrawW,
        ipAddress: dto.ipAddress ?? asset.ipAddress,
        lifecycleState: dto.lifecycleState ?? asset.lifecycleState,
        notes: dto.notes ?? asset.notes,
        location: dto.location ?? asset.location,
        rackSide: dto.rackSide === "REAR" ? "REAR" : dto.rackSide === "FRONT" ? "FRONT" : asset.rackSide ?? "FRONT"
      }
    });
  }

  async importFromCsv(
    clientId: string,
    siteId: string,
    rows: any[],
    actorUserId: string
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    if (!clientId) throw new ForbiddenException("Missing client scope")

    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new BadRequestException("Site not found")

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] }

    for (const row of rows) {
      try {
        // Support both real Hyperview export headers and our own export headers
        const hyperviewAssetId = row["Asset ID"] ?? row["AssetId"] ?? null
        const name = row["Name"] ?? row["name"] ?? ""
        const assetType = row["Type"] ?? row["AssetType"] ?? row["assetType"] ?? "Unknown"
        const manufacturer = row["Manufacturer"] ?? row["manufacturer"] ?? null
        const modelNumber = row["Model"] ?? row["model"] ?? null
        const serialNumber = row["Serial Number"] ?? row["SerialNumber"] ?? row["serialNumber"] ?? ""
        const locationPath: string = row["Asset Location"] ?? row["AssetLocation"] ?? ""
        const lifecycleRaw: string = row["LifecycleState"] ?? row["lifecycleState"] ?? "ACTIVE"
        const assetTag = row["AssetTag"] ?? row["assetTag"] ?? null

        if (!name) { results.skipped++; continue }

        // Parse rack name from Hyperview location path
        // e.g. "All / Client / Site / Room / Rack" → "Rack"
        const locationParts = locationPath.split("/").map((p: string) => p.trim()).filter(Boolean)
        const rackName = locationParts.length >= 1 ? locationParts[locationParts.length - 1] : null

        // Map lifecycle values
        const lifecycleMap: Record<string, string> = {
          Active: "ACTIVE", active: "ACTIVE", ACTIVE: "ACTIVE",
          Planned: "PLANNED", planned: "PLANNED", PLANNED: "PLANNED",
          Procurement: "PROCUREMENT", procurement: "PROCUREMENT", PROCUREMENT: "PROCUREMENT",
          Staging: "STAGING", staging: "STAGING", STAGING: "STAGING",
          Retired: "RETIRED", retired: "RETIRED", RETIRED: "RETIRED"
        }
        const lifecycleState = lifecycleMap[lifecycleRaw] ?? "ACTIVE"

        // Resolve cabinet by name within this site
        let cabinetId: string | null = null
        if (rackName) {
          const cabinet = await this.prisma.cabinet.findFirst({
            where: { siteId, name: { equals: rackName, mode: "insensitive" } }
          })
          cabinetId = cabinet?.id ?? null
        }

        // Try to find existing asset by hyperviewAssetId or serial number
        const existing = await this.prisma.asset.findFirst({
          where: {
            clientId,
            OR: [
              ...(hyperviewAssetId ? [{ hyperviewAssetId }] : []),
              ...(serialNumber ? [{ serialNumber }] : [])
            ].filter(Boolean)
          }
        })

        if (existing) {
          await this.prisma.asset.update({
            where: { id: existing.id },
            data: {
              name,
              manufacturer,
              modelNumber,
              cabinetId,
              siteId,
              lifecycleState: lifecycleState as any,
              hyperviewAssetId: hyperviewAssetId ?? existing.hyperviewAssetId,
              lastSyncedAt: new Date(),
              rackSide: existing.rackSide ?? "FRONT"
            }
          })
          results.updated++
        } else {
          const generatedTag = assetTag || `HV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
          await this.prisma.asset.create({
            data: {
              assetTag: generatedTag,
              name,
              assetType,
              ownerType: "CLIENT",
              clientId,
              siteId,
              cabinetId,
              manufacturer,
              modelNumber,
              serialNumber: serialNumber || null,
              lifecycleState: lifecycleState as any,
              hyperviewAssetId,
              lastSyncedAt: new Date(),
              status: "ACTIVE",
              rackSide: "FRONT"
            }
          })
          results.created++
        }
      } catch (e: any) {
        results.errors.push(`Row error: ${e?.message ?? "Unknown error"}`)
      }
    }

    return results
  }

  async exportToCsv(clientId: string, siteId: string): Promise<string> {
    if (!clientId) throw new ForbiddenException("Missing client scope")

    const assets = await this.prisma.asset.findMany({
      where: { clientId, siteId },
      include: { cabinet: true },
      orderBy: [{ cabinet: { name: "asc" } }, { uPosition: "asc" }]
    })

    const headers = [
      "Asset ID", "Name", "Asset Location", "Type",
      "Manufacturer", "Model", "Serial Number", "Status", "Monitoring State",
      "LifecycleState", "IPAddress", "UPosition", "UHeight", "PowerDrawW",
      "AssetTag", "Notes"
    ]

    const escapeCell = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return ""
      const str = String(val)
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = assets.map(a => [
      a.hyperviewAssetId ?? "",
      a.name,
      a.cabinet?.name ?? "",
      a.assetType,
      a.manufacturer ?? "",
      a.modelNumber ?? "",
      a.serialNumber ?? "",
      "Normal",
      "Off",
      a.lifecycleState,
      a.ipAddress ?? "",
      a.uPosition ?? "",
      a.uHeight ?? 1,
      a.powerDrawW ?? "",
      a.assetTag,
      a.notes ?? ""
    ].map(escapeCell).join(","))

    return [headers.join(","), ...rows].join("\n")
  }

  async getForSite(clientId: string, siteId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    await this.backfillRackSide(clientId)
    return this.prisma.asset.findMany({
      where: { clientId, siteId },
      include: { cabinet: true },
      orderBy: [{ cabinet: { name: "asc" } }, { uPosition: "asc" }]
    })
  }
}
