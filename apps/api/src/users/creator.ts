import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

// Minimal creator projection — name fields + email are selected only to COMPUTE
// displayName. The returned shape exposes id + displayName ONLY (no email, role,
// isActive, or client assignments leak to the caller).
const creatorPickSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  firstName: true,
  lastName: true,
  knownAs: true,
  email: true
});

export type CreatorView = { id: string; displayName: string };

// Resolves a record's creator (by createdById) to { id, displayName } for the
// "Submitted by" field on detail pages. displayName follows the same convention
// as the assignee picker (users.service toAssignableView): knownAs -> "First Last"
// -> email. Returns null when there is no creator id or the user no longer exists.
export async function resolveCreator(
  prisma: PrismaService,
  userId: string | null | undefined
): Promise<CreatorView | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: creatorPickSelect });
  if (!u) return null;
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  const displayName = u.knownAs?.trim() || fullName || u.email;
  return { id: u.id, displayName };
}
