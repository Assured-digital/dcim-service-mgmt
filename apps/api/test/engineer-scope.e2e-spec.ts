import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { applyAssignedScope } from "../src/auth/role-scope";
import { TasksService } from "../src/tasks/tasks.service";

// Behavioural proof of the ENGINEER "assigned to me" scope (rule A). Two layers:
//   1. the pure applyAssignedScope helper — the single source of truth for the rule;
//   2. the real TasksService.list/getForClient driven against a fixture-backed mock
//      Prisma that HONOURS the `where` it is handed (so it filters rows exactly as the
//      DB would). Tasks is the representative type — all six share the same helper, so
//      the where-construction proven here is identical across SR / Incident / Change /
//      Risk / Issue. No database: the mock re-implements just enough query semantics.

type Row = {
  id: string;
  clientId: string;
  assigneeId: string | null;
  title: string;
  status: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: null;
};

const CLIENT = "c1";
const ENG1 = "eng-1";
const ENG2 = "eng-2";

function makeRows(): Row[] {
  const t = new Date("2026-01-01T00:00:00.000Z");
  const base = { clientId: CLIENT, title: "x", status: "OPEN", createdById: null, createdAt: t, updatedAt: t, assignee: null };
  return [
    { id: "t-a", assigneeId: ENG1, ...base },
    { id: "t-b", assigneeId: ENG1, ...base },
    { id: "t-c", assigneeId: ENG2, ...base }
  ];
}

// A row satisfies a Prisma `where` if every defined scalar key matches. `undefined`
// values are ignored (Prisma treats them as "no constraint"), and createdAt (a range
// object or undefined) is irrelevant to these fixtures, so it is skipped.
function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || key === "createdAt") continue;
    if ((row as Record<string, unknown>)[key] !== value) return false;
  }
  return true;
}

function mockPrisma(rows: Row[]): any {
  return {
    task: {
      findMany: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))),
      findFirst: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id);
        return { ...r, ...data, assignee: null, incident: null };
      })
    },
    // getForClient grafts links/attachments after the row is found — empty is fine here.
    recordLink: { findMany: jest.fn(async () => []) },
    attachment: { findMany: jest.fn(async () => []) },
    auditEvent: { create: jest.fn(async () => ({})) }
  };
}

describe("applyAssignedScope (rule A — the shared helper)", () => {
  it("adds assigneeId = userId for ENGINEER", () => {
    expect(applyAssignedScope({ clientId: CLIENT }, { role: Role.ENGINEER, userId: ENG1 })).toEqual({
      clientId: CLIENT,
      assigneeId: ENG1
    });
  });

  it.each([Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.CLIENT_VIEWER])(
    "leaves the where unchanged for %s",
    (role) => {
      const where = { clientId: CLIENT };
      const out = applyAssignedScope(where, { role, userId: "someone" });
      expect(out).toEqual({ clientId: CLIENT });
      expect("assigneeId" in out).toBe(false);
    }
  );

  it("an ENGINEER cannot widen scope: a query assigneeId is overridden with their own id", () => {
    const out = applyAssignedScope({ clientId: CLIENT, assigneeId: ENG2 }, { role: Role.ENGINEER, userId: ENG1 });
    expect(out.assigneeId).toBe(ENG1);
  });
});

describe("TasksService scoping (rule A — list + detail)", () => {
  let svc: TasksService;
  let rows: Row[];

  beforeEach(() => {
    rows = makeRows();
    svc = new TasksService(mockPrisma(rows), { statusChanged() {}, assigned() {} } as any);
  });

  it("ENGINEER list returns ONLY their own records", async () => {
    const out = await svc.listForClient(CLIENT, { role: Role.ENGINEER, userId: ENG1 });
    expect(out.map((r) => r.id).sort()).toEqual(["t-a", "t-b"]);
    expect(out.every((r) => r.assigneeId === ENG1)).toBe(true);
  });

  it("a non-ENGINEER (SERVICE_MANAGER) list returns the FULL client set", async () => {
    const out = await svc.listForClient(CLIENT, { role: Role.SERVICE_MANAGER, userId: "sm" });
    expect(out.map((r) => r.id).sort()).toEqual(["t-a", "t-b", "t-c"]);
  });

  it("ENGINEER opening a record NOT assigned to them by id → 404 (detail is scoped too)", async () => {
    await expect(svc.getForClient(CLIENT, "t-c", { role: Role.ENGINEER, userId: ENG1 })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("ENGINEER can open a record assigned to them", async () => {
    const rec = await svc.getForClient(CLIENT, "t-a", { role: Role.ENGINEER, userId: ENG1 });
    expect(rec.id).toBe("t-a");
  });

  it("a non-ENGINEER can open ANY in-client record by id", async () => {
    const rec = await svc.getForClient(CLIENT, "t-c", { role: Role.SERVICE_MANAGER, userId: "sm" });
    expect(rec.id).toBe("t-c");
  });
});

describe("TasksService assignee lock (rule B — ENGINEER cannot reassign)", () => {
  let svc: TasksService;

  beforeEach(() => {
    svc = new TasksService(mockPrisma(makeRows()), { statusChanged() {}, assigned() {} } as any);
  });

  it("ENGINEER changing the assignee on update → 403", async () => {
    await expect(
      svc.updateForClient(CLIENT, "t-a", ENG1, { assigneeId: ENG2 }, { role: Role.ENGINEER, userId: ENG1 })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("ENGINEER editing other fields (no assignee change) succeeds", async () => {
    const out = await svc.updateForClient(CLIENT, "t-a", ENG1, { title: "renamed" }, { role: Role.ENGINEER, userId: ENG1 });
    expect(out.id).toBe("t-a");
  });

  it("ENGINEER re-submitting the SAME assignee (full-record PATCH echo) is allowed", async () => {
    const out = await svc.updateForClient(CLIENT, "t-a", ENG1, { assigneeId: ENG1 }, { role: Role.ENGINEER, userId: ENG1 });
    expect(out.id).toBe("t-a");
  });

  it("a non-ENGINEER (SERVICE_MANAGER) CAN reassign — the lock is ENGINEER-only", async () => {
    const out = await svc.updateForClient(CLIENT, "t-a", "sm", { assigneeId: ENG2 }, { role: Role.SERVICE_MANAGER, userId: "sm" });
    expect(out.id).toBe("t-a");
  });
});
