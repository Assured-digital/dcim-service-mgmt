import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { FieldChange } from "./diff-record";

// Single writer for audit events — the ONE place that shapes the `data` JSON, so every
// service emits the same structure. NOT injectable (a plain function taking the prisma
// client), mirroring the resolver-helper pattern (resolveCreator / resolveLinkedRecords).
//
// Unified data shape (all keys optional, present-only-when-set):
//   { changes?: FieldChange[], comment?: string, reference?: string, title?: string }
// Consumed by the 1c frontend humaniser. `changes` carries humanised from/to snapshots
// resolved at emit time, so a history line survives later renames.

export type EmitAuditInput = {
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string | null;
  clientId: string | null;
  changes?: FieldChange[];
  comment?: string | null;
  reference?: string | null;
  title?: string | null;
};

export async function emitAudit(prisma: PrismaService, input: EmitAuditInput): Promise<void> {
  const data: Record<string, unknown> = {};
  if (input.changes && input.changes.length) data.changes = input.changes;
  if (input.comment != null && input.comment !== "") data.comment = input.comment;
  if (input.reference != null) data.reference = input.reference;
  if (input.title != null) data.title = input.title;

  await prisma.auditEvent.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorUserId: input.actorUserId,
      clientId: input.clientId,
      data: data as Prisma.InputJsonValue
    }
  });
}
