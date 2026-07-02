import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtUser, resolveClientScope } from "../src/auth/request-context";
import { CapacityService } from "../src/dcim/capacity.service";
import { FloorPlanService } from "../src/dcim/floor-plan.service";
import { InfrastructureReportService } from "../src/dcim/infrastructure-report.service";
import { ReservationsService } from "../src/cabinets/reservations.service";
import { PortsService } from "../src/ports/ports.service";

// Tenant-isolation proof for the DCIM surfaces (the CLAUDE.md-flagged gap). Two
// layers, both driven against a fixture-backed mock Prisma (no DB):
//   1. resolveClientScope — the ONE chokepoint every DCIM controller routes
//      through. Proving the spoof-guard here covers every endpoint uniformly.
//   2. the per-service query scoping — given a validated clientId, each new
//      service's `where: { id, …client chain }` refuses another client's row
//      (returns null → NotFound) rather than leaking it.
//
// Fixtures: site S owned by client A; room R, cabinet C under S; the classic
// spoof is a caller scoped to client B reaching for A's resources.

const A = "client-a";
const B = "client-b";
const ORG = "org-1";
const S = "site-s";
const R = "room-r";
const C = "cab-c";
const AST = "asset-1"; // a CLIENT-owned asset of client A (for ports scoping)

const sites = [{ id: S, clientId: A, name: "Site S", client: { name: "Client A" } }];
const rooms = [{ id: R, siteId: S, name: "Room R", widthMm: null, depthMm: null, gridCols: 16, gridRows: 12, shellType: null, backgroundOpacity: 0.4, backgroundImageKey: null, backgroundImageType: null, shellShape: null }];
const cabinets = [{ id: C, siteId: S, roomId: R, name: "CAB-C", totalU: 42, startingUnit: 1, powerKw: 8, maxWeightKg: 900, orientation: 0, posX: 1, posY: 1, status: "ACTIVE", row: null, positionInRow: null }];

// Mock Prisma honouring exactly the `where` shapes the DCIM services build,
// including the nested relation filters (site: { clientId }, cabinet.site chain).
function mockPrisma(): any {
  return {
    // resolveClientScope — client-scoped branch reads assignments; org-super reads the client.
    userClientAssignment: {
      findMany: jest.fn(async ({ where }: any) =>
        where.userId === "user-b" ? [{ clientId: B }] : where.userId === "user-a" ? [{ clientId: A }] : []),
    },
    client: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === A ? { id: A, organizationId: ORG } : where.id === B ? { id: B, organizationId: ORG } : where.id === "other-org" ? { id: "other-org", organizationId: "org-2" } : null),
    },
    site: {
      findFirst: jest.fn(async ({ where }: any) => {
        const s = sites.find((x) => x.id === where.id && (where.clientId === undefined || x.clientId === where.clientId));
        return s ?? null;
      }),
      findMany: jest.fn(async () => []),
    },
    room: {
      findFirst: jest.fn(async ({ where }: any) => {
        const r = rooms.find((x) => x.id === where.id);
        if (!r) return null;
        if (where.site?.clientId !== undefined) {
          const s = sites.find((x) => x.id === r.siteId);
          if (!s || s.clientId !== where.site.clientId) return null;
        }
        return r;
      }),
    },
    cabinet: {
      findFirst: jest.fn(async ({ where }: any) => {
        const c = cabinets.find((x) => x.id === where.id);
        if (!c) return null;
        if (where.siteId !== undefined && c.siteId !== where.siteId) return null;
        if (where.site?.clientId !== undefined) {
          const s = sites.find((x) => x.id === c.siteId);
          if (!s || s.clientId !== where.site.clientId) return null;
        }
        return c;
      }),
      findMany: jest.fn(async () => []),
    },
    // Ports scope indirectly via asset.clientId (or ownerType INTERNAL for
    // org-super). AST belongs to client A; B must not resolve it.
    asset: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id !== AST) return null
        // AST is CLIENT-owned by A; evaluate each OR clause against the real row.
        const row = { id: AST, clientId: A, ownerType: "CLIENT" }
        const orMatch = !where.OR || where.OR.some((o: any) =>
          (o.clientId !== undefined && row.clientId === o.clientId) ||
          (o.ownerType !== undefined && row.ownerType === o.ownerType)
        )
        return orMatch ? row : null
      }),
      findMany: jest.fn(async () => []),
      groupBy: jest.fn(async () => []),
    },
    port: { findMany: jest.fn(async () => []) },
    // Downstream reads on the owner-success paths — empty is enough (the gate is
    // what these tests exercise; these just keep the happy path from crashing).
    floorObject: { findMany: jest.fn(async () => []) },
    aisleZone: { findMany: jest.fn(async () => []) },
    cabinetReservation: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    maintenanceLog: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
  };
}

