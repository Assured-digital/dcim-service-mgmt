import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Tenant-scope resolution for comments. A comment has no clientId of its own — it
// inherits the tenant of the parent entity it is attached to. This closes the
// isolation gap: comments were previously queried by (entityType, entityId) with
// NO clientId filter, so a guessed entityId pointing at another client's record
// leaked that record's comments. Every comment read/write now verifies the parent
// entity belongs to the scoped client first.
//
// Mirrors the resolve-links.ts polymorphic resolver: one switch, every branch
// scoped by clientId via the established where:{ id, clientId } pattern, so a
// record from another client can never be resolved into the current scope. For the
// nullable-clientId types (Risk / Issue / Asset) a concrete clientId in the where
// also excludes null-client (internal) rows — the same safety choice resolve-links
// already makes.
//
// entityType is the Comment vocabulary (PascalCase model names), which differs from
// the record-links snake_case vocabulary. The frontend only ever sends the six
// work-item types below; "Survey" (no model) and any other value are denied.

async function entityBelongsToClient(
  prisma: PrismaService,
  clientId: string,
  entityType: string,
  entityId: string
): Promise<boolean> {
  const where = { id: entityId, clientId };
  switch (entityType) {
    case "Incident":
      return (await prisma.incident.count({ where })) > 0;
    case "ServiceRequest":
      return (await prisma.serviceRequest.count({ where })) > 0;
    case "ChangeRequest":
      return (await prisma.changeRequest.count({ where })) > 0;
    case "Task":
      return (await prisma.task.count({ where })) > 0;
    case "Risk":
      return (await prisma.risk.count({ where })) > 0;
    case "Issue":
      return (await prisma.issue.count({ where })) > 0;
    case "Asset":
      return (await prisma.asset.count({ where })) > 0;
    default:
      // Unknown / non-scopable entityType (e.g. legacy "Survey", which has no
      // model). No tenant table to validate against — deny.
      return false;
  }
}

// Throws Forbidden unless the parent entity exists within the scoped client. Call
// before any comment read or write keyed by (entityType, entityId).
export async function assertEntityInScope(
  prisma: PrismaService,
  clientId: string,
  entityType: string,
  entityId: string
): Promise<void> {
  if (!clientId) throw new ForbiddenException("Missing client scope");
  const ok = await entityBelongsToClient(prisma, clientId, entityType, entityId);
  if (!ok) throw new ForbiddenException("Entity not found in this client");
}
