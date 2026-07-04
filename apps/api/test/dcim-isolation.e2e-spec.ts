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
      // queryRecords ("asset" case) shape: strict clientId + id-in filter — the
      // existence/tenant check work-notes and attachments route through.
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.clientId !== A) return []
        if (where.id?.in && !where.id.in.includes(AST)) return []
        if (!where.id) return []
        return [{ id: AST, assetTag: "AST-1", name: "Asset One", lifecycleState: "ACTIVE" }]
      }),
      groupBy: jest.fn(async () => []),
    },
    workNote: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ ...data, id: "note-1", createdAt: new Date(), author: null })),
    },
    sensorReading: {
      create: jest.fn(async ({ data }: any) => ({ ...data, id: "reading-1", createdAt: new Date() })),
      findMany: jest.fn(async () => []),
    },
    assetCustomField: {
      findMany: jest.fn(async ({ where }: any) => (where?.clientId === A ? [{ id: "f-1", clientId: A, key: "owner", label: "Owner", type: "text", options: [], order: 1 }] : [])),
      findUnique: jest.fn(async () => null),
      aggregate: jest.fn(async () => ({ _max: { order: 0 } })),
      create: jest.fn(async ({ data }: any) => ({ ...data, id: "f-1", createdAt: new Date() })),
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

  it("find-space: refuses a foreign client's site scope (404)", async () => {
    await expect(capacity.findSpace(B, { uSize: 4, siteId: S })).rejects.toBeInstanceOf(NotFoundException);
    // Control: the owner's search runs (empty fixture estate → no candidates).
    await expect(capacity.findSpace(A, { uSize: 4, siteId: S })).resolves.toMatchObject({ scanned: 0, matched: 0 });
  });

  it("work-notes: create refuses a foreign client's entity (404); owner writes fine", async () => {
    const { WorkNotesService } = await import("../src/work-notes/work-notes.service");
    const notes = new WorkNotesService(prisma);
    await expect(notes.create(B, "user-b", "asset", AST, "spoofed note")).rejects.toBeInstanceOf(NotFoundException);
    await expect(notes.create(A, "user-a", "asset", AST, "legit note")).resolves.toMatchObject({ body: "legit note" });
  });

  it("work-order fusion: a completed install activates ONLY the same-client waiting asset", async () => {
    const { applyCompletedWorkOrder } = await import("../src/work-orders/apply-pending");
    // Fixture asset staged with a pending INSTALL work order (task WO-1).
    const staged = { id: AST, clientId: A, assetTag: "AST-1", name: "Asset One", lifecycleState: "PLANNED", disposalStatus: null, pendingOp: "INSTALL", pendingWorkOrderType: "task", pendingWorkOrderId: "WO-1" };
    const updates: any[] = [];
    const p: any = {
      asset: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.pendingWorkOrderId === "WO-1" && where.pendingWorkOrderType === "task" && where.clientId === A ? staged : null),
        update: jest.fn(async ({ data }: any) => { updates.push(data); return { ...staged, ...data } }),
      },
      auditEvent: { create: jest.fn(async () => ({})) },
    };
    // Foreign client completing the same WO id resolves NO waiting asset → no write.
    await applyCompletedWorkOrder(p, { workOrderType: "task", workOrderId: "WO-1", actorUserId: "u", clientId: B });
    expect(updates).toHaveLength(0);
    // Owner completes it → asset activates, pending marker cleared.
    await applyCompletedWorkOrder(p, { workOrderType: "task", workOrderId: "WO-1", actorUserId: "u", clientId: A });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ lifecycleState: "ACTIVE", pendingOp: null, pendingWorkOrderId: null });
  });

  it("custom fields: list is clientId-scoped (only the owner's fields resolve)", async () => {
    const { AssetCustomFieldsService } = await import("../src/asset-custom-fields/asset-custom-fields.service");
    const svc = new AssetCustomFieldsService(prisma);
    await expect(svc.list(B)).resolves.toEqual([]);
    await expect(svc.list(A)).resolves.toEqual([expect.objectContaining({ key: "owner", clientId: A })]);
  });

  it("sensor readings: record refuses a foreign client's asset (404); owner records fine", async () => {
    const { SensorReadingsService } = await import("../src/sensor-readings/sensor-readings.service");
    const svc = new SensorReadingsService(prisma);
    await expect(svc.record(B, "user-b", AST, { metric: "powerW", value: 500 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.record(A, "user-a", AST, { metric: "powerW", value: 500 })).resolves.toMatchObject({ metric: "powerW", value: 500 });
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

// Pass-through + multi-hop trace (Horizon 2). Stateful fixture: a client-A patch
// panel PAN (front PF / rear PR) cabled between endpoints X (port x1) and Z (port
// z1). A caller scoped to client B must not pair or trace any of it; client A can
// pair front↔rear and trace end-to-end X → PAN → Z. Assets X/PAN/Z are separate
// from AST so the earlier `listForAsset(A, AST) → []` fixture stays intact.
describe("ports — pass-through & cable trace (Horizon 2)", () => {
  const PAN = "asset-pan", AX = "asset-x", AZ = "asset-z";

  function mockPortsPrisma() {
    const assets = [
      { id: PAN, clientId: A, ownerType: "CLIENT", name: "Panel", assetTag: "PAN" },
      { id: AX, clientId: A, ownerType: "CLIENT", name: "Switch X", assetTag: "X" },
      { id: AZ, clientId: A, ownerType: "CLIENT", name: "Server Z", assetTag: "Z" },
    ];
    // Pass-through starts UNPAIRED — setPassThrough writes it (exercises the write path).
    const ports: any[] = [
      { id: "pf", assetId: PAN, name: "front-1", portType: "NETWORK", position: 1, throughPortId: null },
      { id: "pr", assetId: PAN, name: "rear-1", portType: "NETWORK", position: 1, throughPortId: null },
      { id: "x1", assetId: AX, name: "Gi0/1", portType: "NETWORK", position: 1, throughPortId: null },
      { id: "z1", assetId: AZ, name: "eth0", portType: "NETWORK", position: 1, throughPortId: null },
    ];
    const conns = [
      { id: "c1", clientId: A, connectionType: "Cat6", cableLength: 2, cableColour: "blue", status: "ACTIVE", label: null, fromPortId: "x1", toPortId: "pf", fromAssetId: AX, toAssetId: PAN },
      { id: "c2", clientId: A, connectionType: "Cat6", cableLength: 5, cableColour: "grey", status: "ACTIVE", label: null, fromPortId: "pr", toPortId: "z1", fromAssetId: PAN, toAssetId: AZ },
    ];
    const assetLite = (id: string) => { const a = assets.find((x) => x.id === id)!; return { id: a.id, name: a.name, assetTag: a.assetTag }; };
    const scopeOk = (assetId: string, where: any) => {
      if (!where.asset?.OR) return true;
      const a = assets.find((x) => x.id === assetId)!;
      return where.asset.OR.some((o: any) => (o.clientId !== undefined && a.clientId === o.clientId) || (o.ownerType !== undefined && a.ownerType === o.ownerType));
    };
    const self: any = {
      port: {
        findFirst: jest.fn(async ({ where }: any) => {
          const p = ports.find((x) => x.id === where.id);
          if (!p || !scopeOk(p.assetId, where)) return null;
          return { id: p.id, assetId: p.assetId, name: p.name, portType: p.portType, throughPortId: p.throughPortId };
        }),
        findUnique: jest.fn(async ({ where, include }: any) => {
          const p = ports.find((x) => x.id === where.id);
          if (!p) return null;
          const out: any = { ...p };
          if (include?.asset) out.asset = assetLite(p.assetId);
          if (include?.fromConnections) out.fromConnections = conns.filter((c) => c.fromPortId === p.id).map((c) => ({ id: c.id, connectionType: c.connectionType, cableLength: c.cableLength, cableColour: c.cableColour, status: c.status, label: c.label, toPortId: c.toPortId, toAsset: assetLite(c.toAssetId) }));
          if (include?.toConnections) out.toConnections = conns.filter((c) => c.toPortId === p.id).map((c) => ({ id: c.id, connectionType: c.connectionType, cableLength: c.cableLength, cableColour: c.cableColour, status: c.status, label: c.label, fromPortId: c.fromPortId, fromAsset: assetLite(c.fromAssetId) }));
          return out;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const ids: string[] = where.id.in;
          for (const p of ports) if (ids.includes(p.id)) Object.assign(p, data);
          return { count: ids.length };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const p = ports.find((x) => x.id === where.id)!;
          Object.assign(p, data);
          return p;
        }),
      },
      $transaction: (arg: any) => (typeof arg === "function" ? arg(self) : Promise.all(arg)),
    };
    return { self, ports };
  }

  it("setPassThrough refuses a foreign client's ports (404, no write)", async () => {
    const { self, ports } = mockPortsPrisma();
    const svc = new PortsService(self);
    await expect(svc.setPassThrough(B, "pf", "pr")).rejects.toBeInstanceOf(NotFoundException);
    expect(ports.find((p) => p.id === "pf").throughPortId).toBeNull();
  });

  it("trace refuses a foreign client's port (404)", async () => {
    const { self } = mockPortsPrisma();
    const svc = new PortsService(self);
    await expect(svc.trace(B, "x1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("owner pairs front↔rear symmetrically", async () => {
    const { self, ports } = mockPortsPrisma();
    const svc = new PortsService(self);
    await expect(svc.setPassThrough(A, "pf", "pr")).resolves.toEqual({ ok: true });
    expect(ports.find((p) => p.id === "pf").throughPortId).toBe("pr");
    expect(ports.find((p) => p.id === "pr").throughPortId).toBe("pf");
  });

  it("owner traces end-to-end across the panel (X → panel → Z)", async () => {
    const { self } = mockPortsPrisma();
    const svc = new PortsService(self);
    await svc.setPassThrough(A, "pf", "pr");
    const trace = await svc.trace(A, "x1");
    // Node order: start X/x1 → panel front → (through) panel rear → Z/z1.
    expect(trace.nodes.map((n: any) => `${n.assetTag}:${n.portName}`)).toEqual([
      "X:Gi0/1", "PAN:front-1", "PAN:rear-1", "Z:eth0",
    ]);
    // Segments between them: cable, pass-through, cable.
    expect(trace.segments.map((s: any) => s.type)).toEqual(["cable", "through", "cable"]);
    expect(trace.segments[0]).toMatchObject({ connectionType: "Cat6", cableLength: 2, cableColour: "blue" });
    expect(trace.truncated).toBe(false);
  });

  it("trace from the far end (Z) yields the reverse path", async () => {
    const { self } = mockPortsPrisma();
    const svc = new PortsService(self);
    await svc.setPassThrough(A, "pf", "pr");
    const trace = await svc.trace(A, "z1");
    expect(trace.nodes.map((n: any) => n.assetTag)).toEqual(["Z", "PAN", "PAN", "X"]);
  });
});