const superUser = (org = ORG): JwtUser => ({ userId: "admin", email: "a@x", role: Role.ORG_OWNER, organizationId: org });
const clientUserB: JwtUser = { userId: "user-b", email: "b@x", role: Role.SERVICE_MANAGER, organizationId: ORG };

describe("resolveClientScope — the shared spoof-guard (covers every DCIM endpoint)", () => {
  let prisma: any;
  beforeEach(() => { prisma = mockPrisma(); });

  it("client-scoped user requesting a client OUTSIDE their assignments → 403", async () => {
    // user-b is assigned to B only; spoofing A's x-client-id must be refused.
    await expect(resolveClientScope(clientUserB, A, prisma)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("client-scoped user requesting their OWN assigned client → allowed", async () => {
    await expect(resolveClientScope(clientUserB, B, prisma)).resolves.toBe(B);
  });

  it("org-super requesting a client in ANOTHER org → 403", async () => {
    await expect(resolveClientScope(superUser(), "other-org", prisma)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("org-super requesting a non-existent client → 403", async () => {
    await expect(resolveClientScope(superUser(), "ghost", prisma)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("org-super with NO client scope → 400 (must supply x-client-id)", async () => {
    await expect(resolveClientScope(superUser(), undefined, prisma)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("org-super requesting a valid in-org client → allowed", async () => {
    await expect(resolveClientScope(superUser(), A, prisma)).resolves.toBe(A);
  });
});

describe("DCIM services — query scoping refuses another client's resource (404, not leak)", () => {
  let prisma: any;
  let capacity: CapacityService;
  let floorPlan: FloorPlanService;
  let report: InfrastructureReportService;
  let reservations: ReservationsService;

  beforeEach(() => {
    prisma = mockPrisma();
    capacity = new CapacityService(prisma);
    floorPlan = new FloorPlanService(prisma, {} as any);
    report = new InfrastructureReportService(prisma, capacity);
    reservations = new ReservationsService(prisma);
  });

  // Site S belongs to client A; a caller validly scoped to client B must NOT
  // reach it (the where-chain returns null → NotFound), and A's own scope must.

  it("capacity: getSiteCapacity refuses a foreign client's site (404)", async () => {
    await expect(capacity.getSiteCapacity(B, S)).rejects.toBeInstanceOf(NotFoundException);
    await expect(capacity.getSiteCapacity(A, S)).resolves.toMatchObject({ siteId: S });
  });

  it("floor plan: getFloorPlan refuses a foreign client's room (404)", async () => {
    await expect(floorPlan.getFloorPlan(B, R)).rejects.toBeInstanceOf(NotFoundException);
    await expect(floorPlan.getFloorPlan(A, R)).resolves.toMatchObject({ room: { id: R } });
  });

  it("floor plan: placeCabinet refuses a foreign client's cabinet (404)", async () => {
    await expect(floorPlan.placeCabinet(B, C, { posX: 2, posY: 2 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reservations: create refuses a foreign client's cabinet (404)", async () => {
    await expect(reservations.create(B, S, C, "actor", { uStart: 5, name: "x" } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("report: getModel refuses a foreign client's site (404)", async () => {
    await expect(report.getModel(B, S)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ports: listForAsset refuses a foreign client's asset (404)", async () => {
    const ports = new PortsService(prisma);
    await expect(ports.listForAsset(B, AST)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ports.listForAsset(A, AST)).resolves.toEqual([]);
  });

  it("assertions are real: a missing clientId is rejected before any lookup", async () => {
    await expect(capacity.getSiteCapacity("", S)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(floorPlan.getFloorPlan("", R)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
