import { PrismaService } from "../prisma/prisma.service";
import { computeDisplayName, userDisplaySelect, type UserDisplay } from "./display";

export type CreatorView = UserDisplay;

// Resolves a record's creator (by createdById) to { id, displayName } for the
// "Submitted by" field on detail pages. displayName follows the shared convention
// (knownAs -> "First Last" -> email; see users/display.ts). Returns null when there
// is no creator id or the user no longer exists.
export async function resolveCreator(
  prisma: PrismaService,
  userId: string | null | undefined
): Promise<CreatorView | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: userDisplaySelect });
  if (!u) return null;
  return { id: u.id, displayName: computeDisplayName(u) };
}
