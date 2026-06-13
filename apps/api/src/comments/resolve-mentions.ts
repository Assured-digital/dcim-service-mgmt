import { PrismaService } from "../prisma/prisma.service";
import { assignableUserWhere } from "../users/assignable-scope";

// @-mention validation for comment writes. A mention is an opaque
// (targetType, targetId) pointer (mirrors RecordLink — no typed FK). Phase 1
// supports targetType "user" only.
//
// Validation discipline mirrors resolve-comment-scope / record-links: validate
// every target IN-SCOPE before writing. A user mention is valid iff the target
// is an ASSIGNABLE user within the actor's client scope — the exact same filter
// the assignee picker uses (assignableUserWhere), so a client-scoped actor can
// never mention a user outside their tenant.
//
// Invalid / out-of-scope / unknown targets are DROPPED (not rejected): a stale
// or cross-tenant mention should never block an otherwise-valid comment. Only
// the surviving valid mentions are returned for writing.

export type MentionInput = { targetType: string; targetId: string };

export async function resolveValidMentions(
  prisma: PrismaService,
  clientId: string,
  authorId: string,
  mentions: MentionInput[] | undefined
): Promise<MentionInput[]> {
  if (!mentions?.length) return [];

  // Phase 1: only user mentions are validated/persisted. Other target types are
  // dropped until a later phase adds them.
  const userIds = [
    ...new Set(
      mentions.filter((m) => m.targetType === "user").map((m) => m.targetId)
    )
  ];
  if (!userIds.length) return [];

  // Derive the org from the actor (authoritative — no JWT trust). The scoped
  // clientId was already validated against this org by resolveClientScope.
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { organizationId: true }
  });
  if (!author?.organizationId) return []; // misconfigured actor → no valid mentions

  const valid = await prisma.user.findMany({
    where: { ...assignableUserWhere(author.organizationId, clientId), id: { in: userIds } },
    select: { id: true }
  });

  return valid.map((u) => ({ targetType: "user", targetId: u.id }));
}
