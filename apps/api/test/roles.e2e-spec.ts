import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Role } from "@prisma/client";
import * as jwt from "jsonwebtoken";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

// Role × endpoint guard matrix. This asserts the SERVER-SIDE role guard, not tenant
// scope: a token for a disallowed role must be rejected with 403 by RolesGuard, which
// runs BEFORE any controller body / DB call. So no database is needed — PrismaService
// is overridden with a no-op. (A disallowed role can never reach the code that would
// touch Prisma; an allowed role passes the guard and then fails downstream on the
// no-op mock, which is fine — we only assert the authorization boundary here.)

// A Proxy that answers every property access with another callable no-op proxy, and
// every call with Promise<undefined>. Stands in for PrismaService so the module boots
// without a real DB and never $connects.
function noopPrisma(): any {
  const fn: any = () => Promise.resolve(undefined);
  return new Proxy(fn, {
    get: (_t, prop) => {
      // Must NOT look like a thenable, or `await prisma` (during Nest init) hangs forever
      // waiting on a `then` that never calls resolve.
      if (prop === "then" || typeof prop === "symbol") return undefined;
      return noopPrisma();
    },
    apply: () => Promise.resolve(undefined)
  });
}

const SECRET = process.env.JWT_SECRET as string;
function token(role: Role): string {
  return jwt.sign(
    { userId: `user-${role}`, email: `${role}@test.local`, role, organizationId: "org-test" },
    SECRET
  );
}

type Case = { method: "get" | "post" | "patch" | "put" | "delete"; path: string; label: string };

// Sensitive endpoints an ENGINEER (and the other listed roles) must NOT be able to call.
// Path params are arbitrary — the role guard fires before they are read.
const FORBIDDEN_FOR_ENGINEER: Case[] = [
  { method: "get", path: "/users", label: "list users" },
  { method: "post", path: "/users", label: "create user" },
  { method: "patch", path: "/users/x", label: "update user" },
  { method: "get", path: "/clients", label: "list clients" },
  { method: "post", path: "/clients", label: "create client" },
  { method: "patch", path: "/clients/x", label: "update client" },
  { method: "post", path: "/work-packages", label: "create work package" },
  { method: "get", path: "/audit-events", label: "forensic audit list" },
  { method: "get", path: "/overview", label: "org overview" },
  { method: "post", path: "/changes/x/approve", label: "approve change" },
  { method: "post", path: "/checks/x/approve", label: "approve check" },
  { method: "get", path: "/triage/queue", label: "triage queue" },
  { method: "post", path: "/sites", label: "create site (hardened)" },
  // New asset-deletion rules — ENGINEER cannot delete directly nor act as approver:
  { method: "delete", path: "/assets/x", label: "direct delete asset (hardened)" },
  { method: "get", path: "/assets/deletion-requests", label: "deletion approver queue" },
  { method: "post", path: "/assets/x/deletion-request/approve", label: "approve deletion" },
  { method: "post", path: "/assets/x/deletion-request/reject", label: "reject deletion" }
];

describe("Role × endpoint guard matrix", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(noopPrisma())
      .compile();
    // logger off: an allowed role passing the guard then fails on the no-op Prisma,
    // which Nest would log as an ERROR — expected noise, silenced for clean output.
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const send = (c: Case, role: Role) =>
    request(app.getHttpServer())[c.method](c.path).set("Authorization", `Bearer ${token(role)}`);

  describe("ENGINEER is forbidden from admin / approver / hardened endpoints", () => {
    it.each(FORBIDDEN_FOR_ENGINEER.map((c) => [`${c.method.toUpperCase()} ${c.path} (${c.label})`, c] as const))(
      "%s → 403",
      async (_label, c) => {
        const res = await send(c, Role.ENGINEER);
        expect(res.status).toBe(403);
      }
    );
  });

  it("CLIENT_VIEWER cannot raise a deletion request → 403", async () => {
    const res = await send(
      { method: "post", path: "/assets/x/deletion-request", label: "request deletion" },
      Role.CLIENT_VIEWER
    );
    expect(res.status).toBe(403);
  });

  it("SERVICE_DESK_ANALYST is also blocked from direct asset delete → 403", async () => {
    const res = await send({ method: "delete", path: "/assets/x", label: "direct delete" }, Role.SERVICE_DESK_ANALYST);
    expect(res.status).toBe(403);
  });

  // Positive control: ENGINEER IS allowed to reach the request endpoint — the role guard
  // lets it through (the request then fails downstream on the no-op Prisma, NOT with 403).
  it("ENGINEER may reach the deletion-request endpoint (guard passes, not 403)", async () => {
    const res = await send(
      { method: "post", path: "/assets/x/deletion-request", label: "request deletion" },
      Role.ENGINEER
    );
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  // ENGINEER now has a SCOPED Service Desk view, so the four read endpoints behind it must
  // admit ENGINEER at the guard. (This asserts only the authorization boundary; the per-row
  // "only my assigned records" scoping is proven behaviourally in engineer-scope.e2e-spec.)
  describe("ENGINEER is admitted to the Service Desk read endpoints (guard passes, not 403)", () => {
    const READ_ENDPOINTS: Case[] = [
      { method: "get", path: "/service-requests", label: "list service requests" },
      { method: "get", path: "/incidents", label: "list incidents" },
      { method: "get", path: "/changes", label: "list changes" },
      { method: "get", path: "/tasks", label: "list tasks" }
    ];
    it.each(READ_ENDPOINTS.map((c) => [`${c.method.toUpperCase()} ${c.path} (${c.label})`, c] as const))(
      "%s → not 403",
      async (_label, c) => {
        const res = await send(c, Role.ENGINEER);
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      }
    );
  });
});
